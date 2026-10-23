package com.flashq.mapper;

import com.flashq.entity.Favorite;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface FavoriteMapper {

    // 查询某用户的收藏列表
    List<Favorite> findByUserId(Integer userId);

    // 查询某用户的收藏列表（分页 + 可选按科目/题目类型筛选）
    List<Favorite> findByUserIdPaged(@Param("userId") Integer userId,
                                      @Param("subjectId") Integer subjectId,
                                      @Param("quizType") String quizType,
                                      @Param("offset") int offset,
                                      @Param("size") int size);

    // 统计用户收藏总数（可选按科目/题目类型筛选）
    int countByUserId(@Param("userId") Integer userId,
                      @Param("subjectId") Integer subjectId,
                      @Param("quizType") String quizType);

    // 判断某题是否已被某用户收藏
    int countByUserAndQuestion(Integer userId, Integer questionId);

    // 新增收藏
    void insert(Favorite favorite);

    // 删除收藏（按用户+题目）
    int deleteByUserIdAndQuestionId(Integer userId, Integer questionId);

    // 删除某题（用户取消收藏时用）
    int deleteByQuestionId(Integer questionId);
}
