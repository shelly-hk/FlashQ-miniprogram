package com.flashq.report;

import com.flashq.common.report.HeatmapLevelResolver;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * HeatmapLevelResolver 单元测试（规范 7.2）
 * 覆盖：count = 0 / 边界值 1, 8, 9, 24, 25 / 自定义阈值配置
 */
class HeatmapLevelResolverTest {

    private final HeatmapLevelResolver resolver = new HeatmapLevelResolver("8,16,24");

    @Test
    void 零答题为level0() {
        assertEquals(0, resolver.levelOf(0));
    }

    @Test
    void 默认阈值边界值分级() {
        assertEquals(1, resolver.levelOf(1));
        assertEquals(1, resolver.levelOf(8));   // 1–8 → level 1
        assertEquals(2, resolver.levelOf(9));   // 9–16 → level 2
        assertEquals(2, resolver.levelOf(16));
        assertEquals(3, resolver.levelOf(17));  // 17–24 → level 3
        assertEquals(3, resolver.levelOf(24));
        assertEquals(4, resolver.levelOf(25));  // ≥25 → level 4
        assertEquals(4, resolver.levelOf(1000));
    }

    @Test
    void 自定义阈值配置生效() {
        HeatmapLevelResolver custom = new HeatmapLevelResolver("4,10,20");
        assertEquals(0, custom.levelOf(0));
        assertEquals(1, custom.levelOf(4));
        assertEquals(2, custom.levelOf(5));
        assertEquals(2, custom.levelOf(10));
        assertEquals(3, custom.levelOf(11));
        assertEquals(3, custom.levelOf(20));
        assertEquals(4, custom.levelOf(21));
    }

    @Test
    void 非法配置回落默认阈值() {
        HeatmapLevelResolver fallback = new HeatmapLevelResolver("abc");
        assertEquals(1, fallback.levelOf(8));
        assertEquals(4, fallback.levelOf(25));

        // 非单调递增同样回落默认
        HeatmapLevelResolver nonMonotonic = new HeatmapLevelResolver("20,10,5");
        assertEquals(1, nonMonotonic.levelOf(8));
        assertEquals(4, nonMonotonic.levelOf(25));
    }

    @Test
    void 图例包含各级阈值() {
        Map<String, Integer> legend = resolver.legend(32);
        assertEquals(0, legend.get("0"));
        assertEquals(8, legend.get("1"));
        assertEquals(16, legend.get("2"));
        assertEquals(24, legend.get("3"));
        assertEquals(32, legend.get("4"));
    }
}
