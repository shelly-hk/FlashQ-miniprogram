package com.flashq.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 学习报告-用户日统计快照
 * 对应开发规范 4.3.1 report_daily_snapshot
 */
@Data
public class ReportDailySnapshot {
    private Integer id;
    private Integer userId;
    private LocalDate date;
    private Integer total;
    private Integer correct;
    private LocalDateTime firstAt;
    private LocalDateTime lastAt;
    /** 时段分布 JSON：{"hours": {"19": [12, 10]}}，值为 [答题数, 正确数] */
    private String sections;
    /** 数据来源：event=答题事件 migrate=客户端迁移 backfill=对账修复 */
    private String source;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
