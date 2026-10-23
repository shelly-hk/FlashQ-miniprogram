package com.flashq.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.common.JevDecision;
import com.flashq.service.JevDecisionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Jev 决策模型实现（腾讯云 EdgeOne Makers · TypeSafe System One）
 *
 * Jev 不生成文本，只对 state（待判断内容）并行求值一组强类型问题，
 * 直接返回结构化结果。文档：https://cloud.tencent.com/document/product/1552/138731
 *
 * 决策内容（已按真实样本校准，2026-10）：
 * - suitable    noul   "内容是否包含足够知识点可出题"（yes 的概率）
 * - density     score  信息密度 0~4 分档
 * - count_tier  choice 出题量级 少量/适中/大量
 * - difficulty  choice 建议难度 简单/中等/困难
 *
 * 降级原则：Jev 未启用、未配 Key、超时或任何异常，都返回降级决策，
 * 由调用方走原逻辑——决策服务不可用绝不能打断出题主流程。
 */
@Service
public class JevDecisionServiceImpl implements JevDecisionService {

    private static final Logger log = LoggerFactory.getLogger(JevDecisionServiceImpl.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.jev.enabled:true}")
    private boolean enabled;

    @Value("${app.jev.shadow-mode:true}")
    private boolean shadowMode;

    @Value("${app.jev.api-url:https://ai-gateway.edgeone.link/v1/systemone}")
    private String apiUrl;

    @Value("${app.jev.api-key:}")
    private String apiKey;

    @Value("${app.jev.model:@makers/jev}")
    private String model;

    @Value("${app.jev.connect-timeout-ms:4000}")
    private int connectTimeoutMs;

    @Value("${app.jev.read-timeout-ms:8000}")
    private int readTimeoutMs;

    @Value("${app.jev.min-suitable-noul:0.5}")
    private double minSuitableNoul;

    @Value("${app.jev.min-density-score:1.0}")
    private double minDensityScore;

    // 出题量级 → 题数区间（Jev 只分档不精确计数；区间让 LLM 按实际信息量落点，避免凑数）
    @Value("${app.jev.count-few-min:1}")
    private int countFewMin;

    @Value("${app.jev.count-few-max:5}")
    private int countFewMax;

    @Value("${app.jev.count-medium-min:6}")
    private int countMediumMin;

    @Value("${app.jev.count-medium-max:15}")
    private int countMediumMax;

    @Value("${app.jev.count-many-min:20}")
    private int countManyMin;

    @Value("${app.jev.count-many-max:30}")
    private int countManyMax;

    /** state 文本截断长度：判断不需要全文，控制 token 消耗 */
    private static final int STATE_TEXT_MAX_LEN = 2000;

    @Override
    public JevDecision decide(String textContent, int charCount, String sourceType) {
        if (!enabled) {
            return JevDecision.degraded();
        }
        if (apiKey == null || apiKey.isEmpty()) {
            log.warn("Jev API Key 未配置（app.jev.api-key），跳过决策，降级走原逻辑");
            return JevDecision.degraded();
        }

        String stateText = textContent.length() > STATE_TEXT_MAX_LEN
                ? textContent.substring(0, STATE_TEXT_MAX_LEN) : textContent;

        try {
            Map<String, Object> requestBody = buildRequestBody(stateText, charCount, sourceType);
            Map<String, Object> response = callJevApi(requestBody);
            JevDecision decision = parseDecision(response);

            if (shadowMode) {
                // shadow 模式：先打日志记录真实判断值，再清除注入字段（不拦截、不注入题数/难度）
                log.info("Jev决策(shadow未生效): suitable={}, density={}, 量级={}, 难度={}, 建议题数={}-{}",
                        decision.getSuitableNoul(), decision.getDensityScore(),
                        decision.getCountTier(), decision.getDifficulty(),
                        decision.getQuestionCountMin(), decision.getQuestionCountMax());
                decision.setShadow(true);
                decision.setShouldGenerate(true);
                decision.setQuestionCountMin(0);
                decision.setQuestionCountMax(0);
                decision.setDifficulty(null);
            }
            return decision;
        } catch (Exception e) {
            log.warn("Jev决策调用失败，降级走原逻辑: {}", e.getMessage());
            return JevDecision.degraded();
        }
    }

    // ==================== 请求组装 ====================

