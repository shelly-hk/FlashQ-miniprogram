package com.flashq.mapper;

import com.flashq.entity.ReportPoster;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

/**
 * 学习报告-海报生成记录 Mapper
 */
@Mapper
public interface ReportPosterMapper {

    int insert(ReportPoster poster);

    /**
     * 幂等查询：某用户 24 小时内使用相同幂等键生成的海报（规范 3.8）
     */
    ReportPoster findByIdempotencyKey(@Param("userId") Integer userId,
                                      @Param("idempotencyKey") String idempotencyKey,
                                      @Param("since") LocalDateTime since);

    ReportPoster findByPosterId(@Param("posterId") String posterId);

    /**
     * 通过分享 Token 反查海报与归属用户（分享回流用，规范 5.2.5）
     */
    ReportPoster findByShareToken(@Param("shareToken") String shareToken);

    /**
     * 统计用户当日已生成海报数（限流：单用户每日 10 次，规范 6.3）
     */
    int countTodayByUser(@Param("userId") Integer userId, @Param("from") LocalDateTime from);

    int updateStatus(@Param("id") Integer id,
                     @Param("status") Integer status,
                     @Param("generatedAt") LocalDateTime generatedAt);
}
