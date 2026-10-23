package com.flashq.mapper;

import com.flashq.entity.RankLike;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDate;
import java.util.List;

/**
 * 排行榜点赞 Mapper
 */
@Mapper
public interface RankLikeMapper {

    // 插入点赞记录
    void insert(RankLike rankLike);

    // 查询今日是否已对该用户点赞（某榜单）
    RankLike findTodayLike(@Param("likerId") Integer likerId,
                           @Param("targetId") Integer targetId,
                           @Param("rankType") String rankType,
                           @Param("likeDate") LocalDate likeDate);

    // 统计今日已使用的点赞次数（某榜单）
    int countTodayLikes(@Param("likerId") Integer likerId,
                        @Param("rankType") String rankType,
                        @Param("likeDate") LocalDate likeDate);

    // 统计某用户的获赞数（今日榜：仅当天；总榜：全部）
    int countLikesByTarget(@Param("targetId") Integer targetId,
                           @Param("rankType") String rankType,
                           @Param("likeDate") LocalDate likeDate,
                           @Param("todayOnly") boolean todayOnly);

    // 批量查询某榜单下多个用户的获赞数
    List<Integer> findLikedTargetIds(@Param("likerId") Integer likerId,
                                     @Param("rankType") String rankType,
                                     @Param("likeDate") LocalDate likeDate,
                                     @Param("targetIds") List<Integer> targetIds);
}
