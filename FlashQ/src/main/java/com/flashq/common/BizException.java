package com.flashq.common;

/**
 * 业务异常（携带 HTTP 状态码）
 * 用于学习报告等模块表达 404/422/429/500 等语义，由 GlobalExceptionHandler 统一封装
 */
public class BizException extends RuntimeException {

    /** HTTP 状态码（对应开发规范错误码表的 HTTP 列） */
    private final int status;

    public BizException(int status, String message) {
        super(message);
        this.status = status;
    }

    public BizException(int status, String message, Throwable cause) {
        super(message, cause);
        this.status = status;
    }

    public int getStatus() {
        return status;
    }
}
