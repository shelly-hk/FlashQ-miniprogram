package com.flashq.service.impl;

import com.flashq.entity.Question;
import com.flashq.entity.Subject;
import com.flashq.entity.WrongQuestion;
import com.flashq.mapper.FavoriteMapper;
import com.flashq.mapper.QuestionMapper;
import com.flashq.mapper.SubjectMapper;
import com.flashq.mapper.WrongQuestionMapper;
import com.flashq.service.WrongQuestionService;
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
public class WrongQuestionServiceImpl implements WrongQuestionService {

    private static final Logger log = LoggerFactory.getLogger(WrongQuestionServiceImpl.class);

    private final WrongQuestionMapper wrongQuestionMapper;

    private final QuestionMapper questionMapper;

    private final FavoriteMapper favoriteMapper;

    private final SubjectMapper subjectMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public List<Map<String, Object>> getWrongList(Integer userId) {
        List<WrongQuestion> wrongs = wrongQuestionMapper.findByUserId(userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (WrongQuestion wq : wrongs) {
            Question q = questionMapper.findById(wq.getQuestionId());
            if (q == null) continue;
            Map<String, Object> item = new HashMap<>();
            item.put("id", q.getId());
            item.put("questionId", q.getId());
            item.put("subjectName", getSubjectName(q.getSubjectId()));
            item.put("content", q.getContent());
            item.put("options", parseOptions(q.getOptionList()));
            item.put("correctAnswer", q.getAnswer());
            item.put("userAnswer", wq.getUserAnswer());
            item.put("difficulty", q.getDifficulty());
            item.put("explanation", q.getExplanation());
            item.put("wrongTimes", wq.getWrongTimes());
            item.put("lastWrongTime", wq.getLastWrongTime());
            item.put("isFavorited", favoriteMapper.countByUserAndQuestion(userId, q.getId()) > 0);
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
    public boolean deleteWrong(Integer userId, Integer questionId) {
        int rows = wrongQuestionMapper.deleteByUserIdAndQuestionId(userId, questionId);
        return rows > 0;
    }

    @Override
    public Map<String, Object> getWrongListPaged(Integer userId, int page, int size, Integer subjectId, String quizType) {
        int offset = (page - 1) * size;
        List<WrongQuestion> wrongs = wrongQuestionMapper.findByUserIdPaged(userId, subjectId, quizType, offset, size);
        int total = wrongQuestionMapper.countByUserId(userId, subjectId, quizType);

        List<Map<String, Object>> list = new ArrayList<>();
        for (WrongQuestion wq : wrongs) {
            Question q = questionMapper.findById(wq.getQuestionId());
            if (q == null) continue;
            list.add(buildWrongItem(userId, q, wq));
        }

        Map<String, Object> data = new HashMap<>();
        data.put("total", total);
        data.put("list", list);
        return data;
    }

    /**
     * 构建错题项（公共方法，供分页和全量查询复用）
     */
    private Map<String, Object> buildWrongItem(Integer userId, Question q, WrongQuestion wq) {
        Map<String, Object> item = new HashMap<>();
        item.put("id", q.getId());
        item.put("questionId", q.getId());
        item.put("subjectId", q.getSubjectId());
        item.put("subjectName", getSubjectName(q.getSubjectId()));
        item.put("content", q.getContent());
        item.put("options", parseOptions(q.getOptionList()));
        item.put("correctAnswer", q.getAnswer());
        item.put("userAnswer", wq.getUserAnswer());
        item.put("difficulty", q.getDifficulty());
        item.put("explanation", q.getExplanation());
        // 题目类型与来源（前端用于展示代码题/面试题标签和企业来源）
        item.put("quizType", q.getQuizType() != null ? q.getQuizType() : "it");
        item.put("source", q.getSource() != null ? q.getSource() : "");
        item.put("wrongTimes", wq.getWrongTimes());
        item.put("lastWrongTime", wq.getLastWrongTime());
        item.put("isFavorited", favoriteMapper.countByUserAndQuestion(userId, q.getId()) > 0);
        return item;
    }
}