package com.flashq.service.impl;

import com.flashq.entity.CustomCategory;
import com.flashq.mapper.CustomCategoryMapper;
import com.flashq.mapper.CustomQuestionMapper;
import com.flashq.service.CustomCategoryService;
import com.flashq.service.WxSecurityService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CustomCategoryServiceImpl implements CustomCategoryService {

    private final CustomCategoryMapper customCategoryMapper;
    private final CustomQuestionMapper customQuestionMapper;
    private final WxSecurityService wxSecurityService;

    // 仅中文校验正则：CJK统一汉字 + 中文标点 + 全角符号
    private static final String CHINESE_REGEX = "^[\\u4e00-\\u9fa5\\u3000-\\u303f\\uff00-\\uffef]+$";

    private static final int MAX_CUSTOM_CATEGORY_COUNT = 20;

    @Override
    public Map<String, Object> getCategoryList(Integer userId) {
        List<Map<String, Object>> rawList = customCategoryMapper.findListWithCount(userId);
        List<Map<String, Object>> list = new ArrayList<>();
        for (Map<String, Object> row : rawList) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", row.get("id"));
            item.put("name", row.get("name"));
            item.put("isDefault", ((Number) row.get("isDefault")).intValue() == 1);
            item.put("questionCount", ((Number) row.get("questionCount")).intValue());
            list.add(item);
        }
        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("total", list.size());
        return data;
    }

    @Override
    public Map<String, Object> createCategory(Integer userId, String name) {
        validateCategoryName(name);

        // 微信内容安全检测
        wxSecurityService.checkText(name);

        // 唯一性校验
        if (customCategoryMapper.countByUserIdAndName(userId, name.trim()) > 0) {
            throw new IllegalArgumentException("分类名称已存在");
        }

        // 数量上限校验
        int customCount = customCategoryMapper.countCustomByUserId(userId);
        if (customCount >= MAX_CUSTOM_CATEGORY_COUNT) {
            throw new IllegalArgumentException("分类数量已达上限（" + MAX_CUSTOM_CATEGORY_COUNT + "个）");
        }

        CustomCategory category = new CustomCategory();
        category.setUserId(userId);
        category.setName(name.trim());
        category.setSortOrder(customCount + 1);
        category.setIsDefault(0);
        customCategoryMapper.insert(category);

        Map<String, Object> data = new HashMap<>();
        data.put("id", category.getId());
        data.put("name", category.getName());
        return data;
    }

    @Override
    public Map<String, Object> deleteCategory(Integer userId, Integer categoryId) {
        CustomCategory category = customCategoryMapper.findByIdAndUserId(categoryId, userId);
        if (category == null) {
            throw new IllegalArgumentException("分类不存在");
        }
        if (category.getIsDefault() != null && category.getIsDefault() == 1) {
            throw new IllegalArgumentException("默认分类\"其他\"不可删除");
        }

        // 将该分类下的题目迁移到"其他"
        CustomCategory defaultCategory = customCategoryMapper.findDefaultByUserId(userId);
        int movedCount = 0;
        if (defaultCategory != null) {
            movedCount = customQuestionMapper.updateCategoryId(userId, category.getId(), defaultCategory.getId());
        }

        // 删除分类
        customCategoryMapper.deleteByIdAndUserId(categoryId, userId);

        Map<String, Object> data = new HashMap<>();
        data.put("deleted", true);
        data.put("movedCount", movedCount);
        return data;
    }

    @Override
    public Map<String, Object> renameCategory(Integer userId, Integer categoryId, String name) {
        CustomCategory category = customCategoryMapper.findByIdAndUserId(categoryId, userId);
        if (category == null) {
            throw new IllegalArgumentException("分类不存在");
        }

        validateCategoryName(name);

        // 微信内容安全检测
        wxSecurityService.checkText(name);

        // 如果名称没变，直接返回
        if (category.getName().equals(name.trim())) {
            Map<String, Object> data = new HashMap<>();
            data.put("id", category.getId());
            data.put("name", category.getName());
            return data;
        }

        // 唯一性校验
        if (customCategoryMapper.countByUserIdAndName(userId, name.trim()) > 0) {
            throw new IllegalArgumentException("分类名称已存在");
        }

        customCategoryMapper.updateName(categoryId, userId, name.trim());

        Map<String, Object> data = new HashMap<>();
        data.put("id", categoryId);
        data.put("name", name.trim());
        return data;
    }

    /**
     * 校验分类名称（仅中文，不超过10个字）
     */
    private void validateCategoryName(String name) {
        if (name == null || name.trim().isEmpty()) {
            throw new IllegalArgumentException("分类名称不能为空");
        }
        name = name.trim();
        if (name.length() > 10) {
            throw new IllegalArgumentException("分类名称不超过10个字");
        }
        if (!name.matches(CHINESE_REGEX)) {
            throw new IllegalArgumentException("分类名称仅支持中文");
        }
    }
}
