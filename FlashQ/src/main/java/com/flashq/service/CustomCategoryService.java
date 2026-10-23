package com.flashq.service;

import java.util.Map;

public interface CustomCategoryService {

    /**
     * 获取用户分类列表（含各分类题目数）
     */
    Map<String, Object> getCategoryList(Integer userId);

    /**
     * 创建自定义分类
     */
    Map<String, Object> createCategory(Integer userId, String name);

    /**
     * 删除分类（题目归入"其他"）
     */
    Map<String, Object> deleteCategory(Integer userId, Integer categoryId);

    /**
     * 重命名分类
     */
    Map<String, Object> renameCategory(Integer userId, Integer categoryId, String name);
}
