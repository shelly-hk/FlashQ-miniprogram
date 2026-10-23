package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.User;
import com.flashq.service.FavoriteService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/question/favorite")
@RequiredArgsConstructor
public class FavoriteController {

    private final FavoriteService favoriteService;

    // 接口文档 4.5：POST /api/question/favorite/toggle
    @PostMapping("/toggle")
    public Result<Map<String, Object>> toggle(@RequestBody Map<String, Object> body,
                                              HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer questionId = body.get("questionId") != null ? Integer.valueOf(body.get("questionId").toString()) : null;
        boolean isFav = favoriteService.isFavorite(user.getId(), questionId);
        Map<String, Object> data = new HashMap<>();
        data.put("isFavorited", isFav);
        return Result.success(data);
    }

    // 接口文档 4.6：GET /api/question/favorite/list
    @GetMapping("/list")
    public Result<Map<String, Object>> list(@RequestParam(defaultValue = "1") int page,
                                             @RequestParam(defaultValue = "10") int size,
                                             @RequestParam(required = false) Integer subjectId,
                                             @RequestParam(required = false) String quizType,
                                             HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = favoriteService.getFavoriteListPaged(user.getId(), page, size, subjectId, quizType);
        return Result.success(data);
    }

    // 补充接口：POST /api/question/favorite/delete
    @PostMapping("/delete")
    public Result<Map<String, Object>> delete(@RequestBody Map<String, Object> body,
                                              HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer questionId = body.get("questionId") != null ? Integer.valueOf(body.get("questionId").toString()) : null;
        boolean deleted = favoriteService.deleteFavorite(user.getId(), questionId);
        Map<String, Object> data = new HashMap<>();
        data.put("deleted", deleted);
        return Result.success(data);
    }
}