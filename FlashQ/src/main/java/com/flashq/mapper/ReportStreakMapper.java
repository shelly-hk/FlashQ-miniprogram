package com.flashq.mapper;

import com.flashq.entity.ReportStreak;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 学习报告-连续打卡聚合 Mapper
 */
@Mapper
public interface ReportStreakMapper {

    /**
     * 按用户加行锁查询（连续打卡更新在事务内完成，规范 5.2.1）
     */
    ReportStreak selectForUpdate(@Param("userId") Integer userId);

    /**
     * 写入连续打卡状态（幂等 UPSERT，Java 侧已完成 streak 计算）
     */
    int upsert(ReportStreak streak);

    /**
     * 重新计算前的清理（迁移后全量重算使用）
     */
    int deleteByUserId(@Param("userId") Integer userId);
}
