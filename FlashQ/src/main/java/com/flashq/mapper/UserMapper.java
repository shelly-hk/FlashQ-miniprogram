package com.flashq.mapper;

import com.flashq.entity.User;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.time.LocalDate;
import java.util.List;

@Mapper
public interface UserMapper {

    // 根据 openid 查询用户（登录接口用）
    User findByOpenid(String openid);

    // 根据 token 查询用户（接口鉴权用）
    User findByToken(String token);

    // 插入新用户（登录时若不存在创建）
    void insert(User user);

    // 更新用户（累计、今日计数、排行等）
    void update(User user);

    // 更新自定义刷题计数
    void updateCustomStats(@Param("userId") Integer userId,
                           @Param("totalCount") Integer totalCount,
                           @Param("todayCount") Integer todayCount,
                           @Param("lastStudyDate") LocalDate lastStudyDate);

    // 原子自增官方题库刷题计数（自动处理跨天清零，避免并发丢失计数）
    void incrementStats(@Param("userId") Integer userId, @Param("today") LocalDate today);

    // 原子自增自定义题库刷题计数（自动处理跨天清零，避免并发丢失计数）
    void incrementCustomStats(@Param("userId") Integer userId, @Param("today") LocalDate today);

    // 按累计刷题数倒序取 Top 100（排行榜用）
    List<User> findTopRank();

    // 今日刷题数倒序取 Top 100（今日排行榜用）
    List<User> findTopTodayRank();

    // 统计某用户的总排名
    int countRankByUser(Integer userId);

    // 统计某用户的今日排名
    int countTodayRankByUser(Integer userId);

    User findById(Integer userId);

    // 更新昵称
    void updateNickName(@Param("userId") Integer userId, @Param("nickName") String nickName);

    // 更新头像
    void updateAvatar(@Param("userId") Integer userId, @Param("avatar") String avatar);

    // 刷新用户活跃时间（登录续期用，避免长期未活跃用户被 token 过期拦截）
    void updateLoginTime(@Param("userId") Integer userId);

    // 标记客户端 LocalStorage 学习报告数据已完成迁移（报告迁移幂等用）
    void updateReportMigratedAt(@Param("userId") Integer userId);

}