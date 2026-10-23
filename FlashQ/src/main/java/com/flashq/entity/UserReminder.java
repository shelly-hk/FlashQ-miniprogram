package com.flashq.entity;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 每日刷题提醒记录（每用户一行）
 * --------------------------------------------------
 * 微信订阅消息是「一次性订阅」：用户每授权一次，后端只能下发一条。
 * 因此本表用 remain_count 记录当前剩余可下发次数：
 *   - 用户在前端点「允许」→ reportAuth 把 remain_count +N（N=本次允许的模板数）
 *   - 定时任务下发成功一条 → remain_count -1（同时更新 last_remind_date）
 *
 * remind_hour / remind_minute：用户自定义提醒时间，默认 20:00。
 * last_remind_date：今日已下发则跳过，避免一次授权被同日多次消耗。
 */
@Data
public class UserReminder {
    private Integer id;
    private Integer userId;
    /** 冗余存 openid，下发订阅消息需要，避免每次 join user 表 */
    private String openid;
    /** 是否开启提醒（0/1）。关闭后即便 remain_count>0 也不会下发 */
    private Integer enabled;
    /** 剩余可下发次数（授权累积，下发消耗） */
    private Integer remainCount;
    /** 累计授权次数（统计用，只增不减） */
    private Integer totalAuthCount;
    /** 累计已下发次数（统计用，只增不减） */
    private Integer totalSentCount;
    /** 提醒小时 0-23 */
    private Integer remindHour;
    /** 提醒分钟 0-59 */
    private Integer remindMinute;
    /** 上次下发日期（同一天不重复下发，凌晨被定时任务重置为 NULL） */
    private LocalDate lastRemindDate;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
