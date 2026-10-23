package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.User;
import com.flashq.service.CustomWrongQuestionService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/custom/wrong")
@RequiredArgsConstructor
public class CustomWrongQuestionController {

    private final CustomWrongQuestionService customWrongQuestionService;

    // GET /api/custom/wrong/list
    @GetMapping("/list")
    public Result<Map<String, Object>> list(@RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "10") int size,
                                             @RequestParam(required = false) Integer categoryId,
                                             HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = customWrongQuestionService.getWrongListPaged(user.getId(), page, size, categoryId);
        return Result.success(data);
    }

    // POST /api/custom/wrong/delete
    @PostMapping("/delete")
    public Result<Map<String, Object>> delete(@RequestBody Map<String, Object> body,
                                                HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer questionId = body.get("questionId") != null ? Integer.valueOf(body.get("questionId").toString()) : null;
        boolean deleted = customWrongQuestionService.deleteWrong(user.getId(), questionId);
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return Result.success(data);
    }
}
