package com.flashq.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.common.ContentRiskException;
import com.flashq.service.WxAccessTokenService;
import com.flashq.service.WxSecurityService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Service
public class WxSecurityServiceImpl implements WxSecurityService {

    private static final Logger log = LoggerFactory.getLogger(WxSecurityServiceImpl.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Autowired
    private WxAccessTokenService accessTokenService;

    // img_sec_check 图片大小上限 1MB
    private static final long IMG_CHECK_MAX_SIZE = 1024 * 1024;

    // msg_sec_check 单次文本上限
    private static final int TEXT_MAX_LEN = 2500;

    // ==================== 公开接口 ====================

    @Override
    public void checkText(String content) {
        if (content == null || content.trim().isEmpty()) {
            return;
        }

        String text = content.length() > TEXT_MAX_LEN ? content.substring(0, TEXT_MAX_LEN) : content;

        try {
            String token = accessTokenService.getAccessToken();
            String urlStr = "https://api.weixin.qq.com/wxa/msg_sec_check?access_token=" + token;

            HttpURLConnection conn = buildPostConnection(urlStr, "application/json; charset=UTF-8");

            Map<String, Object> body = Map.of("content", text, "version", 1);
            String jsonBody = objectMapper.writeValueAsString(body);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(jsonBody.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            String resp = readResponse(conn, code);

            if (code != 200) {
                log.error("msg_sec_check HTTP {}: {}", code, resp);
                throw new ContentRiskException("内容安全检测服务暂时不可用，请稍后重试");
            }

            Map<String, Object> result = objectMapper.readValue(resp, new TypeReference<>() {});
            Integer errcode = (Integer) result.get("errcode");

            if (errcode == null || errcode != 0) {
                log.error("msg_sec_check errcode={}, errmsg={}", errcode, result.get("errmsg"));
                if (errcode != null && (errcode == 40001 || errcode == 42001)) {
                    accessTokenService.clearCache();
                }
                // fail-closed
                throw new ContentRiskException("内容安全检测服务暂时不可用，请稍后重试");
            }

            // version=1 违规时 errcode=87014
            if (errcode == 87014) {
                log.warn("文本内容检测不通过: errcode=87014");
                throw new ContentRiskException("内容包含违规信息，请修改后重试");
            }

            // version=2 违规时 result.suggest=risky
            @SuppressWarnings("unchecked")
            Map<String, Object> detail = (Map<String, Object>) result.get("result");
            if (detail != null) {
                String suggest = (String) detail.get("suggest");
                if ("risky".equalsIgnoreCase(suggest)) {
                    log.warn("文本内容检测不通过: label={}", detail.get("label"));
                    throw new ContentRiskException("内容包含违规信息，请修改后重试");
                }
            }

            log.debug("文本安全检测通过");
        } catch (ContentRiskException e) {
            throw e;
        } catch (Exception e) {
            log.error("msg_sec_check 调用异常: {}", e.getMessage());
            // fail-closed: 网络异常等也拦截
            throw new ContentRiskException("内容安全检测服务暂时不可用，请稍后重试");
        }
    }

    @Override
    public void checkImage(byte[] imageBytes, String fileName) {
        if (imageBytes == null || imageBytes.length == 0) {
            return;
        }

        // img_sec_check 限制图片不超过 1MB；超过则跳过检测（API 限制，非服务故障）
        if (imageBytes.length > IMG_CHECK_MAX_SIZE) {
            log.warn("图片 {} 字节超过 1MB，跳过安全检测（img_sec_check API 限制）", imageBytes.length);
            return;
        }

        try {
            String token = accessTokenService.getAccessToken();
            String urlStr = "https://api.weixin.qq.com/wxa/img_sec_check?access_token=" + token;

            String boundary = "----WxBoundary" + System.currentTimeMillis();
            HttpURLConnection conn = buildPostConnection(urlStr, "multipart/form-data; boundary=" + boundary);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(("--" + boundary + "\r\n").getBytes(StandardCharsets.UTF_8));
                os.write(("Content-Disposition: form-data; name=\"media\"; filename=\""
                        + (fileName != null ? fileName : "image.jpg") + "\"\r\n")
                        .getBytes(StandardCharsets.UTF_8));
                os.write("Content-Type: application/octet-stream\r\n\r\n".getBytes(StandardCharsets.UTF_8));
                os.write(imageBytes);
                os.write(("\r\n--" + boundary + "--\r\n").getBytes(StandardCharsets.UTF_8));
                os.flush();
            }

            int code = conn.getResponseCode();
            String resp = readResponse(conn, code);

            if (code != 200) {
                log.error("img_sec_check HTTP {}: {}", code, resp);
                throw new ContentRiskException("图片安全检测服务暂时不可用，请稍后重试");
            }

            Map<String, Object> result = objectMapper.readValue(resp, new TypeReference<>() {});
            Integer errcode = (Integer) result.get("errcode");

            if (errcode == null) {
                log.error("img_sec_check 响应异常: {}", resp);
                throw new ContentRiskException("图片安全检测服务暂时不可用，请稍后重试");
            }

            if (errcode == 87014) {
                log.warn("图片内容检测不通过: 含有违法违规内容");
                throw new ContentRiskException("图片包含违规内容，请更换后重试");
            }

            if (errcode != 0) {
                log.error("img_sec_check errcode={}, errmsg={}", errcode, result.get("errmsg"));
                if (errcode == 40001 || errcode == 42001) {
                    accessTokenService.clearCache();
                }
                // fail-closed
                throw new ContentRiskException("图片安全检测服务暂时不可用，请稍后重试");
            }

            log.debug("图片安全检测通过");
        } catch (ContentRiskException e) {
            throw e;
        } catch (Exception e) {
            log.error("img_sec_check 调用异常: {}", e.getMessage());
            throw new ContentRiskException("图片安全检测服务暂时不可用，请稍后重试");
        }
    }

    // ==================== access_token 获取 ====================
    // access_token 的获取与缓存已抽到 WxAccessTokenService 集中管理，
    // 避免多个组件各自缓存导致微信端互相 invalidate token。
    // 见 WxAccessTokenServiceImpl。

    // ==================== HTTP 工具 ====================

    private HttpURLConnection buildPostConnection(String urlStr, String contentType) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
        conn.setRequestMethod("POST");
        conn.setRequestProperty("Content-Type", contentType);
        conn.setDoOutput(true);
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(15000);
        return conn;
    }

    private String readResponse(HttpURLConnection conn, int responseCode) throws IOException {
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
