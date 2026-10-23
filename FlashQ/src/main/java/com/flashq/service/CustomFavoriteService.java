package com.flashq.service;

import java.util.Map;

public interface CustomFavoriteService {

    /**
     * 自主题目 收藏 / 取消收藏（切换）
     * @return 当前是否已收藏
     */
    Map<String, Object> toggleFavorite(Integer userId, Integer questionId);

    /**
     * 自主题库收藏列表（分页 + 可选按分类筛选）
     */
    Map<String, Object> getFavoriteList(Integer userId, int page, int size, Integer categoryId);

    /**
     * 判断某自主题目是否已被收藏
     */
    boolean isFavorited(Integer userId, Integer questionId);

    /**
     * 删除自主题库收藏
     */
    Map<String, Object> deleteFavorite(Integer userId, Integer questionId);
}
