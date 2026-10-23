package com.flashq.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class WrongQuestion {
    private Integer id;
    private Integer userId;
    private Integer questionId;
    private String userAnswer;
    private Integer wrongTimes;
    private LocalDateTime lastWrongTime;
    private LocalDateTime createTime;
}