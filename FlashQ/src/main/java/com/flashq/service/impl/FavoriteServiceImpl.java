package com.flashq.service.impl;

import com.flashq.entity.Favorite;
import com.flashq.entity.Question;
import com.flashq.entity.Subject;
import com.flashq.mapper.FavoriteMapper;
import com.flashq.mapper.QuestionMapper;
import com.flashq.mapper.SubjectMapper;
import com.flashq.service.FavoriteService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class FavoriteServiceImpl implements FavoriteService {

    private static final Logger log = LoggerFactory.getLogger(FavoriteServiceImpl.class);

    private final FavoriteMapper favoriteMapper;

    private final QuestionMapper questionMapper;

    private final SubjectMapper subjectMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // 收藏 toggle 临界区锁（防止并发双击导致重复插入收藏记录）
    private final Object favoriteToggleLock = new Object();

    @Override
    public boolean isFavorite(Integer userId, Integer questionId) {
        if (questionId == null) {
            throw new IllegalArgumentException("题目ID不能为空");
        }
        // 临界区：检查-写入非原子，并发双击会插入重复记录，加锁保证幂等
        synchronized (favoriteToggleLock) {
            // 判断是否已收藏
            int count = favoriteMapper.countByUserAndQuestion(userId, questionId);
            if (count > 0) {
                // 已收藏 → 取消收藏
                favoriteMapper.deleteByUserIdAndQuestionId(userId, questionId);
                return false;
            } else {
                // 未收藏 → 新增收藏
                Favorite favorite = new Favorite();
                favorite.setUserId(userId);
                favorite.setQuestionId(questionId);
                favoriteMapper.insert(favorite);
                return true;
            }
        }
    }

    @Override
    public List<Map<String, Object>> getFavoriteList(Integer userId) {
        // 查用户收藏记录
        List<Favorite> favorites = favoriteMapper.findByUserId(userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Favorite fav : favorites) {
            // 根据题目ID查题目详情
            Question q = questionMapper.findById(fav.getQuestionId());
            if (q == null) continue;
            Map<String, Object> item = new HashMap<>();
            item.put("id", q.getId());
            item.put("questionId", q.getId());
            item.put("subjectName", getSubjectName(q.getSubjectId()));
            item.put("content", q.getContent());
            item.put("options", parseOptions(q.getOptionList()));
            item.put("correctAnswer", q.getAnswer());
            item.put("difficulty", q.getDifficulty());
            item.put("explanation", q.getExplanation());
            item.put("favoriteTime", fav.getCreateTime());
            item.put("isFavorited", true);
            result.add(item);
        }
        return result;
    }

    private String getSubjectName(Integer subjectId) {
        if (subjectId == null) return "";
        Subject subject = subjectMapper.findById(subjectId);
        return subject != null ? subject.getName() : "";
    }

    @SuppressWarnings("unchecked")
    private List<String> parseOptions(String optionList) {
        if (optionList == null || optionList.isEmpty()) {
            return new ArrayList<>();
        }
        try {
            return objectMapper.readValue(optionList, List.class);
        } catch (Exception e) {
            log.warn("解析选项JSON失败: {}", e.getMessage());
            return new ArrayList<>();
        }
    }

    @Override
    public boolean deleteFavorite(Integer userId, Integer questionId) {
        int rows = favoriteMapper.deleteByUserIdAndQuestionId(userId, questionId);
        return rows > 0;
    }

    @Override
    public Map<String, Object> getFavoriteListPaged(Integer userId, int page, int size, Integer subjectId, String quizType) {
        int offset = (page - 1) * size;
        List<Favorite> favorites = favoriteMapper.findByUserIdPaged(userId, subjectId, quizType, offset, size);
        int total = favoriteMapper.countByUserId(userId, subjectId, quizType);

        List<Map<String, Object>> list = new ArrayList<>();
        for (Favorite fav : favorites) {
            Question q = questionMapper.findById(fav.getQuestionId());
            if (q == null) continue;
            list.add(buildFavoriteItem(q, fav));
        }

        Map<String, Object> data = new HashMap<>();
        data.put("total", total);
        data.put("list", list);
        return data;
    }

    /**
     * 构建收藏项（公共方法，供分页和全量查询复用）
     */
    private Map<String, Object> buildFavoriteItem(Question q, Favorite fav) {
        Map<String, Object> item = new HashMap<>();
        item.put("id", q.getId());
        item.put("questionId", q.getId());
        item.put("subjectId", q.getSubjectId());
        item.put("subjectName", getSubjectName(q.getSubjectId()));
        item.put("content", q.getContent());
        item.put("options", parseOptions(q.getOptionList()));
        item.put("correctAnswer", q.getAnswer());
        item.put("difficulty", q.getDifficulty());
        item.put("explanation", q.getExplanation());
        // 题目类型与来源（前端用于展示代码题/面试题标签和企业来源）
        item.put("quizType", q.getQuizType() != null ? q.getQuizType() : "it");
        item.put("source", q.getSource() != null ? q.getSource() : "");
        item.put("favoriteTime", fav.getCreateTime());
        item.put("isFavorited", true);
        return item;
    }
}