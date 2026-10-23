package com.flashq.mapper;

import com.flashq.entity.CustomFavorite;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CustomFavoriteMapper {

    // 查询用户自主题库收藏列表（分页，关联题目信息，可选按分类筛选）
    List<CustomFavorite> findByUserId(@Param("userId") Integer userId,
                                       @Param("categoryId") Integer categoryId,
                                       @Param("offset") int offset,
                                       @Param("size") int size);

    // 统计用户自主题库收藏总数（可选按分类筛选）
    int countByUserId(@Param("userId") Integer userId,
                      @Param("categoryId") Integer categoryId);

    // 判断是否已收藏
    int countByUserAndQuestion(@Param("userId") Integer userId,
                               @Param("questionId") Integer questionId);

    // 新增收藏
    void insert(CustomFavorite favorite);

    // 删除收藏（按用户+题目）
    int deleteByUserIdAndQuestionId(@Param("userId") Integer userId,
                                    @Param("questionId") Integer questionId);

    // 按题目ID删除（级联删除，删除题目时调用）
    int deleteByQuestionId(@Param("questionId") Integer questionId);
}
