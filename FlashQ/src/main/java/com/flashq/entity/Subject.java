package com.flashq.entity;
import lombok.Data;
import java.time.LocalDateTime;

@Data
public class Subject {
    private Integer id;
    private String name;
    private String quizType;
    private Integer questionCount;
    private LocalDateTime createTime;
}