    private Map<String, Object> buildRequestBody(String text, int charCount, String sourceType) {
        Map<String, Object> state = new LinkedHashMap<>();
        state.put("text", text);
        state.put("char_count", charCount);
        state.put("source", sourceType != null ? sourceType : "unknown");

        Map<String, Object> questions = new LinkedHashMap<>();

        Map<String, Object> suitable = new LinkedHashMap<>();
        suitable.put("type", "noul");
        suitable.put("instructions", "这段内容是否包含足够的事实性知识，可以用来生成有意义的问答题");
        suitable.put("criteria", Map.of(
                "yes", "有明确知识点可出题",
                "no", "内容空洞、无知识点或只是寒暄"
        ));
        questions.put("suitable", suitable);

        Map<String, Object> density = new LinkedHashMap<>();
        density.put("type", "score");
        density.put("instructions", "按内容的信息密度与可考性评分");
        density.put("criteria", List.of(
                "几乎无知识点",
                "零散知识点，出不了几题",
                "适量知识点",
                "知识点较丰富",
                "高密度知识点"
        ));
        questions.put("density", density);

        Map<String, Object> countTier = new LinkedHashMap<>();
        countTier.put("type", "choice");
        countTier.put("instructions", "基于内容量与信息密度，推荐生成的题目量级");
        countTier.put("criteria", Map.of(
                "少量", "内容少或浅，1-5题",
                "适中", "中等信息量，6-19题",
                "大量", "信息量大且密度高，20-30题"
        ));
        questions.put("count_tier", countTier);

        Map<String, Object> difficulty = new LinkedHashMap<>();
        difficulty.put("type", "choice");
        difficulty.put("instructions", "推荐的主要难度");
        difficulty.put("criteria", Map.of(
                "简单", "常识性内容",
                "中等", "需要理解记忆",
                "困难", "需要深度推理或专业知识"
        ));
        questions.put("difficulty", difficulty);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("model", model);
        body.put("state", state);
        body.put("questions", questions);
        return body;
    }

    // ==================== HTTP 调用 ====================

    /**
     * 调用 Jev System One 接口。
     * 沿用 WxSecurityServiceImpl 的 HttpURLConnection 模式（避免框架自动添加 header 的兼容问题）。
     */
    @SuppressWarnings("unchecked")
    private Map<String, Object> callJevApi(Map<String, Object> requestBody) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(apiUrl).openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("Authorization", "Bearer " + apiKey);
        conn.setDoOutput(true);
        conn.setConnectTimeout(connectTimeoutMs);
        conn.setReadTimeout(readTimeoutMs);

        String jsonBody = objectMapper.writeValueAsString(requestBody);
        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
        }

        int code = conn.getResponseCode();
        InputStream is = (code >= 200 && code < 300) ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) {
            throw new IOException("Jev API 无响应体, HTTP " + code);
        }
        StringBuilder resp = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                resp.append(line);
            }
        }
        if (code != 200) {
            throw new IOException("Jev API HTTP " + code + ": " + resp);
        }
        return objectMapper.readValue(resp.toString(), new TypeReference<>() {});
    }

    // ==================== 结果解析与阈值映射 ====================

    @SuppressWarnings("unchecked")
    private JevDecision parseDecision(Map<String, Object> response) {
        Map<String, Object> answers = (Map<String, Object>) response.get("answers");
        if (answers == null) {
            throw new IllegalStateException("Jev 响应缺少 answers 字段: " + response);
        }

        JevDecision decision = new JevDecision();
        decision.setAvailable(true);

        Map<String, Object> suitable = (Map<String, Object>) answers.get("suitable");
        if (suitable != null && suitable.get("noul") instanceof Number n) {
            decision.setSuitableNoul(n.doubleValue());
        }

        Map<String, Object> density = (Map<String, Object>) answers.get("density");
        if (density != null && density.get("score") instanceof Number n) {
            decision.setDensityScore(n.doubleValue());
        }

        Map<String, Object> countTier = (Map<String, Object>) answers.get("count_tier");
        if (countTier != null) {
            decision.setCountTier((String) countTier.get("choice"));
        }

        Map<String, Object> difficulty = (Map<String, Object>) answers.get("difficulty");
        if (difficulty != null) {
            decision.setDifficulty((String) difficulty.get("choice"));
        }

        // 拦截判断：不适合出题 或 密度过低 → 不出题
        // （阈值已按真实样本校准：正常内容 0.93/3.13，垃圾内容 0.03/0）
        if (decision.getSuitableNoul() < minSuitableNoul || decision.getDensityScore() < minDensityScore) {
            decision.setShouldGenerate(false);
            decision.setReason("内容信息量不足，难以生成高质量题目");
        } else {
            decision.setShouldGenerate(true);
        }

        applyCountRange(decision);
        return decision;
    }

    /**
     * 量级 → 题数区间映射（Jev 擅长分档不精确计数；区间让 LLM 按实际信息量落点，避免凑数）
     */
    private void applyCountRange(JevDecision decision) {
        String tier = decision.getCountTier();
        if ("少量".equals(tier)) {
            decision.setQuestionCountMin(countFewMin);
            decision.setQuestionCountMax(countFewMax);
        } else if ("适中".equals(tier)) {
            decision.setQuestionCountMin(countMediumMin);
            decision.setQuestionCountMax(countMediumMax);
        } else if ("大量".equals(tier)) {
            decision.setQuestionCountMin(countManyMin);
            decision.setQuestionCountMax(countManyMax);
        }
    }
}
