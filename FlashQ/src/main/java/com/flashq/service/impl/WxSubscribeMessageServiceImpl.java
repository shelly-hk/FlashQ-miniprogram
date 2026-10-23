package com.flashq.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.service.WxAccessTokenService;
import com.flashq.service.WxSubscribeMessageService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class WxSubscribeMessageServiceImpl implements WxSubscribeMessageService {

    private static final Logger log = LoggerFactory.getLogger(WxSubscribeMessageServiceImpl.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String SEND_URL =
            "https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=";

    @Autowired
    private WxAccessTokenService accessTokenService;

    @Override
    public boolean send(String openid, String templateId, String page, Map<String, Object> data) {
        if (openid == null || openid.isEmpty()) {
            log.warn("订阅消息下发失败：openid 为空，templateId={}", templateId);
            return false;
        }
        if (templateId == null || templateId.isEmpty()) {
            log.warn("订阅消息下发失败：templateId 为空，openid={}", openid);
            return false;
        }

        // 微信要求请求体里不出现 miniprogram_state 时默认为 formal（正式版本）。
        // 这里显式带上，避免调试版/体验版用户收不到。
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("touser", openid);
        body.put("template_id", templateId);
        if (page != null && !page.isEmpty()) {
            body.put("page", page);
        }
        body.put("data", data != null ? data : Map.of());
        body.put("miniprogram_state", "formal");
        body.put("lang", "zh_CN");

        try {
            String token = accessTokenService.getAccessToken();
            HttpURLConnection conn = buildPostConnection(SEND_URL + token);

            String jsonBody = objectMapper.writeValueAsString(body);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            String resp = readResponse(conn, code);
            if (code != 200) {
                log.error("subscribe/send HTTP {}: {}", code, resp);
                return false;
            }

            Map<String, Object> result = objectMapper.readValue(resp, new TypeReference<>() {});
            Integer errcode = (Integer) result.get("errcode");
            if (errcode == null) {
                log.error("subscribe/send 响应异常: {}", resp);
                return false;
            }
            if (errcode == 0) {
                log.info("订阅消息下发成功：openid={}, templateId={}", openid, templateId);
                return true;
            }

            // 凭证失效 → 清缓存让下次重新获取；其余错误仅记录不抛
            if (errcode == 40001 || errcode == 42001 || errcode == 40014) {
                log.warn("access_token 失效(errcode={})，清缓存后重试一次", errcode);
                accessTokenService.clearCache();
            }
            log.warn("订阅消息下发失败：openid={}, errcode={}, errmsg={}",
                    openid, errcode, result.get("errmsg"));
            return false;
        } catch (Exception e) {
            log.error("subscribe/send 调用异常：openid={}, {}", openid, e.getMessage());
            return false;
        }
    }

    // ==================== HTTP 工具 ====================

    private HttpURLConnection buildPostConnection(String urlStr) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
        conn.setDoOutput(true);
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(15000);
        return conn;
    }

    private String readResponse(HttpURLConnection conn, int responseCode) throws Exception {
        InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }
}
