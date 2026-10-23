package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.User;
import com.flashq.mapper.UserMapper;
import com.flashq.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/rank")
@RequiredArgsConstructor
public class RankController {

    private final UserService userService;
    private final UserMapper userMapper;

    // 接口文档 4.9：GET /api/rank/list?type=total|today
    // 公开接口（游客也可访问），但登录用户会额外获得 myRank
    @GetMapping("/list")
    public Result<Map<String, Object>> getRankList(
            @RequestParam(value = "type", defaultValue = "total") String type,
            HttpServletRequest request) {
        // 该接口被排除在 LoginInterceptor 之外，需要手动解析 token
        Integer userId = null;
        String token = request.getHeader("Authorization");
        if (token != null && !token.isEmpty()) {
            User user = userMapper.findByToken(token);
            if (user != null) {
                userId = user.getId();
            }
        }
        Map<String, Object> data = userService.getRankList(userId, type);
        return Result.success(data);
    }

    // POST /api/rank/like — 为排行榜用户点赞
    // Body: { "targetId": 123, "rankType": "total" }
    @PostMapping("/like")
    public Result<Map<String, Object>> likeUser(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        Integer targetId = body.get("targetId") != null ? Integer.valueOf(body.get("targetId").toString()) : null;
        String rankType = body.get("rankType") != null ? String.valueOf(body.get("rankType")) : "total";

        // 从 LoginInterceptor 获取当前登录用户
        User currentUser = (User) request.getAttribute("currentUser");

        Map<String, Object> data = userService.likeRankUser(currentUser.getId(), targetId, rankType);
        return Result.success(data);
    }
}
