package com.flashq.schedule;

import com.flashq.entity.UserReminder;
import com.flashq.mapper.UserReminderMapper;
import com.flashq.service.WxSubscribeMessageService;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 每日刷题提醒定时调度
 * --------------------------------------------------
 * 两个任务：
 *   1) 每 1 分钟扫描「当前分钟」需要下发的用户并调用微信订阅消息接口。
 *      —— 每个用户每天最多触发一次（靠 last_remind_date 去重）。
 *   2) 每天 00:01 批量重置 last_remind_date，让次日可重新下发。
 *
 * 注意：@EnableScheduling 已在 FlashQApplication 开启。
 */
@Component
public class ReminderScheduler {

    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    @Autowired
    private UserReminderMapper reminderMapper;

    @Autowired
    private WxSubscribeMessageService subscribeMessageService;

    /** 订阅消息模板 ID（小程序后台配置），从 application.yaml 注入 */
    @Value("${wx.reminder.template-id:}")
    private String templateId;

    /** 点击订阅消息跳转的小程序页面路径 */
    @Value("${wx.reminder.page:pages/home/home}")
    private String jumpPage;

    /** 是否启用定时下发（未配置 templateId 时自动跳过，避免无谓扫描） */
    @Value("${wx.reminder.enabled:false}")
    private boolean enabled;

    @PostConstruct
    public void init() {
        if (enabled) {
            log.info("每日刷题提醒定时任务已启用，templateId={}, page={}", templateId, jumpPage);
        } else {
            log.info("每日刷题提醒定时任务未启用（wx.reminder.enabled=false 或未配置 templateId）");
        }
    }

    /**
     * 每分钟第 0 秒执行一次：扫描「当前这一分钟」需要提醒的用户。
     * cron = 秒 分 时 日 月 周 → "0 * * * * ?" 表示每分钟的第 0 秒。
     */
    @Scheduled(cron = "0 * * * * ?")
    public void sendReminders() {
        if (!enabled || templateId == null || templateId.isEmpty()) {
            return;
        }
        LocalDateTime now = LocalDateTime.now();
        LocalDate today = now.toLocalDate();
        int currentMinute = now.getHour() * 60 + now.getMinute();

        // 窗口 = [currentMinute, currentMinute+1)，确保每个用户每天只在「设置的那个分钟」触发一次
        List<UserReminder> targets;
        try {
            targets = reminderMapper.findUsersToRemind(today, currentMinute, currentMinute + 1);
        } catch (Exception e) {
            log.error("扫描待提醒用户失败: {}", e.getMessage());
            return;
        }
        if (targets == null || targets.isEmpty()) {
            return;
        }

        log.info("扫描到 {} 位用户需要下发每日提醒（时刻 {}:{}）",
                targets.size(), now.getHour(), String.format("%02d", now.getMinute()));
        int success = 0;
        for (UserReminder r : targets) {
            if (r.getOpenid() == null || r.getOpenid().isEmpty()) {
                log.warn("跳过用户 {}：openid 为空", r.getUserId());
                continue;
            }
            try {
                boolean ok = subscribeMessageService.send(
                        r.getOpenid(), templateId, jumpPage, buildTemplateData(r));
                if (ok) {
                    // 下发成功才扣减额度并标记今日已发
                    reminderMapper.markSent(r.getUserId(), today);
                    success++;
                }
            } catch (Exception e) {
                log.error("用户 {} 下发提醒异常: {}", r.getUserId(), e.getMessage());
            }
        }
        log.info("每日提醒下发完成：成功 {} / 共 {}", success, targets.size());
    }

    /**
     * 每天 00:01 重置所有用户的 last_remind_date，让次日可重新触发。
     */
    @Scheduled(cron = "0 1 0 * * ?")
    public void resetDailyFlags() {
        try {
            int rows = reminderMapper.resetLastRemindDate();
            log.info("已重置 {} 条提醒记录的 last_remind_date（新的一天开始）", rows);
        } catch (Exception e) {
            log.error("重置 last_remind_date 失败: {}", e.getMessage());
        }
    }

    // ==================== 模板数据组装 ====================
    // 模板：打卡提醒（模版编号 76018），字段与小程序后台模板一一对应：
    //   time5  提醒时间（time 类型，格式 yyyy年M月d日 HH:mm）→ 用户设置的提醒时刻
    //   thing7 发送人（thing 类型，长度 ≤ 20）→ 一句刷打卡提醒助手
    //   thing3 备注（thing 类型，长度 ≤ 20）→ 成功贵在坚持，快来刷一刷续上打卡吧！
    private Map<String, Object> buildTemplateData(UserReminder r) {
        Map<String, Object> data = new LinkedHashMap<>();
        // 提醒时间：本次下发时刻即用户设置的提醒时刻（定时任务按分钟触发）
        String remindTime = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy年M月d日 HH:mm"));
        data.put("time5", Map.of("value", remindTime));
        // 发送人
        data.put("thing7", Map.of("value", "一句刷打卡提醒助手"));
        // 备注（14 字，≤20 上限）
        data.put("thing3", Map.of("value", "成功贵在坚持，快来刷一刷续上打卡吧！"));
        return data;
    }
}
