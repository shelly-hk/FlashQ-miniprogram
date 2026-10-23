package com.flashq.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 学习报告-用户连续打卡聚合（用户级一行）
 * 对应开发规范 4.3.3 report_streak
 */
@Data
public class ReportStreak {
    private Integer userId;
    private Integer streakCurrent;
    private Integer streakLongest;
    private LocalDate lastActiveDate;
    private Integer totalDays;
    private LocalDateTime updateTime;
}
