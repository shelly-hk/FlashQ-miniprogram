package com.flashq.service;

import java.util.Map;

/**
 * 微信订阅消息下发服务
 * --------------------------------------------------
 * 封装微信小程序「订阅消息」接口：
 *   POST https://api.weixin.qq.com/cgi-bin/message/subscribe/send
 *
 * 微信规则：一次性订阅消息，用户在前端每点一次「允许」对应一次下发额度，
 * 后端调用本接口成功一次即消耗一次额度（剩余额度由业务层 UserReminder 维护）。
 */
public interface WxSubscribeMessageService {

    /**
     * 发送一条订阅消息。
     *
     * @param openid     接收用户的 openid
     * @param templateId 订阅消息模板 ID
     * @param page       点击消息跳转的小程序页面路径（可为 null，如 "pages/home/home"）
     * @param data       模板字段，key=字段名，value=对应内容；如 {"thing1": {"value": "该刷题啦"}}
     * @return true=发送成功（微信返回 errcode==0）；false=发送失败（额度不足/被用户拒收等）
     */
    boolean send(String openid, String templateId, String page, Map<String, Object> data);
}
