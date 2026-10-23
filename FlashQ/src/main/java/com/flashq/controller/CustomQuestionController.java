package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.User;
import com.flashq.service.CustomQuestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/custom/question")
@RequiredArgsConstructor
public class CustomQuestionController {

    private final CustomQuestionService customQuestionService;

    // 接口文档 4.5：GET /api/custom/question/random
    @GetMapping("/random")
    public Result<Map<String, Object>> random(@RequestParam(value = "difficulty", required = false) Integer difficulty,
                                               @RequestParam(value = "categoryId", required = false) Integer categoryId,
                                               @RequestParam(value = "excludeId", required = false) Integer excludeId,
                                               HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = customQuestionService.getRandomQuestion(user.getId(), difficulty, categoryId, excludeId);
        if (data == null) {
            return Result.error(404, "自主题库暂无题目，快去上传文件生成题目吧");
        }
        return Result.success(data);
    }

    // 接口文档 4.6：POST /api/custom/question/judge
    @PostMapping("/judge")
    public Result<Map<String, Object>> judge(@RequestBody Map<String, Object> body,
                                              HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer questionId = body.get("questionId") != null ? Integer.valueOf(body.get("questionId").toString()) : null;
        String userAnswer = (String) body.get("userAnswer");
        Map<String, Object> data = customQuestionService.judgeQuestion(questionId, userAnswer, user.getId());
        return Result.success(data);
    }

    // 接口文档 4.7：GET /api/custom/question/list
    @GetMapping("/list")
    public Result<Map<String, Object>> list(@RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "10") int size,
                                             @RequestParam(value = "sourceFileName", required = false) String sourceFileName,
                                             @RequestParam(value = "categoryId", required = false) Integer categoryId,
                                             HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = customQuestionService.getQuestionList(user.getId(), page, size, sourceFileName, categoryId);
        return Result.success(data);
    }

    // 接口文档 4.8：POST /api/custom/question/delete
    @PostMapping("/delete")
    public Result<Map<String, Object>> delete(@RequestBody Map<String, Object> body,
                                               HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer questionId = body.get("questionId") != null ? Integer.valueOf(body.get("questionId").toString()) : null;
        boolean deleted = customQuestionService.deleteQuestion(user.getId(), questionId);
        Map<String, Object> data = new java.util.HashMap<>();
        data.put("deleted", deleted);
        return Result.success(data);
    }

    // POST /api/custom/question/deleteAll — 批量删除全部题目（可选按分类）
    @PostMapping("/deleteAll")
    public Result<Map<String, Object>> deleteAll(@RequestBody Map<String, Object> body,
                                                  HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer categoryId = body.get("categoryId") != null ? Integer.valueOf(body.get("categoryId").toString()) : null;
        int count = customQuestionService.deleteAllQuestions(user.getId(), categoryId);
        Map<String, Object> data = new java.util.HashMap<>();
        data.put("deletedCount", count);
        return Result.success(data);
    }

    // 接口文档 4.9：POST /api/custom/question/updateCategory
    @PostMapping("/updateCategory")
    public Result<Map<String, Object>> updateCategory(@RequestBody Map<String, Object> body,
                                                        HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer questionId = body.get("questionId") != null ? Integer.valueOf(body.get("questionId").toString()) : null;
        Integer categoryId = body.get("categoryId") != null ? Integer.valueOf(body.get("categoryId").toString()) : null;
        try {
            Map<String, Object> data = customQuestionService.updateQuestionCategory(user.getId(), questionId, categoryId);
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            String msg = e.getMessage();
            if (msg.contains("不存在")) {
                return Result.error(404, msg);
            }
            return Result.error(400, msg);
        }
    }
}
