package com.flashq.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 自主题库实体
 * 存储 Agent 从用户上传文件中生成的题目
 */
@Data
public class CustomQuestion {
    private Integer id;
    private Integer userId;
    private String content;          // 一句话题干
    private String optionList;       // JSON数组字符串，如 ["A.xx","B.xx","C.xx","D.xx"]
    private String answer;           // 正确选项字母，如 "B"
    private String explanation;      // 简短解析
    private Integer difficulty;      // 难度 1初/2中/3高
    private Integer categoryId;      // 自定义分类ID
    private String sourceType;       // 来源文件类型 image/document
    private String sourceFileName;   // 原始文件名
    private Integer uploadRecordId;  // 关联上传记录ID
    private Integer isDeleted;       // 逻辑删除标记
    private LocalDateTime createTime;
}
