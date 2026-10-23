package com.flashq.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.entity.CustomQuestion;
import com.flashq.entity.UploadRecord;
import com.flashq.mapper.CustomQuestionMapper;
import com.flashq.mapper.UploadRecordMapper;
import com.flashq.service.AgentService;
import com.flashq.common.ContentRiskException;
import com.flashq.common.JevDecision;
import com.flashq.service.JevDecisionService;
import com.flashq.service.WxSecurityService;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.core.ParameterizedTypeReference;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.regex.Pattern;

@Service
public class AgentServiceImpl implements AgentService {

    private static final Logger log = LoggerFactory.getLogger(AgentServiceImpl.class);

    private final UploadRecordMapper uploadRecordMapper;
    private final CustomQuestionMapper customQuestionMapper;
    private final WxSecurityService wxSecurityService;
    private final JevDecisionService jevDecisionService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.upload.agent-max-questions:20}")
    private int maxQuestions;

    @Value("${app.upload.agent-min-questions:5}")
    private int minQuestions;

    @Value("${app.ai.api-url:}")
    private String aiApiUrl;

    @Value("${app.ai.api-key:}")
    private String aiApiKey;

    @Value("${app.ai.model:deepseek-chat}")
    private String aiModel;

    // PaddleOCR 本地服务配置
    @Value("${app.ocr.enabled:false}")
    private boolean ocrEnabled;

    @Value("${app.ocr.server-url:http://localhost:8866}")
    private String ocrServerUrl;

    @Value("${app.ocr.connect-timeout-ms:5000}")
    private int ocrConnectTimeoutMs;

    @Value("${app.ocr.read-timeout-ms:60000}")
    private int ocrReadTimeoutMs;

    @Value("${app.ocr.health-timeout-ms:2000}")
    private int ocrHealthTimeoutMs;

    // OCR 健康检查结果缓存：OCR 崩溃期间避免反复探测拖慢请求
    // 记录上次探测时间 + 是否可用，3 秒内复用结果
    private volatile boolean ocrHealthy = true;
    private volatile long ocrHealthCheckedAt = 0;
    private static final long OCR_HEALTH_CACHE_MS = 3000;

    public AgentServiceImpl(UploadRecordMapper uploadRecordMapper,
                            CustomQuestionMapper customQuestionMapper,
                            WxSecurityService wxSecurityService,
                            JevDecisionService jevDecisionService) {
        this.uploadRecordMapper = uploadRecordMapper;
        this.customQuestionMapper = customQuestionMapper;
        this.wxSecurityService = wxSecurityService;
        this.jevDecisionService = jevDecisionService;
    }

    @Override
    @Async
    public void processUploadAsync(Integer uploadRecordId) {
        processUploadAsync(uploadRecordId, null);
    }

    @Override
    @Async
    public void processUploadAsync(Integer uploadRecordId, Integer categoryId) {
        UploadRecord record = uploadRecordMapper.findById(uploadRecordId);
        if (record == null) {
            log.error("上传记录不存在: {}", uploadRecordId);
            return;
        }

        try {
            // Step 1: 提取文件文本内容
            String textContent = extractText(record.getFilePath(), record.getFileType());

            if (textContent == null || textContent.trim().isEmpty()) {
                markFailed(record, "文件内容为空或无法识别");
                return;
            }

            // 记录原始字数（Jev 出题量级判断需要真实内容量，下面的截断会丢失该信息）
            int originalLength = textContent.length();

            // 截取前4000字符，避免超出AI上下文限制
            if (textContent.length() > 4000) {
                textContent = textContent.substring(0, 4000);
            }

            // Step 1.5: 微信内容安全审核（msg_sec_check）
            // 说明：此前还有一层本地敏感词预检，因高频误杀（如"专制"/"暴政"出现在合法历史课件中）
            //       已于 2026-10 移除，统一交给微信按上下文语义判断，零误杀且覆盖更全
            try {
                wxSecurityService.checkText(textContent);
            } catch (ContentRiskException e) {
                markFailed(record, e.getMessage());
                log.warn("上传记录 {} 微信内容审核不通过：{}", uploadRecordId, e.getMessage());
                return;
            }

            // Step 1.6: Jev 出题前置决策（内容是否适合出题 / 出题量级 / 难度）
            // Jev 不可用时返回降级决策（available=false），自动走原逻辑，不打断出题流程
            JevDecision decision = jevDecisionService.decide(textContent, originalLength, record.getFileType());
            if (!decision.isShouldGenerate()) {
                markFailed(record, decision.getReason());
                log.warn("上传记录 {} Jev决策拦截不出题: suitable={}, density={}",
                        uploadRecordId, decision.getSuitableNoul(), decision.getDensityScore());
                return;
            }
            if (decision.isAvailable()) {
                log.info("上传记录 {} Jev决策通过: suitable={}, density={}, 量级={}, 难度={}, 建议题数={}-{}{}",
                        uploadRecordId, decision.getSuitableNoul(), decision.getDensityScore(),
                        decision.getCountTier(), decision.getDifficulty(),
                        decision.getQuestionCountMin(), decision.getQuestionCountMax(),
                        decision.isShadow() ? " (shadow模式未生效)" : "");
            }

            // Step 2: 调用AI生成题目
            // shadow 模式下 decision 不注入题数/难度（区间为 0、difficulty=null），prompt 自动走原逻辑
            List<CustomQuestion> questions = generateQuestions(textContent, record, decision);

            if (questions.isEmpty()) {
                markFailed(record, "AI未能从文件内容中生成有效题目");
                return;
            }

            // 为每道题设置 categoryId
            for (CustomQuestion q : questions) {
                q.setCategoryId(categoryId);
            }

            // Step 3: 批量插入自主题库
            for (CustomQuestion q : questions) {
                customQuestionMapper.insert(q);
            }

            // 更新记录状态为成功
            record.setStatus(1);
            record.setQuestionCount(questions.size());
            record.setFailReason(null);
            uploadRecordMapper.updateStatus(record);

            log.info("上传记录 {} 解析成功，生成 {} 道题", uploadRecordId, questions.size());

        } catch (Exception e) {
            log.error("上传记录 {} 解析失败: {}", uploadRecordId, e.getMessage(), e);
            markFailed(record, "解析异常: " + e.getMessage());
        }
    }

    // ==================== 文件内容提取 ====================

    /**
     * 提取文件文本内容（根据扩展名分发）
     */
    private String extractText(String filePath, String fileType) {
        File file = new File(filePath);
        if (!file.exists()) {
            return null;
        }

        String ext = filePath.substring(filePath.lastIndexOf('.') + 1).toLowerCase();

        try {
            switch (ext) {
                case "txt":
                    return readTextFile(file);
                case "pdf":
                    return readPdfFile(file);
                case "doc":
                case "docx":
                    return readWordFile(file);
                case "jpg":
                case "jpeg":
                case "png":
                case "webp":
                    return readImageByOcr(file);
                default:
                    return null;
            }
        } catch (Exception e) {
            log.error("提取文件内容失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 读取 txt 文件
     */
    private String readTextFile(File file) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new FileReader(file, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
        }
        return sb.toString();
    }

    /**
     * 读取 PDF 文件（使用 Apache PDFBox 3.x）
     */
    private String readPdfFile(File file) {
        try {
            byte[] data = Files.readAllBytes(file.toPath());
            try (PDDocument document = Loader.loadPDF(data)) {
                PDFTextStripper stripper = new PDFTextStripper();
                return stripper.getText(document);
            }
        } catch (Exception e) {
            log.error("PDF解析失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 读取 Word 文件 docx（使用 Apache POI）
     */
    private String readWordFile(File file) {
        String ext = file.getName().substring(file.getName().lastIndexOf('.') + 1).toLowerCase();

        if ("docx".equals(ext)) {
            return readDocxFile(file);
        } else {
            return readOldDocFile(file);
        }
    }

    /**
     * 读取 .docx 格式（Office 2007+）
     */
    private String readDocxFile(File file) {
        StringBuilder sb = new StringBuilder();
        try (FileInputStream fis = new FileInputStream(file);
             XWPFDocument doc = new XWPFDocument(fis)) {
            for (XWPFParagraph para : doc.getParagraphs()) {
                String text = para.getText();
                if (text != null && !text.isBlank()) {
                    sb.append(text).append("\n");
                }
            }
        } catch (Exception e) {
            log.error("docx解析失败: {}", e.getMessage());
            return null;
        }
        return sb.toString();
    }

    /**
     * 读取 .doc 格式（旧版 Office 97-2003）
     */
    private String readOldDocFile(File file) {
        try (FileInputStream fis = new FileInputStream(file);
             org.apache.poi.hwpf.HWPFDocument doc = new org.apache.poi.hwpf.HWPFDocument(fis)) {
            return doc.getDocumentText();
        } catch (Exception e) {
            log.error("doc解析失败: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 通过本地 PaddleOCR 服务识别图片中的文字
     * 需要先启动 ocr_server.py（PaddleOCR 轻量HTTP服务）
     */
    private String readImageByOcr(File file) {
        if (!ocrEnabled) {
            log.warn("PaddleOCR服务未启用（app.ocr.enabled=false），无法识别图片");
            return null;
        }

        // OCR 健康检查（带短超时 + 短期缓存）
        // OCR 崩溃假死时端口还在监听但完全不响应，没有这个会被卡到 readTimeout
        // 用 2 秒快速探测 /health 接口，发现不可用时直接降级返回 null
        // 同时缓存 3 秒，避免崩溃期间每个请求都重复探测拖慢整体响应
        long now = System.currentTimeMillis();
        if (now - ocrHealthCheckedAt > OCR_HEALTH_CACHE_MS) {
            boolean healthy = checkOcrHealth();
            ocrHealthy = healthy;
            ocrHealthCheckedAt = now;
            if (!healthy) {
                log.warn("PaddleOCR健康检查失败，本次跳过OCR（{}ms内不再重复探测）", OCR_HEALTH_CACHE_MS);
                return null;
            }
        } else if (!ocrHealthy) {
            // 缓存期内复用"不可用"结论
            return null;
        }

        try {
            // 读取图片字节
            byte[] imageBytes = Files.readAllBytes(file.toPath());

            // 构建 multipart 请求，发送到 Python PaddleOCR 服务
            org.springframework.core.io.ByteArrayResource imageResource =
                    new org.springframework.core.io.ByteArrayResource(imageBytes) {
                        @Override
                        public String getFilename() {
                            return file.getName();
                        }
                    };

            org.springframework.util.LinkedMultiValueMap<String, Object> multipartBody =
                    new org.springframework.util.LinkedMultiValueMap<>();
            multipartBody.add("image", imageResource);

            // 用带超时的 RestClient，避免 OCR 卡住时后端线程挂死（超时降级）
            org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                    new org.springframework.http.client.SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(ocrConnectTimeoutMs);
            factory.setReadTimeout(ocrReadTimeoutMs);

            RestClient client = RestClient.builder().requestFactory(factory).build();
            Map<String, Object> result = client.post()
                    .uri(ocrServerUrl + "/ocr")
                    .contentType(org.springframework.http.MediaType.MULTIPART_FORM_DATA)
                    .body(multipartBody)
                    .retrieve()
                    .body(new ParameterizedTypeReference<>() {});

            if (result == null) {
                return null;
            }

            Integer code = (Integer) result.get("code");
            if (code == null || code != 200) {
                String msg = (String) result.get("msg");
                log.error("PaddleOCR服务返回错误: {}", msg);
                return null;
            }

            String text = (String) result.get("text");
            log.info("PaddleOCR识别成功，共 {} 行文字", result.get("lines"));
            return text;

        } catch (org.springframework.web.client.ResourceAccessException timeoutEx) {
            // 超时降级：OCR 服务卡住或排队过长，触发读取/连接超时
            // 不让线程挂死，直接返回 null（调用方可展示"识别失败，请重试"提示）
            log.warn("OCR调用超时降级（connect={}ms read={}ms）：{}",
                    ocrConnectTimeoutMs, ocrReadTimeoutMs, timeoutEx.getMessage());
            return null;
        } catch (Exception e) {
            log.error("调用PaddleOCR服务失败（请确认 ocr_server.py 已启动）: {}", e.getMessage());
            return null;
        }
    }

    /**
     * 探测 OCR 服务是否健康（GET /health）
     * 用独立的短超时（默认 2 秒）快速失败，避免假死的服务拖慢请求
     * @return true=可用 false=不可用
     */
    private boolean checkOcrHealth() {
        try {
            org.springframework.http.client.SimpleClientHttpRequestFactory factory =
                    new org.springframework.http.client.SimpleClientHttpRequestFactory();
            factory.setConnectTimeout(ocrHealthTimeoutMs);
            factory.setReadTimeout(ocrHealthTimeoutMs);

            RestClient healthClient = RestClient.builder().requestFactory(factory).build();
            String body = healthClient.get()
                    .uri(ocrServerUrl + "/health")
                    .retrieve()
                    .body(String.class);
            return body != null;
        } catch (Exception e) {
            // 健康检查失败：端口不通、响应超时、连接被拒等
            log.warn("OCR健康检查失败（{}ms）：{}", ocrHealthTimeoutMs, e.getMessage());
            return false;
        }
    }

    // ==================== AI 出题 ====================

    /**
     * 调用AI模型生成题目
     * @param decision Jev 决策结果（可为 null 或降级决策，此时题数/难度走原逻辑）
     */
    private List<CustomQuestion> generateQuestions(String textContent, UploadRecord record, JevDecision decision) {
        List<CustomQuestion> result = new ArrayList<>();

        if (aiApiUrl == null || aiApiUrl.isEmpty()) {
            log.error("AI API 未配置 (app.ai.api-url)，无法生成题目");
            throw new RuntimeException("AI出题服务未配置，请联系管理员");
        }

        try {
            String prompt = buildPrompt(textContent, decision);
            result = callAiApi(prompt, record);
        } catch (Exception e) {
            log.error("AI生成题目失败: {}", e.getMessage(), e);
            throw new RuntimeException("AI生成题目失败: " + e.getMessage());
        }

        return result;
    }

    /**
     * 构建AI Prompt（保证"一句话"特点）
     * @param decision Jev 决策结果；null 或降级决策时题数/难度走配置的 min/max 原逻辑
     */
    private String buildPrompt(String textContent, JevDecision decision) {
        // 题数规则：Jev 给出建议区间时在区间内出题（受 maxQuestions 上限约束），否则用原 min/max 逻辑
        String countRule;
        if (decision != null && decision.getQuestionCountMax() > 0) {
            int lower = Math.min(decision.getQuestionCountMin(), maxQuestions);
            int upper = Math.min(decision.getQuestionCountMax(), maxQuestions);
            if (upper < lower) {
                upper = lower;
            }
            countRule = "1. 请生成 %d-%d 道题，根据内容实际信息量在区间内调整，信息点不足时取接近下限，不要为凑数量生成低质量题"
                    .formatted(lower, upper);
        } else {
            countRule = "1. 至少生成 %d 道题，最多不超过 %d 道。请尽量贴近上限，充分利用文本中的信息点"
                    .formatted(minQuestions, maxQuestions);
        }

        // 难度规则：Jev 给出难度建议时以该难度为主，否则均匀分布
        String difficultyRule;
        if (decision != null && decision.getDifficulty() != null) {
            String difficultyNum = switch (decision.getDifficulty()) {
                case "简单" -> "1";
                case "中等" -> "2";
                case "困难" -> "3";
                default -> "2";
            };
            difficultyRule = "8. 题目整体难度以「%s」(difficulty=%s)为主，可少量搭配其他难度"
                    .formatted(decision.getDifficulty(), difficultyNum);
        } else {
            difficultyRule = "8. 题目难度分为简单(1)、中等(2)、困难(3)，尽量均匀分布";
        }

        return """
                你是一个出题专家。请阅读以下文本内容，生成高质量的单选题。

                生成规则：
                %s
                2. 充分挖掘文本信息：每个概念、定义、数据、对比、列举、因果关系都可以单独出题
                3. 同一信息点可以从不同角度出多道题（例如：定义题、判断题、反向题、应用题）
                4. 题干必须是一句话，不超过30个字，简洁明了
                5. 每道题必须有4个选项，每个选项不超过15个字，干扰项要有合理性
                6. 必须标注唯一正确答案
                7. 每道题附带一句话解析（不超过50字）
                %s
                9. 只有当文本完全是乱码、空白、或纯符号无任何语义时，才返回空数组 []

                只输出JSON数组，不要其他文字，格式如下：
                [
                  {
                    "content": "一句话题干",
                    "options": ["A.选项1", "B.选项2", "C.选项3", "D.选项4"],
                    "answer": "B",
                    "explanation": "一句话解析",
                    "difficulty": 2
                  }
                ]

                文本内容：
                %s
                """.formatted(countRule, difficultyRule, textContent);
    }

    /**
     * 调用AI API（兼容OpenAI/DeepSeek格式）
     */
    private List<CustomQuestion> callAiApi(String prompt, UploadRecord record) throws Exception {
        // 使用 HttpURLConnection 替代 RestClient，避免框架自动添加的 header 导致微信API返回412
        URL url = new URL(aiApiUrl);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setRequestProperty("Authorization", "Bearer " + aiApiKey);
        conn.setDoOutput(true);
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        // 构建请求体
        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", aiModel);
        requestBody.put("messages", List.of(
                Map.of("role", "system", "content", "你是一个专业的出题助手，擅长根据文本内容生成高质量的选择题。"),
                Map.of("role", "user", "content", prompt)
        ));
        requestBody.put("temperature", 0.7);

        String jsonBody = objectMapper.writeValueAsString(requestBody);

        try (OutputStream os = conn.getOutputStream()) {
            os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
        }

        int responseCode = conn.getResponseCode();
        InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();

        StringBuilder responseStr = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                responseStr.append(line);
            }
        }

        if (responseCode != 200) {
            log.error("AI API返回错误码: {}, 响应: {}", responseCode, responseStr);
            throw new RuntimeException("AI API返回错误: " + responseCode);
        }

        Map<String, Object> response = objectMapper.readValue(responseStr.toString(), new TypeReference<Map<String, Object>>() {});
        String content = extractAiResponseContent(response);
        return parseQuestionsFromJson(content, record);
    }

    /**
     * 从AI响应中提取文本内容
     */
    @SuppressWarnings("unchecked")
    private String extractAiResponseContent(Map<String, Object> response) {
        if (response == null) return "";
        List<Map<String, Object>> choices = (List<Map<String, Object>>) response.get("choices");
        if (choices == null || choices.isEmpty()) return "";
        Map<String, Object> message = (Map<String, Object>) choices.get(0).get("message");
        return (String) message.get("content");
    }

    /**
     * 从JSON文本中解析题目
     */
    private List<CustomQuestion> parseQuestionsFromJson(String jsonContent, UploadRecord record) {
        List<CustomQuestion> result = new ArrayList<>();

        int start = jsonContent.indexOf('[');
        int end = jsonContent.lastIndexOf(']');
        if (start == -1 || end == -1) {
            log.error("AI返回的内容无法解析为JSON数组");
            return result;
        }

        String json = jsonContent.substring(start, end + 1);

        try {
            List<Map<String, Object>> items = objectMapper.readValue(json, new TypeReference<>() {});
            for (Map<String, Object> item : items) {
                CustomQuestion q = new CustomQuestion();
                q.setUserId(record.getUserId());
                q.setContent((String) item.get("content"));
                q.setOptionList(objectMapper.writeValueAsString(item.get("options")));
                q.setAnswer((String) item.get("answer"));
                q.setExplanation((String) item.get("explanation"));
                q.setDifficulty(item.get("difficulty") != null ?
                        ((Number) item.get("difficulty")).intValue() : 2);
                q.setSourceType(record.getFileType());
                q.setSourceFileName(record.getFileName());
                q.setUploadRecordId(record.getId());

                if (q.getContent() != null && q.getAnswer() != null) {
                    result.add(q);
                }
            }
        } catch (Exception e) {
            log.error("解析AI返回的题目JSON失败: {}", e.getMessage());
        }

        return result;
    }

    /**
     * 生成演示题目（未配置AI API时的开发降级方案）
     */
    private List<CustomQuestion> generateDemoQuestions(String textContent, UploadRecord record) {
        List<CustomQuestion> result = new ArrayList<>();

        String[] sentences = textContent.split("[。\n.!！?？]");
        int count = 0;
        for (String sentence : sentences) {
            String trimmed = sentence.trim();
            if (trimmed.length() < 5 || count >= minQuestions) continue;

            CustomQuestion q = new CustomQuestion();
            q.setUserId(record.getUserId());
            q.setContent("以下哪个说法是正确的？");
            try {
                q.setOptionList(objectMapper.writeValueAsString(List.of(
                        "A. " + trimmed.substring(0, Math.min(trimmed.length(), 15)),
                        "B. 以上都不对",
                        "C. 无法判断",
                        "D. 信息不足"
                )));
            } catch (Exception e) {
                continue;
            }
            q.setAnswer("A");
            q.setExplanation("根据上传文件内容生成");
            q.setDifficulty(2);
            q.setSourceType(record.getFileType());
            q.setSourceFileName(record.getFileName());
            q.setUploadRecordId(record.getId());
            result.add(q);
            count++;
        }

        return result;
    }

    // ==================== 内容安全审核 ====================
    // 本地敏感词预检（checkContentSafety + SENSITIVE_WORDS）已于 2026-10 移除：
    // 微信 msg_sec_check 已覆盖该职责且按上下文判断，本地硬编码黑名单误杀率过高。
    // 内容安全审核现统一由 WxSecurityService 负责（见上方 Step 1.5）。

    /**
     * 标记上传记录为失败
     */
    private void markFailed(UploadRecord record, String reason) {
        record.setStatus(2);
        record.setFailReason(reason);
        uploadRecordMapper.updateStatus(record);
    }
}
