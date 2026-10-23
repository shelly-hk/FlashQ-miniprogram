package com.flashq.report;

import com.flashq.common.report.SectionBucketizer;
import com.flashq.common.report.SectionBucketizer.DaySections;
import com.flashq.common.report.SectionBucketizer.ReportSection;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

/**
 * SectionBucketizer 单元测试（规范 7.2）
 * 覆盖：边界时间（00:00 / 05:00 / 08:00 / 22:00）、跨天事件、sections JSON 存取
 */
class SectionBucketizerTest {

    @Test
    void 边界小时映射到正确时段() {
        assertEquals(ReportSection.MORNING, ReportSection.ofHour(5));
        assertEquals(ReportSection.MORNING, ReportSection.ofHour(7));
        assertEquals(ReportSection.FORENOON, ReportSection.ofHour(8));
        assertEquals(ReportSection.FORENOON, ReportSection.ofHour(11));
        assertEquals(ReportSection.AFTERNOON, ReportSection.ofHour(12));
        assertEquals(ReportSection.AFTERNOON, ReportSection.ofHour(17));
        assertEquals(ReportSection.EVENING, ReportSection.ofHour(18));
        assertEquals(ReportSection.EVENING, ReportSection.ofHour(21));
        assertEquals(ReportSection.NIGHT, ReportSection.ofHour(22));
        assertEquals(ReportSection.NIGHT, ReportSection.ofHour(23));
        // 0 点归入 night（规范 5.2.2）
        assertEquals(ReportSection.NIGHT, ReportSection.ofHour(0));
        assertEquals(ReportSection.DAWN, ReportSection.ofHour(1));
        assertEquals(ReportSection.DAWN, ReportSection.ofHour(4));
    }

    @Test
    void 时段标签与规范一致() {
        assertEquals("清晨 05–08", ReportSection.MORNING.label);
        assertEquals("上午 08–12", ReportSection.FORENOON.label);
        assertEquals("下午 12–18", ReportSection.AFTERNOON.label);
        assertEquals("晚上 18–22", ReportSection.EVENING.label);
        assertEquals("深夜 22–01", ReportSection.NIGHT.label);
        assertEquals("凌晨 01–05", ReportSection.DAWN.label);
    }

    @Test
    void 按小时累计答题与正确数() {
        DaySections sections = new DaySections();
        sections.addAnswer(19, true);
        sections.addAnswer(19, true);
        sections.addAnswer(19, false);
        sections.addAnswer(20, true);

        assertEquals(4, sections.total());
        assertEquals(3, sections.correct());
        assertEquals(3, sections.getHours().get("19")[0]);
        assertEquals(2, sections.getHours().get("19")[1]);
    }

    @Test
    void 聚合成六个时段() {
        DaySections sections = new DaySections();
        sections.addAnswer(6, true);   // morning
        sections.addAnswer(19, true);  // evening
        sections.addAnswer(19, false); // evening
        sections.addAnswer(23, true);  // night
        sections.addAnswer(2, false);  // dawn

        Map<String, int[]> agg = sections.sectionAgg();
        assertEquals(6, agg.size());
        assertEquals(1, agg.get("morning")[0]);
        assertEquals(2, agg.get("evening")[0]);
        assertEquals(1, agg.get("evening")[1]);
        assertEquals(1, agg.get("night")[0]);
        assertEquals(1, agg.get("dawn")[0]);
        assertEquals(0, agg.get("afternoon")[0]);
        assertEquals(0, agg.get("forenoon")[0]);
    }

    @Test
    void JSON序列化与反序列化往返一致() {
        DaySections sections = new DaySections();
        sections.addAnswer(19, true);
        sections.addAnswer(19, false);
        sections.addAnswer(8, true);

        DaySections parsed = DaySections.fromJson(sections.toJson());
        assertEquals(3, parsed.total());
        assertEquals(2, parsed.correct());
        // 8 点属于上午 forenoon（08–12）
        assertEquals(1, parsed.sectionAgg().get("forenoon")[0]);
        assertEquals(2, parsed.sectionAgg().get("evening")[0]);
    }

    @Test
    void 脏JSON按空结构处理不抛异常() {
        DaySections parsed = DaySections.fromJson("not-a-json");
        assertEquals(0, parsed.total());
        DaySections nullParsed = DaySections.fromJson(null);
        assertEquals(0, nullParsed.total());
    }

    @Test
    void 迁移合并每小时取并集较大值() {
        DaySections server = new DaySections();
        server.addAnswer(19, true);
        server.addAnswer(19, true);

        DaySections client = new DaySections();
        client.addAnswer(19, false);
        client.addAnswer(20, true);
        client.addAnswer(20, true);
        client.addAnswer(20, true);

        server.mergeMax(client);
        // 19 点：服务端 2 vs 客户端 1 → 取 2；20 点：服务端 0 vs 客户端 3 → 取 3
        assertEquals(2, server.getHours().get("19")[0]);
        assertEquals(3, server.getHours().get("20")[0]);
        assertEquals(5, server.total());
    }

    @Test
    void 跨天事件按各自小时分别累计() {
        // 深夜 23:50 与次日 00:10 分属两个小时的桶（night 段内）
        DaySections day1 = new DaySections();
        day1.addAnswer(23, true);
        DaySections day2 = new DaySections();
        day2.addAnswer(0, true);
        assertEquals(ReportSection.NIGHT, ReportSection.ofHour(23));
        assertEquals(ReportSection.NIGHT, ReportSection.ofHour(0));
        assertFalse(day1.getHours().containsKey("0"));
        assertFalse(day2.getHours().containsKey("23"));
    }
}
