package com.flashq.controller;

import com.flashq.common.Result;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/config")
public class ConfigController {

    // 补充接口文档：GET /api/config/info （含备案信息）
    @GetMapping("/info")
    public Result<Map<String, Object>> getConfigInfo() {
        Map<String, Object> data = new HashMap<>();
        data.put("version", "1.0.0");
        data.put("beianNo", "粤ICP备2026147363号");
        data.put("beianUrl", "https://beian.miit.gov.cn");
        data.put("disclaimer", "题目由AI生成，仅供学习交流");
        data.put("companyName", "一句刷开发团队");
        return Result.success(data);
    }
}