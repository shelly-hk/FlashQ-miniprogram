package com.flashq.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.entity.CustomCategory;
import com.flashq.entity.CustomQuestion;
import com.flashq.entity.User;
import com.flashq.mapper.CustomCategoryMapper;
import com.flashq.mapper.CustomFavoriteMapper;
import com.flashq.mapper.CustomQuestionMapper;
import com.flashq.mapper.CustomWrongQuestionMapper;
import com.flashq.mapper.UserMapper;
import com.flashq.service.CustomFavoriteService;
import com.flashq.service.CustomQuestionService;
import com.flashq.service.CustomWrongQuestionService;
import com.flashq.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class CustomQuestionServiceImpl implements CustomQuestionService {

    private static final Logger log = LoggerFactory.getLogger(CustomQuestionServiceImpl.class);

    private final CustomQuestionMapper customQuestionMapper;
    private final UserMapper userMapper;
    private final CustomCategoryMapper customCategoryMapper;
    private final CustomFavoriteMapper customFavoriteMapper;
    private final CustomFavoriteService customFavoriteService;
    private final CustomWrongQuestionMapper customWrongQuestionMapper;
    private final CustomWrongQuestionService customWrongQuestionService;
    /** 学习报告服务：答题事件上报（规范 5.1，异常隔离不影响答题主流程） */
    private final ReportService reportService;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Map<String, Object> getRandomQuestion(Integer userId, Integer difficulty) {
        return getRandomQuestion(userId, difficulty, null, null);
    }

    @Override
    public Map<String, Object> getRandomQuestion(Integer userId, Integer difficulty, Integer categoryId, Integer excludeId) {
        CustomQuestion q = customQuestionMapper.selectRandomByUserId(userId, difficulty, categoryId, excludeId);

        Map<String, Object> data = new HashMap<>();
        if (q == null) {
            return null;
        }

        data.put("id", q.getId());
        data.put("content", q.getContent());
        data.put("options", parseOptions(q.getOptionList()));
        // 不返回答案和解析，保护作答；但返回是否多选标识供前端渲染交互
        data.put("answer", null);
        data.put("isMultiChoice", isMultiChoice(q.getAnswer()));
        data.put("explanation", null);
        data.put("difficulty", q.getDifficulty());
        data.put("categoryId", q.getCategoryId());
        data.put("categoryName", getCategoryName(q.getCategoryId()));
        data.put("sourceFileName", q.getSourceFileName());
        // 查询真实收藏状态
        data.put("isFavorited", customFavoriteService.isFavorited(userId, q.getId()));

        // 附带返回当前自定义刷题统计
        User user = userMapper.findById(userId);
        if (user != null) {
            data.put("totalCount", user.getCustomTotalCount() != null ? user.getCustomTotalCount() : 0);
            data.put("todayCount", user.getCustomTodayCount() != null ? user.getCustomTodayCount() : 0);
        }
        return data;
    }

    @Override
    public Map<String, Object> judgeQuestion(Integer questionId, String userAnswer, Integer userId) {
        CustomQuestion q = customQuestionMapper.findByIdAndUserId(questionId, userId);

        Map<String, Object> result = new HashMap<>();
        if (q == null) {
            result.put("isCorrect", false);
            result.put("correctAnswer", "");
            result.put("explanation", "题目不存在");
            result.put("totalCount", null);
            result.put("todayCount", null);
            return result;
        }

        // 判题前对双方答案做标准化（提字母+排序），避免多选答案顺序差异导致误判
        boolean isCorrect = userAnswer != null
                && normalizeAnswer(userAnswer).equalsIgnoreCase(normalizeAnswer(q.getAnswer()));
        result.put("isCorrect", isCorrect);
        result.put("correctAnswer", q.getAnswer());
        result.put("explanation", q.getExplanation());

        // 记录错题（答错时）
        if (!isCorrect) {
            try {
                customWrongQuestionService.recordWrong(userId, questionId, userAnswer);
            } catch (Exception e) {
                log.warn("记录错题失败: {}", e.getMessage());
            }
        }

        // 更新自定义刷题统计（原子自增，规避并发竞态）
        User user = userMapper.findById(userId);
        if (user != null) {
            LocalDate today = LocalDate.now();
            userMapper.incrementCustomStats(userId, today);
            User latest = userMapper.findById(userId);
            result.put("totalCount", latest != null && latest.getCustomTotalCount() != null ? latest.getCustomTotalCount() : 0);
            result.put("todayCount", latest != null && latest.getCustomTodayCount() != null ? latest.getCustomTodayCount() : 0);
            // 学习报告事件上报（规范 5.1：等价 MQ 事件的同步落库，失败仅告警不阻断答题）
            try {
                String subjectKey = q.getCategoryId() != null ? "c_" + q.getCategoryId() : "c_0";
                reportService.recordAnswer(userId, subjectKey, isCorrect,
                        LocalDateTime.now(ReportService.ZONE));
            } catch (Exception e) {
                log.warn("学习报告事件上报失败: userId={}, err={}", userId, e.getMessage());
            }
        } else {
            result.put("totalCount", null);
            result.put("todayCount", null);
        }

        return result;
    }

    @Override
    public Map<String, Object> getQuestionList(Integer userId, int page, int size, String sourceFileName, Integer categoryId) {
        int offset = (page - 1) * size;
        List<CustomQuestion> questions = customQuestionMapper.findByUserId(userId, sourceFileName, categoryId, offset, size);
        int total = customQuestionMapper.countByUserId(userId, sourceFileName, categoryId);

        List<Map<String, Object>> list = new ArrayList<>();
        for (CustomQuestion q : questions) {
            Map<String, Object> item = new HashMap<>();
            item.put("id", q.getId());
            item.put("content", q.getContent());
            item.put("options", parseOptions(q.getOptionList()));
            item.put("correctAnswer", q.getAnswer());
            item.put("isMultiChoice", isMultiChoice(q.getAnswer()));
            item.put("explanation", q.getExplanation());
            item.put("difficulty", q.getDifficulty());
            item.put("categoryId", q.getCategoryId());
            item.put("categoryName", getCategoryName(q.getCategoryId()));
            item.put("sourceFileName", q.getSourceFileName());
            item.put("createTime", q.getCreateTime());
            item.put("isFavorited", customFavoriteService.isFavorited(userId, q.getId()));
            list.add(item);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("total", total);
        data.put("list", list);
        return data;
    }

    @Override
    public boolean deleteQuestion(Integer userId, Integer questionId) {
        // 1. 逻辑删除题目
        customQuestionMapper.softDelete(userId, questionId);
        // 2. 级联删除该题的自主题库收藏记录
        customFavoriteMapper.deleteByQuestionId(questionId);
        // 3. 级联删除该题的自主题库错题记录
        customWrongQuestionMapper.deleteByQuestionId(questionId);
        return true; // 幂等，不存在也返回 true
    }

    @Override
    public int deleteAllQuestions(Integer userId, Integer categoryId) {
        // 1. 先统计当前符合条件的题目数
        int count = customQuestionMapper.countByUserId(userId, null, categoryId);
        // 2. 批量逻辑删除
        customQuestionMapper.softDeleteAllByUserId(userId, categoryId);
        return count;
    }

    @Override
    public Map<String, Object> updateQuestionCategory(Integer userId, Integer questionId, Integer categoryId) {
        // 校验题目归属
        CustomQuestion q = customQuestionMapper.findByIdAndUserId(questionId, userId);
        if (q == null) {
            throw new IllegalArgumentException("题目不存在");
        }
        // 校验分类归属
        CustomCategory category = customCategoryMapper.findByIdAndUserId(categoryId, userId);
        if (category == null) {
            throw new IllegalArgumentException("分类不存在");
        }

        customQuestionMapper.updateQuestionCategory(questionId, userId, categoryId);

        Map<String, Object> data = new HashMap<>();
        data.put("updated", true);
        return data;
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

    /** 判断答案是否为多选（长度>1） */
    private boolean isMultiChoice(String answer) {
        return answer != null && answer.length() > 1;
    }

    /** 标准化答案：提取字母、转大写、去重、按字母升序排序，用于判题比较 */
    private String normalizeAnswer(String answer) {
        if (answer == null) return "";
        StringBuilder sb = new StringBuilder();
        boolean[] seen = new boolean[26];
        for (int i = 0; i < answer.length(); i++) {
            char c = answer.charAt(i);
            if (c >= 'A' && c <= 'Z') {
                seen[c - 'A'] = true;
            } else if (c >= 'a' && c <= 'z') {
                seen[c - 'a'] = true;
            }
        }
        for (int i = 0; i < 26; i++) {
            if (seen[i]) sb.append((char) ('A' + i));
        }
        return sb.toString();
    }

    private String getCategoryName(Integer categoryId) {
        if (categoryId == null) return "其他";
        CustomCategory cat = customCategoryMapper.findById(categoryId);
        return cat != null ? cat.getName() : "其他";
    }
}
