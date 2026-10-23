package com.flashq.mapper;

import com.flashq.entity.ReportShareVisit;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

/**
 * 学习报告-分享回流访问记录 Mapper
 */
@Mapper
public interface ReportShareVisitMapper {

    int insert(ReportShareVisit visit);

    /**
     * 某海报的累计回流访问次数（分享效果统计）
     */
    int countByPoster(@Param("posterId") String posterId);
}
