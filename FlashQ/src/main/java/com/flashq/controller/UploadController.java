package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.common.ContentRiskException;
import com.flashq.entity.User;
import com.flashq.service.UploadService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;

@RestController
@RequestMapping("/api/upload")
@RequiredArgsConstructor
public class UploadController {

    private final UploadService uploadService;

    // 接口文档 4.1：GET /api/upload/quota
    @GetMapping("/quota")
    public Result<Map<String, Object>> getQuota(HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = uploadService.getUploadQuota(user.getId());
        return Result.success(data);
    }

    // 接口文档 4.2：POST /api/upload/file
    @PostMapping("/file")
    public Result<Map<String, Object>> uploadFile(@RequestParam("file") MultipartFile file,
                                                   @RequestParam(value = "categoryId", required = false) Integer categoryId,
                                                   HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        try {
            Map<String, Object> data = uploadService.uploadFile(file, user.getId(), categoryId);
            return Result.success(data);
        } catch (ContentRiskException e) {
            return Result.error(403, e.getMessage());
        } catch (RuntimeException e) {
            if ("QUOTA_EXCEEDED".equals(e.getMessage())) {
                return Result.error(429, "今日上传次数已用完");
            }
            return Result.error(400, e.getMessage());
        }
    }

    // 接口文档：POST /api/upload/text
    @PostMapping("/text")
    public Result<Map<String, Object>> uploadText(@RequestBody Map<String, Object> body,
                                                   HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        String text = (String) body.get("text");
        try {
            Map<String, Object> data = uploadService.uploadText(text, user.getId());
            return Result.success(data);
        } catch (RuntimeException e) {
            if ("QUOTA_EXCEEDED".equals(e.getMessage())) {
                return Result.error(429, "今日上传次数已用完");
            }
            return Result.error(400, e.getMessage());
        }
    }

    // 接口文档 4.3：GET /api/upload/task/{taskId}
    @GetMapping("/task/{taskId}")
    public Result<Map<String, Object>> getTaskStatus(@PathVariable Integer taskId,
                                                      HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        try {
            Map<String, Object> data = uploadService.getTaskStatus(taskId, user.getId());
            return Result.success(data);
        } catch (IllegalArgumentException e) {
            return Result.error(404, e.getMessage());
        }
    }

    // 接口文档 4.4：GET /api/upload/record/list
    @GetMapping("/record/list")
    public Result<Map<String, Object>> getRecordList(@RequestParam(defaultValue = "1") int page,
                                                      @RequestParam(defaultValue = "10") int size,
                                                      HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        Map<String, Object> data = uploadService.getUploadRecordList(user.getId(), page, size);
        return Result.success(data);
    }

    // 导入题目（按格式规范的文本，不走AI解析）
    @PostMapping("/import/text")
    public Result<Map<String, Object>> importText(@RequestBody Map<String, Object> body,
                                                    HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        String text = (String) body.get("text");
        Integer categoryId = body.get("categoryId") != null ?
                Integer.valueOf(body.get("categoryId").toString()) : null;
        try {
            Map<String, Object> data = uploadService.importQuestionsFromText(text, user.getId(), categoryId);
            return Result.success(data);
        } catch (ContentRiskException e) {
            return Result.error(403, e.getMessage());
        } catch (IllegalArgumentException e) {
            return Result.error(400, e.getMessage());
        }
    }

    // 导入题目（按格式规范的文件，不走AI解析）
    @PostMapping("/import/file")
    public Result<Map<String, Object>> importFile(@RequestParam("file") MultipartFile file,
                                                    @RequestParam(value = "categoryId", required = false) Integer categoryId,
                                                    HttpServletRequest request) {
        User user = (User) request.getAttribute("currentUser");
        try {
            Map<String, Object> data = uploadService.importQuestionsFromFile(file, user.getId(), categoryId);
            return Result.success(data);
        } catch (ContentRiskException e) {
            return Result.error(403, e.getMessage());
        } catch (IllegalArgumentException e) {
            return Result.error(400, e.getMessage());
        } catch (RuntimeException e) {
            return Result.error(400, e.getMessage());
        }
    }
}
