package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.User;
import com.flashq.service.ReminderService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 每日刷题提醒接口
 * --------------------------------------------------
 * 与前端 reminder.js / report 页对接。
 * 所有接口都需要登录（由 LoginInterceptor 拦截）。
 *
 * 对应前端约定（字段名与 reminder.js 对齐）：
 *   POST /api/reminder/auth    上报订阅授权结果 { acceptedCount }
 *   POST /api/reminder/enable  开启提醒
 *   POST /api/reminder/disable 关闭提醒
 *   POST /api/reminder/time    设置提醒时间 { hour, minute }
 *   GET  /api/reminder/state   查询当前提醒状态
 */
@RestController
@RequestMapping("/api/reminder")
@RequiredArgsConstructor
public class ReminderController {

    private final ReminderService reminderService;

    /** 上报订阅授权（用户在前端点「允许」后调用） */
    @PostMapping("/auth")
    public Result<Map<String, Object>> reportAuth(@RequestBody Map<String, Object> body,
                                                  HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer acceptedCount = toInt(body.get("acceptedCount"));
        Map<String, Object> data = reminderService.reportAuth(user.getId(), user.getOpenid(), acceptedCount);
        return Result.success(data);
    }

    /** 开启提醒 */
    @PostMapping("/enable")
    public Result<Map<String, Object>> enable(HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = reminderService.enable(user.getId(), user.getOpenid());
        return Result.success(data);
    }

    /** 关闭提醒 */
    @PostMapping("/disable")
    public Result<Map<String, Object>> disable(HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = reminderService.disable(user.getId());
        return Result.success(data);
    }

    /** 设置提醒时间 { hour: 0-23, minute: 0-59 } */
    @PostMapping("/time")
    public Result<Map<String, Object>> setTime(@RequestBody Map<String, Object> body,
                                                HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Integer hour = toInt(body.get("hour"));
        Integer minute = toInt(body.get("minute"));
        if (hour == null || minute == null) {
            return Result.error(400, "缺少 hour 或 minute 参数");
        }
        Map<String, Object> data = reminderService.setTime(user.getId(), user.getOpenid(), hour, minute);
        return Result.success(data);
    }

    /** 查询当前提醒状态（前端展示用） */
    @GetMapping("/state")
    public Result<Map<String, Object>> getState(HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = reminderService.getState(user.getId());
        return Result.success(data);
    }

    // ==================== 工具 ====================

    private Integer toInt(Object o) {
        if (o == null) return null;
        if (o instanceof Number) return ((Number) o).intValue();
        try {
            return Integer.parseInt(String.valueOf(o));
        } catch (NumberFormatException e) {
            return null;
        }
    }
}
