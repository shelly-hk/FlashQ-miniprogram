package com.flashq.service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * 学习报告服务（依据《学习报告后端新增功能开发规范》v1.0.0）
 * <p>
 * 单体适配说明：规范中的 MQ 事件订阅在单体应用中等价落地为
 * judge 流程内同步调用 {@link #recordAnswer}（异常隔离，不影响答题主流程）；
 * Redis 缓存/OSS/分库分表等基础设施依赖本期以数据库与本地存储等价实现。
 */
public interface ReportService {

    /** 项目统一使用 Asia/Shanghai 作为用户本地时区基准（与小程序端 dateKey 一致） */
    java.time.ZoneId ZONE = java.time.ZoneId.of("Asia/Shanghai");

    /**
     * 答题事件落库（规范 5.1）
     * 同一事务内完成：日快照 UPSERT + 科目日统计 UPSERT + 连续打卡更新（规范 5.3）
     *
     * @param userId     用户ID
     * @param subjectId  科目键：官方题库 "s_{科目ID}"，自主题库 "c_{分类ID}"
     * @param correct    是否答对
     * @param answerTime 答题时间（调用方传 ZONE 时区的当前时间）
     */
    void recordAnswer(Integer userId, String subjectId, boolean correct, LocalDateTime answerTime);

    /**
     * 获取报告汇总（规范 3.3）：连续打卡、最长连续、累计答题等
     */
    Map<String, Object> getSummary(Integer userId, String timezone);

    /**
     * 获取热力图数据（规范 3.4）：days 仅支持 7 | 30
     */
    Map<String, Object> getHeatmap(Integer userId, int days, LocalDate endDate);

    /**
     * 获取科目正确率（规范 3.5）：起止必填，跨度 ≤ 90 天
     */
    Map<String, Object> getSubjectAccuracy(Integer userId, LocalDate startDate, LocalDate endDate);

    /**
     * 获取最佳时段分布（规范 3.6）：bucket = hour | section
     */
    Map<String, Object> getTimeDistribution(Integer userId, int days, String bucket);

    /**
     * 按日期回溯原始快照（规范 3.7）
     */
    Map<String, Object> getSnapshot(Integer userId, LocalDate date);

    /**
     * 生成学习海报（规范 3.8）：幂等键 24h 内去重，单用户每日限 10 次
     */
    Map<String, Object> generatePoster(Integer userId, String template,
                                       LocalDate startDate, LocalDate endDate,
                                       boolean highlightStreak, boolean highlightBestSubject,
                                       boolean highlightBestSection, String idempotencyKey);

    /**
     * 记录分享回流访问（规范 3.9）：允许匿名调用，无效 share_token 静默丢弃
     *
     * @return 是否记录成功（匿名接口始终返回成功语义，不泄露数据）
     */
    boolean recordShareVisit(String shareToken, String scene, String entryPage, String visitorIp);

    /**
     * 客户端 LocalStorage 数据合并迁移（规范 3.10）
     */
    Map<String, Object> migrate(Integer userId, Map<String, Object> clientStats, String idempotencyKey);
}
