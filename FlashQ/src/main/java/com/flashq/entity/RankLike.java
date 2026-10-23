package com.flashq.entity;

import lombok.Data;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 排行榜点赞记录
 */
@Data
public class RankLike {
    private Integer id;
    private Integer likerId;    // 点赞者
    private Integer targetId;   // 被点赞者
    private String rankType;    // total | today
    private LocalDate likeDate; // 点赞日期
    private LocalDateTime createTime;
}
