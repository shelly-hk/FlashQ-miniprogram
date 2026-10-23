package com.flashq.service;

import java.util.Map;

/**
 * 每日刷题提醒业务服务
 * --------------------------------------------------
 * 承接前端提醒功能（report 页）的所有后端操作：
 *   - 上报订阅授权（用户点「允许」后调用，累加可下发次数）
 *   - 开关提醒
 *   - 设置/修改提醒时间
 *   - 查询当前提醒状态（用于前端展示）
 *
 * 真正的下发由 ReminderScheduler 定时任务触发，不在本接口暴露。
 */
public interface ReminderService {

    /**
     * 上报订阅授权结果。
     * 用户在前端 wx.requestSubscribeMessage 点了「允许」后调用，acceptedCount=本次被允许的模板数。
     * 会顺带开启提醒（enabled=1），并按需创建首次记录。
     */
    Map<String, Object> reportAuth(Integer userId, String openid, Integer acceptedCount);

    /** 开启提醒（不影响 remain_count） */
    Map<String, Object> enable(Integer userId, String openid);

    /** 关闭提醒（不清空 remain_count，重新开启后可继续下发） */
    Map<String, Object> disable(Integer userId);

    /** 修改提醒时间（hour 0-23, minute 0-59） */
    Map<String, Object> setTime(Integer userId, String openid, Integer hour, Integer minute);

    /** 查询当前用户的提醒状态（前端展示用） */
    Map<String, Object> getState(Integer userId);
}
