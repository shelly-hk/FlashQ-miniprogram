package com.flashq.common.report;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 学习报告-热力图强度分级（规范 3.4）
 * <p>
 * level 分级规则（按 count 阈值）：0: 0 / 1: 1–8 / 2: 9–16 / 3: 17–24 / 4: ≥25。
 * 阈值通过 {@code app.report.heatmap.levels} 配置（后台可调），无需接口字段变更。
 */
@Component
public class HeatmapLevelResolver {

    /** 各级上限阈值：[level1 上限, level2 上限, level3 上限] */
    private final int[] thresholds;

    public HeatmapLevelResolver(
            @Value("${app.report.heatmap.levels:8,16,24}") String levelsConfig) {
        int[] parsed = {8, 16, 24};
        try {
            String[] parts = levelsConfig.split(",");
            if (parts.length == 3) {
                parsed = new int[]{
                        Integer.parseInt(parts[0].trim()),
                        Integer.parseInt(parts[1].trim()),
                        Integer.parseInt(parts[2].trim())
                };
            }
        } catch (NumberFormatException ignored) {
            // 配置非法时回落默认阈值
        }
        // 保证阈值单调递增，避免配置错误导致分级错乱
        if (!(parsed[0] < parsed[1] && parsed[1] < parsed[2])) {
            parsed = new int[]{8, 16, 24};
        }
        this.thresholds = parsed;
    }

    /** count → level(0-4) */
    public int levelOf(int count) {
        if (count <= 0) return 0;
        if (count <= thresholds[0]) return 1;
        if (count <= thresholds[1]) return 2;
        if (count <= thresholds[2]) return 3;
        return 4;
    }

    /**
     * 图例（规范 3.4 响应 legend 字段）：
     * {"0":0, "1":8, "2":16, "3":24, "4":maxCount}
     */
    public Map<String, Integer> legend(int maxCount) {
        Map<String, Integer> legend = new LinkedHashMap<>();
        legend.put("0", 0);
        legend.put("1", thresholds[0]);
        legend.put("2", thresholds[1]);
        legend.put("3", thresholds[2]);
        legend.put("4", maxCount);
        return legend;
    }
}
