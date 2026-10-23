package com.flashq.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 自主题库收藏实体
 */
@Data
public class CustomFavorite {
    private Integer id;
    private Integer userId;
    private Integer questionId;
    private LocalDateTime createTime;
}
