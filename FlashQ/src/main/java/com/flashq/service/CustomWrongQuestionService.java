package com.flashq.service;

import java.util.List;
import java.util.Map;

public interface CustomWrongQuestionService {

    // 获取自主题库错题列表 — 不分页全量查询（兼容旧调用）
    List<Map<String, Object>> getWrongList(Integer userId);

    // 获取自主题库错题列表（分页 + 可选按分类筛选）
    Map<String, Object> getWrongListPaged(Integer userId, int page, int size, Integer categoryId);

    // 删除自主题库错题（手动移除）
    boolean deleteWrong(Integer userId, Integer questionId);

    // 记录错题（判题答错时调用）
    void recordWrong(Integer userId, Integer questionId, String userAnswer);
}
