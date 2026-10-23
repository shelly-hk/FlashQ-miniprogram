package com.flashq.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.entity.CustomFavorite;
import com.flashq.entity.CustomQuestion;
import com.flashq.mapper.CustomFavoriteMapper;
import com.flashq.mapper.CustomQuestionMapper;
import com.flashq.mapper.CustomCategoryMapper;
import com.flashq.service.CustomFavoriteService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CustomFavoriteServiceImpl implements CustomFavoriteService {

    private static final Logger log = LoggerFactory.getLogger(CustomFavoriteServiceImpl.class);

    private final CustomFavoriteMapper customFavoriteMapper;
    private final CustomQuestionMapper customQuestionMapper;
    private final CustomCategoryMapper customCategoryMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Map<String, Object> toggleFavorite(Integer userId, Integer questionId) {
        // 校验题目归属当前用户，防止越权收藏他人题目造成数据污染
        if (questionId == null || customQuestionMapper.findByIdAndUserId(questionId, userId) == null) {
            throw new IllegalArgumentException("题目不存在或无权操作");
        }
        int count = customFavoriteMapper.countByUserAndQuestion(userId, questionId);
        boolean isFavorited;
        if (count > 0) {
            // 已收藏 → 取消收藏
            customFavoriteMapper.deleteByUserIdAndQuestionId(userId, questionId);
            isFavorited = false;
        } else {
            // 未收藏 → 新增收藏
            CustomFavorite favorite = new CustomFavorite();
            favorite.setUserId(userId);
            favorite.setQuestionId(questionId);
            customFavoriteMapper.insert(favorite);
            isFavorited = true;
        }

        Map<String, Object> data = new HashMap<>();
        data.put("isFavorited", isFavorited);
        return data;
    }

    @Override
    public Map<String, Object> getFavoriteList(Integer userId, int page, int size, Integer categoryId) {
        int offset = (page - 1) * size;
        List<CustomFavorite> favorites = customFavoriteMapper.findByUserId(userId, categoryId, offset, size);
        int total = customFavoriteMapper.countByUserId(userId, categoryId);

        List<Map<String, Object>> list = new ArrayList<>();
        for (CustomFavorite fav : favorites) {
            CustomQuestion q = customQuestionMapper.findByIdAndUserId(fav.getQuestionId(), userId);
            if (q == null) continue; // 题目已被删除，跳过

            Map<String, Object> item = new HashMap<>();
            item.put("id", q.getId());
            item.put("questionId", q.getId());
            item.put("content", q.getContent());
            item.put("options", parseOptions(q.getOptionList()));
            item.put("correctAnswer", q.getAnswer());
            item.put("isMultiChoice", q.getAnswer() != null && q.getAnswer().length() > 1);
            item.put("explanation", q.getExplanation());
            item.put("difficulty", q.getDifficulty());
            item.put("categoryId", q.getCategoryId());
            item.put("categoryName", getCategoryName(q.getCategoryId()));
            item.put("sourceFileName", q.getSourceFileName());
            item.put("favoriteTime", fav.getCreateTime());
            item.put("isFavorited", true);
            list.add(item);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("total", total);
        data.put("list", list);
        return data;
    }

    @Override
    public boolean isFavorited(Integer userId, Integer questionId) {
        return customFavoriteMapper.countByUserAndQuestion(userId, questionId) > 0;
    }

    @Override
    public Map<String, Object> deleteFavorite(Integer userId, Integer questionId) {
        int rows = customFavoriteMapper.deleteByUserIdAndQuestionId(userId, questionId);
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", rows > 0);
        return data;
    }

    private String getCategoryName(Integer categoryId) {
        if (categoryId == null) return "其他";
        com.flashq.entity.CustomCategory cat = customCategoryMapper.findById(categoryId);
        return cat != null ? cat.getName() : "其他";
    }

    private List<String> parseOptions(String optionList) {
        if (optionList == null || optionList.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(optionList, new TypeReference<List<String>>() {});
        } catch (Exception e) {
            log.warn("解析选项JSON失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }
}
