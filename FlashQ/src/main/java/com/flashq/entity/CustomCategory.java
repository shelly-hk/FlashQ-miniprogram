package com.flashq.entity;

import lombok.Data;
import java.time.LocalDateTime;

/**
 * 自主题库分类实体
 */
@Data
public class CustomCategory {
    private Integer id;
    private Integer userId;
    private String name;
    private Integer sortOrder;
    private Integer isDefault;
    private LocalDateTime createTime;
}
