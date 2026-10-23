package com.flashq.service;

import java.util.List;
import java.util.Map;

public interface FavoriteService {

    // 收藏或取消收藏（toggle，接口文档 4.5）
    boolean isFavorite(Integer userId, Integer questionId);

    // 获取收藏列表（接口文档 4.6），返回带题目的详情 — 不分页全量查询（兼容旧调用）
    List<Map<String, Object>> getFavoriteList(Integer userId);

    // 获取收藏列表（分页 + 可选按科目/题目类型筛选）
    Map<String, Object> getFavoriteListPaged(Integer userId, int page, int size, Integer subjectId, String quizType);

    // 删除收藏（补充接口文档，按用户+题目删除）
    boolean deleteFavorite(Integer userId, Integer questionId);
}