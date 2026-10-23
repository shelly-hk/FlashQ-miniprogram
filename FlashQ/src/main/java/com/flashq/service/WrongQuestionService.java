package com.flashq.service;

import java.util.List;
import java.util.Map;

public interface WrongQuestionService {

    // 获取错题列表（接口文档 4.7）— 不分页全量查询（兼容旧调用）
    List<Map<String, Object>> getWrongList(Integer userId);

    // 获取错题列表（分页 + 可选按科目/题目类型筛选）
    Map<String, Object> getWrongListPaged(Integer userId, int page, int size, Integer subjectId, String quizType);

    // 删除错题（接口补充文档，手动移除）
    boolean deleteWrong(Integer userId, Integer questionId);
}
