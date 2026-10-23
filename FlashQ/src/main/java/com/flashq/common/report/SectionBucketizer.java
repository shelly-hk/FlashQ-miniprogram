package com.flashq.common.report;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * 学习报告-时段分桶（规范 5.2.2）
 * <p>
 * 分桶映射：[5,8)→morning、[8,12)→forenoon、[12,18)→afternoon、
 * [18,22)→evening、[22,25)→night（含 0 点）、[1,5)→dawn。
 * <p>
 * 日统计快照的 sections 字段以小时粒度存储：
 * {@code {"hours": {"19": [12, 10]}}}，值为 [答题数, 正确数]，
 * 同时支撑 hour 与 section 两种查询粒度，JSON 只新增 key 保证向前兼容。
 */
public final class SectionBucketizer {

    private SectionBucketizer() {
    }

    /** 六个学习时段 */
    public enum ReportSection {
        MORNING("morning", "清晨 05–08"),
        FORENOON("forenoon", "上午 08–12"),
        AFTERNOON("afternoon", "下午 12–18"),
        EVENING("evening", "晚上 18–22"),
        NIGHT("night", "深夜 22–01"),
        DAWN("dawn", "凌晨 01–05");

        public final String key;
        public final String label;

        ReportSection(String key, String label) {
            this.key = key;
            this.label = label;
        }

        /** 小时 → 时段（0 点归入 night） */
        public static ReportSection ofHour(int hour) {
            if (hour >= 5 && hour < 8) return MORNING;
            if (hour >= 8 && hour < 12) return FORENOON;
            if (hour >= 12 && hour < 18) return AFTERNOON;
            if (hour >= 18 && hour < 22) return EVENING;
            if (hour >= 22 || hour == 0) return NIGHT;
            return DAWN;
        }

        /** 按固定顺序返回全部时段（响应数组顺序） */
        public static ReportSection[] ordered() {
            return new ReportSection[]{MORNING, FORENOON, AFTERNOON, EVENING, NIGHT, DAWN};
        }
    }

    /** 某日的小时级答题统计（[答题数, 正确数]） */
    public static class DaySections {
        private final Map<String, int[]> hours = new TreeMap<>();

        public Map<String, int[]> getHours() {
            return hours;
        }

        public void setHours(Map<String, int[]> hours) {
            this.hours.clear();
            if (hours != null) {
                hours.forEach((k, v) -> this.hours.put(k, new int[]{v[0], v[1]}));
            }
        }

        /** 记录一次答题（事件落库） */
        public void addAnswer(int hour, boolean correct) {
            String key = String.valueOf(hour);
            int[] stat = hours.computeIfAbsent(key, k -> new int[2]);
            stat[0] += 1;
            if (correct) stat[1] += 1;
        }

        /** 迁移合并：每小时取并集较大值（规范 5.2.3 sections 合并取并集） */
        public void mergeMax(DaySections other) {
            if (other == null) return;
            other.hours.forEach((hour, v) -> {
                int[] mine = hours.computeIfAbsent(hour, k -> new int[2]);
                mine[0] = Math.max(mine[0], v[0]);
                mine[1] = Math.max(mine[1], v[1]);
            });
        }

        public int total() {
            return hours.values().stream().mapToInt(v -> v[0]).sum();
        }

        public int correct() {
            return hours.values().stream().mapToInt(v -> v[1]).sum();
        }

        /** 聚合为 6 个时段：key → [答题数, 正确数] */
        public Map<String, int[]> sectionAgg() {
            Map<String, int[]> agg = new LinkedHashMap<>();
            for (ReportSection section : ReportSection.ordered()) {
                agg.put(section.key, new int[]{0, 0});
            }
            hours.forEach((hourStr, stat) -> {
                int hour;
                try {
                    hour = Integer.parseInt(hourStr);
                } catch (NumberFormatException e) {
                    return;
                }
                if (hour < 0 || hour > 23) return;
                int[] target = agg.get(ReportSection.ofHour(hour).key);
                target[0] += stat[0];
                target[1] += stat[1];
            });
            return agg;
        }

        private static final ObjectMapper MAPPER = new ObjectMapper();

        /** 解析数据库 JSON；容错为空结构 */
        public static DaySections fromJson(String json) {
            DaySections result = new DaySections();
            if (json == null || json.isBlank()) return result;
            try {
                Map<String, Object> root = MAPPER.readValue(json, new TypeReference<>() {
                });
                Object hoursNode = root.get("hours");
                if (hoursNode instanceof Map<?, ?> hoursMap) {
                    hoursMap.forEach((hour, stat) -> {
                        int[] pair = parsePair(stat);
                        if (pair != null) result.hours.put(String.valueOf(hour), pair);
                    });
                }
            } catch (Exception ignored) {
                // 历史脏数据按空结构处理，不阻塞查询
            }
            return result;
        }

        private static int[] parsePair(Object stat) {
            if (stat instanceof java.util.List<?> list && !list.isEmpty()) {
                int total = toInt(list.get(0));
                int correct = list.size() > 1 ? toInt(list.get(1)) : 0;
                return new int[]{total, correct};
            }
            if (stat instanceof Map<?, ?> map) {
                return new int[]{toInt(map.get("total")), toInt(map.get("correct"))};
            }
            return null;
        }

        private static int toInt(Object v) {
            return v instanceof Number n ? n.intValue() : 0;
        }

        /** 序列化为数据库 JSON */
        public String toJson() {
            try {
                return MAPPER.writeValueAsString(this);
            } catch (Exception e) {
                return "{\"hours\":{}}";
            }
        }
    }
}
