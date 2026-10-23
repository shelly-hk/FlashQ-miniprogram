package com.flashq.entity;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
public class User {
    private Integer id;
    private String openid;
    private String token;
    private String nickNo;
    private String avatar;
    private Integer totalCount;
    private Integer todayCount;
    private LocalDate lastStudyDate;
    private Integer customTotalCount;
    private Integer customTodayCount;
    private LocalDate customLastStudyDate;
    private LocalDateTime reportMigratedAt;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}