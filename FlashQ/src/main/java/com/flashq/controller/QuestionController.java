package com.flashq.controller;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.common.Result;
import com.flashq.entity.Question;
import com.flashq.entity.Subject;
import com.flashq.entity.User;
import com.flashq.mapper.FavoriteMapper;
import com.flashq.mapper.SubjectMapper;
import com.flashq.mapper.UserMapper;
import com.flashq.service.QuestionService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/question")
@RequiredArgsConstructor
public class QuestionController {

    private static final Logger log = LoggerFactory.getLogger(QuestionController.class);

    private final UserMapper userMapper;

    private final QuestionService questionService;

    private final SubjectMapper subjectMapper;

    private final FavoriteMapper favoriteMapper;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // 接口文档 4.3：GET /api/question/random
    @GetMapping("/random")
    public Result<Map<String, Object>> random(
            @RequestParam(value = "subjectId", required = false) Integer subjectId,
            @RequestParam(value = "difficulty", required = false) Integer difficulty,
            @RequestParam(value = "quizType", required = false) String quizType,
            @RequestParam(value = "style", required = false) String style,
            HttpServletRequest request) {
        Question question = questionService.getRandomQuestion(subjectId, difficulty, quizType, style);
        if (question == null) {
            return Result.success(null);
        }

        // 组装前端需要的字段结构
        Map<String, Object> data = new HashMap<>();
        data.put("id", question.getId());
        data.put("subjectId", question.getSubjectId());
        data.put("content", question.getContent());
        data.put("difficulty", question.getDifficulty());
        // 题目类型与风格（前端用于区分代码题/面试题及快速/质量刷）
        data.put("quizType", question.getQuizType());
        data.put("style", question.getStyle());
        // 题目来源（面试题的企业名，未填写时前端显示"未知"）
        data.put("source", question.getSource() != null ? question.getSource() : "");

        // optionList 是 JSON 字符串，需解析为数组返回给前端
        // 面试题改为问答题/OJ题模式（不再以选择题形式展示），统一返回空选项数组，
        // 避免历史数据中的选项泄露，前端依据 quizType==='interview' 切换到"查看解析"流程
        List<String> options = new ArrayList<>();
        if (!"interview".equals(question.getQuizType())) {
            if (question.getOptionList() != null && !question.getOptionList().isEmpty()) {
                try {
                    options = objectMapper.readValue(question.getOptionList(), new TypeReference<List<String>>() {});
                } catch (Exception e) {
                    log.warn("解析选项JSON失败: {}", e.getMessage());
                }
            }
        }
        data.put("options", options);

        // 查科目名称
        String subjectName = "";
        if (question.getSubjectId() != null) {
            Subject subject = subjectMapper.findById(question.getSubjectId());
            if (subject != null) {
                subjectName = subject.getName();
            }
        }
        data.put("subjectName", subjectName);

        // 面试题改为问答题/OJ题模式：题目下无选项，前端直接展示"查看解析"按钮，
        // 因此 /random 接口对面试题类型直接附带解析文本（其他类型保持原行为不返回，避免选择题泄露答案）
        if ("interview".equals(question.getQuizType())) {
            data.put("explanation", question.getExplanation() != null ? question.getExplanation() : "");
        }

        // 查收藏状态：登录用户返回真实状态，游客返回 false
        boolean isFavorited = false;
        String token = request.getHeader("Authorization");
        if (token != null && !token.isEmpty()) {
            User currentUser = userMapper.findByToken(token);
            if (currentUser != null) {
                isFavorited = favoriteMapper.countByUserAndQuestion(currentUser.getId(), question.getId()) > 0;
            }
        }
        data.put("isFavorited", isFavorited);

        return Result.success(data);
    }

    // 接口文档 4.4：POST /api/question/judge
    @PostMapping("/judge")
    public Result<Map<String, Object>> judge(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        Integer questionId = body.get("questionId") != null ? Integer.valueOf(body.get("questionId").toString()) : null;
        String userAnswer = (String) body.get("userAnswer");

        // 手动从请求头获取 token（因为 judge 被放行，拦截器不会自动设置 currentUser）
        User currentUser = null;
        String token = request.getHeader("Authorization");
        if (token != null && !token.isEmpty()) {
            // 通过 UserMapper 查用户（需注入）
            currentUser = userMapper.findByToken(token);
        }

        Map<String, Object> data = questionService.judgeQuestion(questionId, userAnswer, currentUser);
        return Result.success(data);
    }
}