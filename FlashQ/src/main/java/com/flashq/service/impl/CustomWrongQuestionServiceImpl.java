package com.flashq.service.impl;

import com.flashq.entity.CustomQuestion;
import com.flashq.entity.CustomWrongQuestion;
import com.flashq.mapper.CustomCategoryMapper;
import com.flashq.mapper.CustomFavoriteMapper;
import com.flashq.mapper.CustomQuestionMapper;
import com.flashq.mapper.CustomWrongQuestionMapper;
import com.flashq.service.CustomWrongQuestionService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CustomWrongQuestionServiceImpl implements CustomWrongQuestionService {

    private static final Logger log = LoggerFactory.getLogger(CustomWrongQuestionServiceImpl.class);

    private final CustomWrongQuestionMapper customWrongQuestionMapper;

    private final CustomQuestionMapper customQuestionMapper;

    private final CustomFavoriteMapper customFavoriteMapper;

    private final CustomCategoryMapper customCategoryMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public List<Map<String, Object>> getWrongList(Integer userId) {
        List<CustomWrongQuestion> wrongs = customWrongQuestionMapper.findByUserId(userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (CustomWrongQuestion wq : wrongs) {
            CustomQuestion q = customQuestionMapper.findByIdAndUserId(wq.getQuestionId(), userId);
            if (q == null) continue;
            Map<String, Object> item = new HashMap<>();
            item.put("id", q.getId());
            item.put("questionId", q.getId());
            item.put("content", q.getContent());
            item.put("options", parseOptions(q.getOptionList()));
            item.put("correctAnswer", q.getAnswer());
            item.put("isMultiChoice", q.getAnswer() != null && q.getAnswer().length() > 1);
            item.put("userAnswer", wq.getUserAnswer());
            item.put("difficulty", q.getDifficulty());
            item.put("explanation", q.getExplanation());
            item.put("categoryId", q.getCategoryId());
            item.put("sourceFileName", q.getSourceFileName());
            item.put("wrongTimes", wq.getWrongTimes());
            item.put("lastWrongTime", wq.getLastWrongTime());
            item.put("isFavorited", customFavoriteMapper.countByUserAndQuestion(userId, q.getId()) > 0);
            result.add(item);
        }
        return result;
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
    public boolean deleteWrong(Integer userId, Integer questionId) {
        int rows = customWrongQuestionMapper.deleteByUserIdAndQuestionId(userId, questionId);
        return rows > 0;
    }

    @Override
    public Map<String, Object> getWrongListPaged(Integer userId, int page, int size, Integer categoryId) {
        int offset = (page - 1) * size;
        List<CustomWrongQuestion> wrongs = customWrongQuestionMapper.findByUserIdPaged(userId, categoryId, offset, size);
        int total = customWrongQuestionMapper.countByUserId(userId, categoryId);

        List<Map<String, Object>> list = new ArrayList<>();
        for (CustomWrongQuestion wq : wrongs) {
            CustomQuestion q = customQuestionMapper.findByIdAndUserId(wq.getQuestionId(), userId);
            if (q == null) continue;
            list.add(buildCustomWrongItem(userId, q, wq));
        }

        Map<String, Object> data = new HashMap<>();
        data.put("total", total);
        data.put("list", list);
        return data;
    }

    /**
     * 构建自主题库错题项（公共方法）
     */
    private Map<String, Object> buildCustomWrongItem(Integer userId, CustomQuestion q, CustomWrongQuestion wq) {
        Map<String, Object> item = new HashMap<>();
        item.put("id", q.getId());
        item.put("questionId", q.getId());
        item.put("content", q.getContent());
        item.put("options", parseOptions(q.getOptionList()));
        item.put("correctAnswer", q.getAnswer());
        item.put("isMultiChoice", q.getAnswer() != null && q.getAnswer().length() > 1);
        item.put("userAnswer", wq.getUserAnswer());
        item.put("difficulty", q.getDifficulty());
        item.put("explanation", q.getExplanation());
        item.put("categoryId", q.getCategoryId());
        item.put("categoryName", getCategoryName(q.getCategoryId()));
        item.put("sourceFileName", q.getSourceFileName());
        item.put("wrongTimes", wq.getWrongTimes());
        item.put("lastWrongTime", wq.getLastWrongTime());
        item.put("isFavorited", customFavoriteMapper.countByUserAndQuestion(userId, q.getId()) > 0);
        return item;
    }

    private String getCategoryName(Integer categoryId) {
        if (categoryId == null) return "其他";
        com.flashq.entity.CustomCategory cat = customCategoryMapper.findById(categoryId);
        return cat != null ? cat.getName() : "其他";
    }

    @Override
    public void recordWrong(Integer userId, Integer questionId, String userAnswer) {
        CustomWrongQuestion existing = customWrongQuestionMapper.findByUserIdAndQuestionId(userId, questionId);
        if (existing == null) {
            // 首次答错 → 新增记录
            CustomWrongQuestion wq = new CustomWrongQuestion();
            wq.setUserId(userId);
            wq.setQuestionId(questionId);
            wq.setUserAnswer(userAnswer);
            wq.setWrongTimes(1);
            wq.setLastWrongTime(LocalDateTime.now());
            customWrongQuestionMapper.insert(wq);
        } else {
            // 再次答错 → 累加次数
            existing.setWrongTimes(existing.getWrongTimes() + 1);
            existing.setUserAnswer(userAnswer);
            existing.setLastWrongTime(LocalDateTime.now());
            customWrongQuestionMapper.updateWrongTimes(existing);
        }
    }
}
