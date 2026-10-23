package com.flashq.report;

import com.flashq.common.report.StreakCalculator;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;

/**
 * StreakCalculator 单元测试（规范 7.2）
 * 覆盖：首次答题 / 同日重答 / 连续 +1 / 断签 / 跨时区切换（日期推进）
 */
class StreakCalculatorTest {

    @Test
    void 首次答题streak为1() {
        StreakCalculator.State state = StreakCalculator.update(null, LocalDate.of(2026, 10, 18));
        assertEquals(1, state.streakCurrent);
        assertEquals(1, state.streakLongest);
        assertEquals(1, state.totalDays);
        assertEquals(LocalDate.of(2026, 10, 18), state.lastActiveDate);
    }

    @Test
    void 连续答题次日streak加1() {
        StreakCalculator.State current =
                new StreakCalculator.State(LocalDate.of(2026, 10, 17), 5, 7, 20);
        StreakCalculator.State next = StreakCalculator.update(current, LocalDate.of(2026, 10, 18));
        assertEquals(6, next.streakCurrent);
        assertEquals(7, next.streakLongest);
        assertEquals(21, next.totalDays);
    }

    @Test
    void 连续答题超过历史最长时更新longest() {
        StreakCalculator.State current =
                new StreakCalculator.State(LocalDate.of(2026, 10, 17), 7, 7, 30);
        StreakCalculator.State next = StreakCalculator.update(current, LocalDate.of(2026, 10, 18));
        assertEquals(8, next.streakCurrent);
        assertEquals(8, next.streakLongest);
    }

    @Test
    void 断签后重置为1() {
        StreakCalculator.State current =
                new StreakCalculator.State(LocalDate.of(2026, 10, 15), 10, 12, 40);
        StreakCalculator.State next = StreakCalculator.update(current, LocalDate.of(2026, 10, 18));
        assertEquals(1, next.streakCurrent);
        assertEquals(12, next.streakLongest);
        assertEquals(41, next.totalDays);
    }

    @Test
    void 同日重复答题不更新连续数() {
        StreakCalculator.State current =
                new StreakCalculator.State(LocalDate.of(2026, 10, 18), 5, 8, 25);
        StreakCalculator.State next = StreakCalculator.update(current, LocalDate.of(2026, 10, 18));
        assertEquals(5, next.streakCurrent);
        assertEquals(8, next.streakLongest);
        assertEquals(25, next.totalDays);
        assertEquals(LocalDate.of(2026, 10, 18), next.lastActiveDate);
    }

    @Test
    void 迟到事件不改变已有状态() {
        StreakCalculator.State current =
                new StreakCalculator.State(LocalDate.of(2026, 10, 18), 5, 8, 25);
        StreakCalculator.State next = StreakCalculator.update(current, LocalDate.of(2026, 10, 16));
        assertEquals(5, next.streakCurrent);
        assertEquals(LocalDate.of(2026, 10, 18), next.lastActiveDate);
        assertEquals(25, next.totalDays);
    }

    @Test
    void 跨月连续打卡() {
        // 9 月 30 日 → 10 月 1 日仍算连续（日期推进而非数字 +1）
        StreakCalculator.State current =
                new StreakCalculator.State(LocalDate.of(2026, 9, 30), 3, 3, 10);
        StreakCalculator.State next = StreakCalculator.update(current, LocalDate.of(2026, 10, 1));
        assertEquals(4, next.streakCurrent);
        assertEquals(4, next.streakLongest);
    }
}
