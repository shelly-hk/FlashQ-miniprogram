package com.flashq.service;

import com.flashq.common.ContentRiskException;

/**
 * 微信内容安全检测服务
 * 文本: msg_sec_check（同步）
 * 图片: img_sec_check（同步）
 * 失败策略: fail-closed（检测服务不可用时拦截内容）
 */
public interface WxSecurityService {

    /**
     * 文本安全检测（调用微信 msg_sec_check）
     *
     * @param content 待检测文本
     * @throws ContentRiskException 内容不合规，或检测服务不可用
     */
    void checkText(String content);

    /**
     * 图片安全检测（调用微信 img_sec_check）
     *
     * @param imageBytes 图片字节数组
     * @param fileName   图片文件名（含扩展名）
     * @throws ContentRiskException 图片不合规，或检测服务不可用
     */
    void checkImage(byte[] imageBytes, String fileName);
}
