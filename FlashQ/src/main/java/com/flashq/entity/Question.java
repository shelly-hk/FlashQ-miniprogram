package com.flashq.entity;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class Question {
    private Integer id;
    private Integer subjectId;
    private String content;
    private String optionList;      // JSON字符串，如 ["A.xx","B.xx","C.xx","D.xx"]
    private String answer;          // 正确选项字母，如 "B"
    private String explanation;
    private Integer difficulty;
    private String quizType;        // 题目类型：it/code/interview
    private String style;           // 题目风格：quick(快速刷)/quality(质量刷)
    private String source;          // 题目来源（企业名），面试题用，默认 null
    private Integer isDeleted;
    private LocalDateTime createTime;
}