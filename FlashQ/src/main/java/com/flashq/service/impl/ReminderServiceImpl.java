package com.flashq.service.impl;

import com.flashq.entity.UserReminder;
import com.flashq.mapper.UserReminderMapper;
import com.flashq.service.ReminderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ReminderServiceImpl implements ReminderService {

    private static final Logger log = LoggerFactory.getLogger(ReminderServiceImpl.class);

    // 默认提醒时间，与前端 reminder.js 的 DEFAULT_HOUR/MINUTE 保持一致
    private static final int DEFAULT_HOUR = 20;
    private static final int DEFAULT_MINUTE = 0;

    @Autowired
    private UserReminderMapper reminderMapper;

    // ==================== 业务接口实现 ====================

    @Override
    public Map<String, Object> reportAuth(Integer userId, String openid, Integer acceptedCount) {
        int count = acceptedCount == null ? 0 : Math.max(0, acceptedCount);
        UserReminder r = reminderMapper.findByUserId(userId);
        if (r == null) {
            // 首次授权：创建记录并直接带上本次授权次数与开启状态
            r = new UserReminder();
            r.setUserId(userId);
            r.setOpenid(openid);
            r.setEnabled(1);
            r.setRemainCount(count);
            r.setTotalAuthCount(count);
            r.setTotalSentCount(0);
            r.setRemindHour(DEFAULT_HOUR);
            r.setRemindMinute(DEFAULT_MINUTE);
            reminderMapper.insert(r);
            log.info("用户 {} 首次开启每日提醒，初始额度 {}", userId, count);
        } else {
            // 已有记录：开启提醒 + 累加额度
            if (r.getEnabled() == null || r.getEnabled() != 1) {
                reminderMapper.updateEnabled(userId, 1);
            }
            if (count > 0) {
                reminderMapper.addRemainCount(userId, count);
            }
            log.info("用户 {} 上报订阅授权 +{}，当前额度更新", userId, count);
        }
        return buildStateResponse(reminderMapper.findByUserId(userId));
    }

    @Override
    public Map<String, Object> enable(Integer userId, String openid) {
        UserReminder r = reminderMapper.findByUserId(userId);
        if (r == null) {
            // 没有授权额度时开启：建记录但 remain_count=0，等用户前端补充授权
            r = new UserReminder();
            r.setUserId(userId);
            r.setOpenid(openid);
            r.setEnabled(1);
            r.setRemainCount(0);
            r.setTotalAuthCount(0);
            r.setTotalSentCount(0);
            r.setRemindHour(DEFAULT_HOUR);
            r.setRemindMinute(DEFAULT_MINUTE);
            reminderMapper.insert(r);
        } else {
            reminderMapper.updateEnabled(userId, 1);
        }
        return buildStateResponse(reminderMapper.findByUserId(userId));
    }

    @Override
    public Map<String, Object> disable(Integer userId) {
        reminderMapper.updateEnabled(userId, 0);
        return buildStateResponse(reminderMapper.findByUserId(userId));
    }

    @Override
    public Map<String, Object> setTime(Integer userId, String openid, Integer hour, Integer minute) {
        int h = clampHour(hour);
        int m = clampMinute(minute);
        // 若用户还没建过记录，先建一条（默认关闭，等授权再开启）
        UserReminder r = reminderMapper.findByUserId(userId);
        if (r == null) {
            r = new UserReminder();
            r.setUserId(userId);
            r.setOpenid(openid);
            r.setEnabled(0);
            r.setRemainCount(0);
            r.setTotalAuthCount(0);
            r.setTotalSentCount(0);
            r.setRemindHour(h);
            r.setRemindMinute(m);
            reminderMapper.insert(r);
        } else {
            reminderMapper.updateRemindTime(userId, h, m);
        }
        return buildStateResponse(reminderMapper.findByUserId(userId));
    }

    @Override
    public Map<String, Object> getState(Integer userId) {
        return buildStateResponse(reminderMapper.findByUserId(userId));
    }

    // ==================== 工具方法 ====================

    private int clampHour(Integer hour) {
        if (hour == null) return DEFAULT_HOUR;
        if (hour < 0) return 0;
        if (hour > 23) return 23;
        return hour;
    }

    private int clampMinute(Integer minute) {
        if (minute == null) return DEFAULT_MINUTE;
        if (minute < 0) return 0;
        if (minute > 59) return 59;
        return minute;
    }

    /**
     * 组装前端展示用的状态对象，字段命名与前端 reminder.js 的 getState() 对齐。
     */
    private Map<String, Object> buildStateResponse(UserReminder r) {
        Map<String, Object> data = new LinkedHashMap<>();
        if (r == null) {
            data.put("enabled", false);
            data.put("remainCount", 0);
            data.put("totalAuthCount", 0);
            data.put("totalSentCount", 0);
            data.put("remindHour", DEFAULT_HOUR);
            data.put("remindMinute", DEFAULT_MINUTE);
            data.put("remindTimeValue", pad2(DEFAULT_HOUR) + ":" + pad2(DEFAULT_MINUTE));
            return data;
        }
        int h = r.getRemindHour() == null ? DEFAULT_HOUR : r.getRemindHour();
        int m = r.getRemindMinute() == null ? DEFAULT_MINUTE : r.getRemindMinute();
        data.put("enabled", r.getEnabled() != null && r.getEnabled() == 1);
        data.put("remainCount", r.getRemainCount() == null ? 0 : r.getRemainCount());
        data.put("totalAuthCount", r.getTotalAuthCount() == null ? 0 : r.getTotalAuthCount());
        data.put("totalSentCount", r.getTotalSentCount() == null ? 0 : r.getTotalSentCount());
        data.put("remindHour", h);
        data.put("remindMinute", m);
        data.put("remindTimeValue", pad2(h) + ":" + pad2(m));
        return data;
    }

    private String pad2(int n) {
        return String.format("%02d", n);
    }
}
