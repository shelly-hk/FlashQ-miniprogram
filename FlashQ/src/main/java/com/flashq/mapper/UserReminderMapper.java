package com.flashq.mapper;

import com.flashq.entity.UserReminder;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;

@Mapper
public interface UserReminderMapper {

    // 根据用户ID查询提醒记录（不存在则返回 null，业务层据此决定 insert）
    UserReminder findByUserId(@Param("userId") Integer userId);

    // 插入新记录（首次开启提醒时）
    void insert(UserReminder reminder);

    // 开启/关闭提醒（仅切换 enabled，不清空 remain_count，方便用户重新开启后继续下发）
    void updateEnabled(@Param("userId") Integer userId, @Param("enabled") Integer enabled);

    // 用户授权上报：remain_count 累加 +N，total_auth_count 累加 +N
    void addRemainCount(@Param("userId") Integer userId, @Param("count") Integer count);

    // 修改提醒时间
    void updateRemindTime(@Param("userId") Integer userId,
                          @Param("hour") Integer hour,
                          @Param("minute") Integer minute);

    // 下发成功后扣减：remain_count -1，total_sent_count +1，last_remind_date = today
    void markSent(@Param("userId") Integer userId, @Param("today") LocalDate today);

    /**
     * 定时任务扫描：返回所有需要现在下发提醒的用户。
     * 条件：enabled=1 AND remain_count>0 AND last_remind_date != today
     *       AND 提醒时间落在 [fromMinuteOfDay, toMinuteOfDay) 分钟窗口内。
     * 「分钟数」= hour*60+minute（一天内的绝对分钟），调度器按调用频率控制窗口大小：
     *   每分钟跑一次 → fromMinute=当前分钟，toMinute=当前分钟+1。
     */
    List<UserReminder> findUsersToRemind(@Param("today") LocalDate today,
                                         @Param("fromMinute") int fromMinute,
                                         @Param("toMinute") int toMinute);

    // 每天凌晨批量重置 last_remind_date 为 NULL（让次日可重新下发）
    int resetLastRemindDate();
}
