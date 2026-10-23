package com.flashq.common;

import lombok.Data;

/**
 * 统一返回结果封装类
 * 对应接口文档约定：所有接口返回 {code, msg, data}
 */
@Data
public class Result<T> {
    private Integer code;
    private String msg;
    private T data;

    // 成功（带数据）
    public static <T> Result<T> success(T data) {
        Result<T> r = new Result<>();
        r.setCode(200);
        r.setMsg("success");
        r.setData(data);
        return r;
    }

    // 成功（不带数据，或 data 为 null）
    public static <T> Result<T> success() {
        return success(null);
    }

    // 错误（带业务码和错误信息）
    public static <T> Result<T> error(Integer code, String msg) {
        Result<T> r = new Result<>();
        r.setCode(code);
        r.setMsg(msg);
        r.setData(null);
        return r;
    }
}