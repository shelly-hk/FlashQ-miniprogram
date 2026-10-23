package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.User;
import com.flashq.service.CustomCategoryService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/custom/category")
@RequiredArgsConstructor
public class CustomCategoryController {

    private final CustomCategoryService customCategoryService;

    // 接口文档 4.1：GET /api/custom/category/list
    @GetMapping("/list")
    public Result<Map<String, Object>> list(HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = customCategoryService.getCategoryList(user.getId());
        return Result.success(data);
    }

    // 接口文档 4.2：POST /api/custom/category/create
    @PostMapping("/create")
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> body,
                                                HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        String name = (String) body.get("name");
        try {
            Map<String, Object> data = customCategoryService.createCategory(user.getId(), name);
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // 接口文档 4.3：POST /api/custom/category/delete
    @PostMapping("/delete")
    public Result<Map<String, Object>> delete(@RequestBody Map<String, Object> body,
                                                HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer categoryId = body.get("categoryId") != null ? Integer.valueOf(body.get("categoryId").toString()) : null;
        try {
            Map<String, Object> data = customCategoryService.deleteCategory(user.getId(), categoryId);
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            String msg = e.getMessage();
            if (msg.contains("不存在")) {
                return Result.error(404, msg);
            }
            return Result.error(400, msg);
        }
    }

    // 接口文档 4.4：POST /api/custom/category/rename
    @PostMapping("/rename")
    public Result<Map<String, Object>> rename(@RequestBody Map<String, Object> body,
                                                HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer categoryId = body.get("categoryId") != null ? Integer.valueOf(body.get("categoryId").toString()) : null;
        String name = (String) body.get("name");
        try {
            Map<String, Object> data = customCategoryService.renameCategory(user.getId(), categoryId, name);
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
