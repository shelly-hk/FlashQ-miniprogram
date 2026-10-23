package com.flashq.service;

/**
 * 微信小程序 access_token 集中获取服务
 * --------------------------------------------------
 * 微信同一 appid 的 access_token 是「覆盖式」的：每次调用 cgi-bin/token
 * 都会让上一次下发的 token 失效。因此整个应用必须集中缓存一份 token，
 * 由本服务统一获取与刷新，避免多组件各自缓存导致互相 invalidate。
 *
 * 当前复用方：
 *  - WxSecurityServiceImpl   （内容安全检测）
 *  - WxSubscribeMessageServiceImpl （订阅消息下发）
 */
public interface WxAccessTokenService {

    /**
     * 获取有效的 access_token（带本地缓存，提前 5 分钟刷新）。
     * 线程安全（内部 synchronized）。
     *
     * @return access_token
     * @throws RuntimeException 获取失败（网络异常 / appsecret 错误等）
     */
    String getAccessToken();

    /**
     * 强制清空本地缓存，下一次 {@link #getAccessToken()} 会重新向微信请求。
     * 通常在收到 40001 / 42001 等凭证失效错误码时调用。
     */
    void clearCache();
}
