package com.flashq.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.service.WxAccessTokenService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@Service
public class WxAccessTokenServiceImpl implements WxAccessTokenService {

    private static final Logger log = LoggerFactory.getLogger(WxAccessTokenServiceImpl.class);

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${wx.app-id:}")
    private String appId;

    @Value("${wx.app-secret:}")
    private String appSecret;

    // token 有效期 7200 秒，提前 5 分钟刷新
    private volatile String cachedToken;
    private volatile long tokenExpireAt = 0;

    @Override
    public synchronized String getAccessToken() {
        long now = System.currentTimeMillis();
        if (cachedToken != null && now < tokenExpireAt - 300_000) {
            return cachedToken;
        }

        try {
            String urlStr = "https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid="
                    + appId + "&secret=" + appSecret;
            HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int code = conn.getResponseCode();
            String resp = readResponse(conn, code);

            if (code != 200) {
                throw new RuntimeException("HTTP " + code + ": " + resp);
            }

            Map<String, Object> result = objectMapper.readValue(resp, new TypeReference<>() {});
            Integer errcode = (Integer) result.get("errcode");
            if (errcode != null && errcode != 0) {
                throw new RuntimeException("errcode=" + errcode + ", errmsg=" + result.get("errmsg"));
            }

            cachedToken = (String) result.get("access_token");
            Integer expiresIn = (Integer) result.get("expires_in");
            tokenExpireAt = now + (expiresIn != null ? expiresIn.longValue() * 1000 : 7200_000L);

            log.info("获取微信 access_token 成功，有效期 {} 秒", expiresIn);
            return cachedToken;
        } catch (Exception e) {
            log.error("获取 access_token 失败: {}", e.getMessage());
            throw new RuntimeException("微信 access_token 获取失败: " + e.getMessage(), e);
        }
    }

    @Override
    public synchronized void clearCache() {
        cachedToken = null;
        tokenExpireAt = 0;
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
