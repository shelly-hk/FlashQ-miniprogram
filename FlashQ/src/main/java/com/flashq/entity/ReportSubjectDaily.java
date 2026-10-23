package com.flashq.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 学习报告-按科目维度的日统计
 * 对应开发规范 4.3.2 report_subject_daily
 * subject_id 命名约定：官方题库 "s_{科目ID}"，自主题库 "c_{分类ID}"
 */
@Data
public class ReportSubjectDaily {
    private Integer id;
    private Integer userId;
    private LocalDate date;
    private String subjectId;
    private Integer total;
    private Integer correct;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
