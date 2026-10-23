package com.flashq.service.impl;

import com.flashq.entity.Question;
import com.flashq.entity.User;
import com.flashq.entity.WrongQuestion;
import com.flashq.mapper.QuestionMapper;
import com.flashq.mapper.UserMapper;
import com.flashq.mapper.WrongQuestionMapper;
import com.flashq.service.QuestionService;
import com.flashq.service.ReportService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class QuestionServiceImpl implements QuestionService {

    private static final Logger log = LoggerFactory.getLogger(QuestionServiceImpl.class);

    private final QuestionMapper questionMapper;

    private final UserMapper userMapper;

    private final WrongQuestionMapper wrongQuestionMapper;

    /** 学习报告服务：答题事件上报（规范 5.1，异常隔离不影响答题主流程） */
    private final ReportService reportService;

    @Override
    public Question getRandomQuestion(Integer subjectId, Integer difficulty, String quizType, String style) {
        return questionMapper.selectRandom(subjectId, difficulty, quizType, style);
    }

    @Override
    public Map<String, Object> judgeQuestion(Integer questionId, String userAnswer, User currentUser) {
        // 1. 查题目
        Question question = questionMapper.findById(questionId);
        Map<String, Object> result = new HashMap<>();
        if (question == null) {
            result.put("isCorrect", false);
            result.put("correctAnswer", "");
            result.put("explanation", "题目不存在");
            result.put("totalCount", null);
            result.put("todayCount", null);
            result.put("wrongCount", null);
            return result;
        }
        // 2. 判断对错（标准化答案比较，兼容多选顺序差异）
        boolean isCorrect = userAnswer != null
                && normalizeAnswer(userAnswer).equalsIgnoreCase(normalizeAnswer(question.getAnswer()));
        result.put("isCorrect", isCorrect);
        result.put("correctAnswer", question.getAnswer());
        result.put("explanation", question.getExplanation());
        // 3. 若已登录，则处理记录逻辑
        if (currentUser != null) {
            int userId = currentUser.getId();
            LocalDate today = LocalDate.now();
            // 原子自增计数（单条 SQL 处理跨天清零 + 自增，规避并发竞态）
            userMapper.incrementStats(userId, today);
            // 学习报告事件上报（规范 5.1：等价 MQ 事件的同步落库，失败仅告警不阻断答题）
            try {
                String subjectKey = question.getSubjectId() != null ? "s_" + question.getSubjectId() : "s_0";
                reportService.recordAnswer(userId, subjectKey, isCorrect,
                        LocalDateTime.now(ReportService.ZONE));
            } catch (Exception e) {
                log.warn("学习报告事件上报失败: userId={}, err={}", userId, e.getMessage());
            }
            // 重新查询以获取最新计数返回给前端
            User latest = userMapper.findById(userId);
            // 错题本处理
            if (!isCorrect) {
                // 答错：写入/累加错题本
                WrongQuestion wq = wrongQuestionMapper.findByUserIdAndQuestionId(userId, questionId);
                if (wq == null) {
                    wq = new WrongQuestion();
                    wq.setUserId(userId);
                    wq.setQuestionId(questionId);
                    wq.setUserAnswer(userAnswer);
                    wq.setWrongTimes(1);
                    wq.setLastWrongTime(LocalDateTime.now());
                    wrongQuestionMapper.insert(wq);
                } else {
                    wq.setWrongTimes(wq.getWrongTimes() + 1);
                    wq.setUserAnswer(userAnswer);
                    wq.setLastWrongTime(LocalDateTime.now());
                    wrongQuestionMapper.updateWrongTimes(wq);
                }
            }
            // 答对后不再自动移除错题，由用户在前端自行决定是否删除
            // 返回登录后的统计
            result.put("totalCount", latest != null ? latest.getTotalCount() : null);
            result.put("todayCount", latest != null ? latest.getTodayCount() : null);
            // 错题数按当前题库统计：代码题/面试题只算本库，随机题库题目算 IT 库（排除 code/interview）
            String bankType = ("code".equals(question.getQuizType()) || "interview".equals(question.getQuizType()))
                    ? question.getQuizType() : null;
            result.put("wrongCount", wrongQuestionMapper.countByUserId(userId, null, bankType));
        } else {
            // 游客：不记录
            result.put("totalCount", null);
            result.put("todayCount", null);
            result.put("wrongCount", null);
        }
        return result;
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
}
