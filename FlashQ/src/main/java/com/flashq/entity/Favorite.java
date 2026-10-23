package com.flashq.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class Favorite {
    private Integer id;
    private Integer userId;
    private Integer questionId;
    private LocalDateTime createTime;
}