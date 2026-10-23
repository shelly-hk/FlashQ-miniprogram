package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.User;
import com.flashq.service.ReportService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.Map;

/**
 * 学习报告接口（《学习报告后端新增功能开发规范》v1.0.0 第三章）
 * <p>
 * 路径对齐规范：/api/report/*（规范基线路径 /v1/report/* 的当前版本前缀）。
 * 除 POST /api/report/share/visit 允许匿名调用外，其余接口均由 LoginInterceptor 鉴权。
 */
@RestController
@RequestMapping("/api/report")
@RequiredArgsConstructor
public class ReportController {

    private final ReportService reportService;

    // 规范 3.3：GET /summary?timezone=Asia/Shanghai
    @GetMapping("/summary")
    public Result<Map<String, Object>> summary(
            @RequestParam(value = "timezone", required = false) String timezone,
            HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        return Result.success(reportService.getSummary(user.getId(), timezone));
    }

    // 规范 3.4：GET /heatmap?days=7|30&end_date=YYYY-MM-DD
    @GetMapping("/heatmap")
    public Result<Map<String, Object>> heatmap(
            @RequestParam(value = "days", defaultValue = "7") int days,
            @RequestParam(value = "end_date", required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            HttpServletRequest request) {
        if (days != 7 && days != 30) {
            return Result.error(422, "days 仅支持 7 或 30");
        }
        User user = (User) request.getAttribute("currentUser");
        return Result.success(reportService.getHeatmap(user.getId(), days, endDate));
    }

    // 规范 3.5：GET /subject-accuracy?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    @GetMapping("/subject-accuracy")
    public Result<Map<String, Object>> subjectAccuracy(
            @RequestParam(value = "start_date")
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam(value = "end_date")
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate,
            HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        return Result.success(reportService.getSubjectAccuracy(user.getId(), startDate, endDate));
    }

    // 规范 3.6：GET /time-distribution?days=30&bucket=section|hour
    @GetMapping("/time-distribution")
    public Result<Map<String, Object>> timeDistribution(
            @RequestParam(value = "days", defaultValue = "30") int days,
            @RequestParam(value = "bucket", defaultValue = "section") String bucket,
            HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        return Result.success(reportService.getTimeDistribution(user.getId(), days, bucket));
    }

    // 规范 3.7：GET /snapshot/{date}
    @GetMapping("/snapshot/{date}")
    public Result<Map<String, Object>> snapshot(
            @PathVariable("date")
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        return Result.success(reportService.getSnapshot(user.getId(), date));
    }

    // 规范 3.8：POST /poster/generate
    @PostMapping("/poster/generate")
    public Result<Map<String, Object>> generatePoster(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");

        LocalDate startDate = parseDate(body.get("range") instanceof Map<?, ?> range ? range.get("start_date") : null);
        LocalDate endDate = parseDate(body.get("range") instanceof Map<?, ?> range ? range.get("end_date") : null);
        Map<?, ?> highlight = body.get("highlight") instanceof Map<?, ?> h ? h : Map.of();
        String template = body.get("template") != null ? String.valueOf(body.get("template")) : "default_v1";
        String idempotencyKey = body.get("idempotency_key") != null
                ? String.valueOf(body.get("idempotency_key")) : null;

        return Result.success(reportService.generatePoster(
                user.getId(), template, startDate, endDate,
                Boolean.TRUE.equals(highlight.get("streak")),
                Boolean.TRUE.equals(highlight.get("best_subject")),
                Boolean.TRUE.equals(highlight.get("best_section")),
                idempotencyKey));
    }

    // 规范 3.9：POST /share/visit（匿名接口，已在 WebConfig 放行）
    @PostMapping("/share/visit")
    public Result<Map<String, Object>> shareVisit(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        String shareToken = body.get("share_token") != null ? String.valueOf(body.get("share_token")) : null;
        String scene = body.get("scene") != null ? String.valueOf(body.get("scene")) : null;
        String entryPage = body.get("entry_page") != null ? String.valueOf(body.get("entry_page")) : null;
        String visitorIp = clientIp(request);

        reportService.recordShareVisit(shareToken, scene, entryPage, visitorIp);
        return Result.success(Map.of("recorded", true));
    }

    // 规范 3.10：POST /migrate
    @PostMapping("/migrate")
    public Result<Map<String, Object>> migrate(
            @RequestBody Map<String, Object> body,
            HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        @SuppressWarnings("unchecked")
        Map<String, Object> clientStats = body.get("client_stats") instanceof Map<?, ?> stats
                ? (Map<String, Object>) stats : Map.of();
        String idempotencyKey = body.get("idempotency_key") != null
                ? String.valueOf(body.get("idempotency_key")) : null;

        return Result.success(reportService.migrate(user.getId(), clientStats, idempotencyKey));
    }

    // ---------------------------------------------------------------- 工具

    @SuppressWarnings("unchecked")
    private static LocalDate parseDate(Object value) {
        if (value == null) return null;
        try {
            return LocalDate.parse(String.valueOf(value));
        } catch (RuntimeException e) {
            return null;
        }
    }

    /** 取客户端真实 IP（经过 nginx 时读取 X-Forwarded-For 首个地址） */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            int comma = forwarded.indexOf(',');
            return comma > 0 ? forwarded.substring(0, comma).trim() : forwarded.trim();
        }
        return request.getRemoteAddr();
    }
}
