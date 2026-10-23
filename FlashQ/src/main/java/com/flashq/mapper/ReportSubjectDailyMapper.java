package com.flashq.mapper;

import com.flashq.entity.ReportSubjectDaily;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 学习报告-按科目维度日统计 Mapper
 */
@Mapper
public interface ReportSubjectDailyMapper {

    /**
     * 按用户+日期+科目加行锁查询（事件落库事务内使用）
     */
    ReportSubjectDaily selectForUpdate(@Param("userId") Integer userId,
                                       @Param("date") LocalDate date,
                                       @Param("subjectId") String subjectId);

    /**
     * 查询用户某日的全科目明细（快照回溯接口用）
     */
    List<ReportSubjectDaily> selectByUserAndDate(@Param("userId") Integer userId,
                                                 @Param("date") LocalDate date);

    /**
     * 按科目聚合区间统计（科目正确率接口用）
     * 返回 [{subject_id, total, correct}, ...]
     */
    List<Map<String, Object>> aggregateRange(@Param("userId") Integer userId,
                                             @Param("startDate") LocalDate startDate,
                                             @Param("endDate") LocalDate endDate);

    /**
     * 用户某科目是否已有服务端记录（迁移合并裁决用）
     */
    boolean existsByUserAndSubject(@Param("userId") Integer userId, @Param("subjectId") String subjectId);

    int insert(ReportSubjectDaily record);

    int updateById(ReportSubjectDaily record);
}
