package com.flashq.service;

import com.flashq.entity.Subject;
import java.util.List;

public interface SubjectService {
    // 获取全部科目列表
    List<Subject> getSubjectList();

    // 按题目类型获取科目列表：'code'/'interview' 精确匹配；
    // 其他值（null/it/空）返回随机刷题科目（排除 code/interview，保留历史科目）
    List<Subject> getSubjectListByQuizType(String quizType);
}