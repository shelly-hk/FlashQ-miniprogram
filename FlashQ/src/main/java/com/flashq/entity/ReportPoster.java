package com.flashq.entity;

import lombok.Data;

import java.time.LocalDateTime;

/**
 * 学习报告-海报生成记录与分享 Token
 * 对应开发规范 4.3.4 report_poster
 */
@Data
public class ReportPoster {
    private Integer id;
    /** 业务ID：p_xxx */
    private String posterId;
    private Integer userId;
    /** 海报模板版本 */
    private String template;
    /** 统计区间与展示亮点 JSON */
    private String rangeJson;
    private String imageUrl;
    private String thumbUrl;
    /** 分享回流追踪 Token（16位base62） */
    private String shareToken;
    /** 幂等键（24小时内重复请求直接返回首次结果） */
    private String idempotencyKey;
    /** 1=生成中 2=可用 3=过期 4=失败 */
    private Integer status;
    private LocalDateTime expiresAt;
    private LocalDateTime generatedAt;
    private LocalDateTime createTime;
}
