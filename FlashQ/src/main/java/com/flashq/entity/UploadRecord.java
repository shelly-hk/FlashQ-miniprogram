package com.flashq.entity;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 文件上传记录实体
 * 记录用户的每次上传，用于追踪解析状态与统计每日上传次数
 */
@Data
public class UploadRecord {
    private Integer id;
    private Integer userId;
    private String fileName;        // 原始文件名
    private String fileType;        // image/document
    private Long fileSize;          // 文件大小（字节）
    private String filePath;        // 服务器存储路径
    private Integer status;         // 0=解析中 1=成功 2=失败
    private Integer questionCount;  // 生成的题目数
    private String failReason;      // 失败原因
    private LocalDate uploadDate;   // 上传日期（统计每日次数）
    private LocalDateTime createTime;
}
