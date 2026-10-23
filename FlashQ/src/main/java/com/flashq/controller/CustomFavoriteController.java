package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.User;
import com.flashq.service.CustomFavoriteService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/custom/favorite")
@RequiredArgsConstructor
public class CustomFavoriteController {

    private final CustomFavoriteService customFavoriteService;

    // 接口文档 4.10：POST /api/custom/favorite/toggle
    @PostMapping("/toggle")
    public Result<Map<String, Object>> toggle(@RequestBody Map<String, Object> body,
                                                HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer questionId = body.get("questionId") != null ? Integer.valueOf(body.get("questionId").toString()) : null;
        Map<String, Object> data = customFavoriteService.toggleFavorite(user.getId(), questionId);
        return Result.success(data);
    }

    // 接口文档 4.11：GET /api/custom/favorite/list
    @GetMapping("/list")
    public Result<Map<String, Object>> list(@RequestParam(defaultValue = "1") int page,
                                              @RequestParam(defaultValue = "10") int size,
                                              @RequestParam(required = false) Integer categoryId,
                                              HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = customFavoriteService.getFavoriteList(user.getId(), page, size, categoryId);
        return Result.success(data);
    }

    // 接口文档 4.12：POST /api/custom/favorite/delete
    @PostMapping("/delete")
    public Result<Map<String, Object>> delete(@RequestBody Map<String, Object> body,
                                                HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer questionId = body.get("questionId") != null ? Integer.valueOf(body.get("questionId").toString()) : null;
        Map<String, Object> data = customFavoriteService.deleteFavorite(user.getId(), questionId);
        return Result.success(data);
    }
}
