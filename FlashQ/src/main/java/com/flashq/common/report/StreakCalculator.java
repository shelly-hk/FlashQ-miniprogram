package com.flashq.common.report;

import java.time.LocalDate;

/**
 * 学习报告-连续打卡计算（规范 5.2.1）
 * <p>
 * 纯函数实现，便于单元测试（规范 7.2 StreakCalculator 覆盖用例）：
 * 首次答题 / 同日重答 / 连续 +1 / 断签 / 迟到事件。
 */
public final class StreakCalculator {

    private StreakCalculator() {
    }

    /** 连续打卡状态 */
    public static class State {
        public LocalDate lastActiveDate;
        public int streakCurrent;
        public int streakLongest;
        public int totalDays;

        public State(LocalDate lastActiveDate, int streakCurrent, int streakLongest, int totalDays) {
            this.lastActiveDate = lastActiveDate;
            this.streakCurrent = streakCurrent;
            this.streakLongest = streakLongest;
            this.totalDays = totalDays;
        }

        public State copy() {
            return new State(lastActiveDate, streakCurrent, streakLongest, totalDays);
        }
    }

    /**
     * 按答题日期推进连续打卡状态（规范 5.2.1）：
     * <ul>
     *   <li>首次答题：streak_current = 1，streak_longest = max(原值, 1)，total_days = 1；</li>
     *   <li>answer_date == last_active_date：同日重复答题，不更新连续数，累计不变；</li>
     *   <li>answer_date == last_active_date + 1 天：streak_current += 1，并更新 streak_longest；</li>
     *   <li>answer_date &gt; last_active_date + 1 天：断签，streak_current = 1；</li>
     *   <li>answer_date &lt; last_active_date：迟到事件，不改变已有状态。</li>
     * </ul>
     *
     * @param state      当前状态（null 表示首次答题）
     * @param answerDate 本次答题日期（用户本地时区）
     * @return 新状态（入参未被修改）
     */
    public static State update(State state, LocalDate answerDate) {
        // 首次答题
        if (state == null || state.lastActiveDate == null) {
            return new State(answerDate, 1, Math.max(1, state != null ? state.streakLongest : 0), 1);
        }
        // 同日重复答题：仅保持现状
        if (answerDate.equals(state.lastActiveDate)) {
            return state.copy();
        }
        // 迟到事件（乱序到达）：不改变连续状态
        if (answerDate.isBefore(state.lastActiveDate)) {
            return state.copy();
        }
        State next = state.copy();
        next.lastActiveDate = answerDate;
        next.totalDays = state.totalDays + 1;
        if (answerDate.equals(state.lastActiveDate.plusDays(1))) {
            // 连续 +1
            next.streakCurrent = state.streakCurrent + 1;
        } else {
            // 断签后重新开始
            next.streakCurrent = 1;
        }
        next.streakLongest = Math.max(state.streakLongest, next.streakCurrent);
        return next;
    }
}
