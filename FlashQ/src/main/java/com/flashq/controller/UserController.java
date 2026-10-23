package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.User;
import com.flashq.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Map;

@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    // 接口文档 4.1：POST /api/wx/login
    @PostMapping("/wx/login")
    public Result<Map<String, Object>> login(@RequestBody Map<String, String> body) {
        String code = body.get("code");
        Map<String, Object> data = userService.login(code);
        return Result.success(data);
    }

    // 接口文档 4.8：GET /api/user/info
    @GetMapping("/user/info")
    public Result<Map<String, Object>> getUserInfo(HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = userService.getUserInfo(user.getId());
        return Result.success(data);
    }

    // 接口文档补充5 4.1：POST /api/user/profile（仅修改昵称）
    @PostMapping("/user/profile")
    public Result<Map<String, Object>> updateProfile(@RequestBody Map<String, String> body,
                                                      HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        String nickName = body.get("nickName");
        try {
            Map<String, Object> data = userService.updateNickName(user.getId(), nickName);
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // 接口文档补充5 4.2：POST /api/user/avatar（仅上传头像）
    @PostMapping("/user/avatar")
    public Result<Map<String, Object>> uploadAvatar(@RequestParam("file") MultipartFile file,
                                                      HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        try {
            Map<String, Object> data = userService.uploadAvatar(file, user.getId());
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.error(400, e.getMessage());
        } catch (IOException e) {
            return Result.error(500, "头像上传失败，请重试");
        }
    }

    // 接口文档补充5 4.3：POST /api/user/profile/update（同时修改头像和昵称）
    @PostMapping("/user/profile/update")
    public Result<Map<String, Object>> updateProfileWithAvatar(
            @RequestParam(value = "file", required = false) MultipartFile file,
            @RequestParam(value = "nickName", required = false) String nickName,
            HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        try {
            Map<String, Object> data = userService.updateProfile(file, nickName, user.getId());
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.error(400, e.getMessage());
        } catch (IOException e) {
            return Result.error(500, "头像上传失败，请重试");
        }
    }
}