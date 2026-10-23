package com.flashq.common;

/**
 * 内容安全检测不通过异常
 * 由 WxSecurityService 在检测到违规内容或检测服务不可用时抛出
 */
public class ContentRiskException extends RuntimeException {
    public ContentRiskException(String message) {
        super(message);
    }
}
