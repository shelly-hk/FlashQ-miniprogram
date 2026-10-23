package com.flashq.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 学习报告-分享回流访问记录
 * ER 图 4-1：由海报 share_token 反查归属用户，记录匿名访问事件
 */
@Data
public class ReportShareVisit {
    private Integer id;
    private String posterId;
    /** 海报归属用户ID（分享发起方） */
    private Integer ownerId;
    /** 分享场景：朋友圈/微信群/好友 */
    private String scene;
    private String entryPage;
    private String visitorIp;
    private LocalDateTime createTime;
}
