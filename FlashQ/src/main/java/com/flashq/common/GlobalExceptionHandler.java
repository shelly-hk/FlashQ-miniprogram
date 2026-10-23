package com.flashq.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    // 内容安全检测不通过或检测服务不可用
    @ExceptionHandler(ContentRiskException.class)
    public Result<Object> handleContentRisk(ContentRiskException e) {
        return Result.error(403, e.getMessage());
    }

    // 业务异常（携带 HTTP 状态码，如学习报告模块的 404/422/429/500 语义）
    @ExceptionHandler(BizException.class)
    public Result<Object> handleBizException(BizException e) {
        if (e.getStatus() >= 500) {
            log.error("业务异常: status={}, msg={}", e.getStatus(), e.getMessage(), e);
        } else {
            log.warn("业务异常: status={}, msg={}", e.getStatus(), e.getMessage());
        }
        return Result.error(e.getStatus(), e.getMessage());
    }

    // 业务参数校验失败（昵称超长、分类名重复、文件格式不支持等）
    @ExceptionHandler(IllegalArgumentException.class)
    public Result<Object> handleIllegalArgument(IllegalArgumentException e) {
        log.warn("参数校验失败: {}", e.getMessage());
        return Result.error(400, e.getMessage());
    }

    // 业务逻辑异常（配额超限、登录失败、AI服务未配置等）
    @ExceptionHandler(RuntimeException.class)
    public Result<Object> handleRuntimeException(RuntimeException e) {
        log.warn("业务异常: {}", e.getMessage());
        return Result.error(400, e.getMessage());
    }

    // 请求体 JSON 格式错误或缺失
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public Result<Object> handleHttpMessageNotReadable(HttpMessageNotReadableException e) {
        return Result.error(400, "请求参数格式错误");
    }

    // 必填参数缺失
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public Result<Object> handleMissingParam(MissingServletRequestParameterException e) {
        return Result.error(400, "缺少必填参数: " + e.getParameterName());
    }

    // 上传文件超过限制
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public Result<Object> handleMaxUploadSize(MaxUploadSizeExceededException e) {
        return Result.error(400, "上传文件过大，请压缩后重试");
    }

    // 不存在的 API 路径
    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException.class)
    public Result<Object> handleNoResourceFound(NoResourceFoundException e) {
        log.warn("资源不存在: {}", e.getMessage());
        return Result.error(404, "资源不存在");
    }

    // 兜底：真正的系统异常
    @ExceptionHandler(Exception.class)
    public Result<Object> handleException(Exception e) {
        log.error("未捕获异常: {}", e.getMessage(), e);
        return Result.error(500, "服务器内部错误，请稍后重试");
    }
}