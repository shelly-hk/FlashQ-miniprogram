package com.flashq.mapper;

import com.flashq.entity.ReportDailySnapshot;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 学习报告-用户日统计快照 Mapper
 * 写路径依赖 uk_user_date 唯一键 + SELECT ... FOR UPDATE 行锁保证幂等（规范 5.3）
 */
@Mapper
public interface ReportDailySnapshotMapper {

    /**
     * 按用户+日期加行锁查询（事件落库事务内使用）
     */
    ReportDailySnapshot selectForUpdate(@Param("userId") Integer userId, @Param("date") LocalDate date);

    /**
     * 查询用户某日期范围内的快照（热力图用，按日期升序）
     */
    List<ReportDailySnapshot> selectRange(@Param("userId") Integer userId,
                                          @Param("startDate") LocalDate startDate,
                                          @Param("endDate") LocalDate endDate);

    /**
     * 查询用户服务端已有数据的最大日期（迁移冲突裁决用）
     */
    LocalDate selectMaxDate(@Param("userId") Integer userId);

    /**
     * 查询用户最近一次答题的日期（汇总接口 last_active_date 用）
     */
    LocalDate selectLastActiveDate(@Param("userId") Integer userId);

    /**
     * 累计答题数 / 正确数（汇总接口用）
     */
    Map<String, Object> sumByUser(@Param("userId") Integer userId);

    /**
     * 累计活跃天数（汇总接口 total_days 用）
     */
    int countActiveDays(@Param("userId") Integer userId);

    int insert(ReportDailySnapshot snapshot);

    int updateById(ReportDailySnapshot snapshot);
}
