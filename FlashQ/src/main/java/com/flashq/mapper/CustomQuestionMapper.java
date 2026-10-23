package com.flashq.mapper;

import com.flashq.entity.CustomQuestion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface CustomQuestionMapper {

    // 按用户ID随机取一道题（刷题用），可排除指定ID避免连续重复，可按分类筛选
    CustomQuestion selectRandomByUserId(@Param("userId") Integer userId,
                                        @Param("difficulty") Integer difficulty,
                                        @Param("categoryId") Integer categoryId,
                                        @Param("excludeId") Integer excludeId);

    // 按ID查询（判题用，需校验 userId 归属）
    CustomQuestion findByIdAndUserId(@Param("id") Integer id,
                                     @Param("userId") Integer userId);

    // 按用户ID分页查询（列表用），可按分类筛选
    List<CustomQuestion> findByUserId(@Param("userId") Integer userId,
                                      @Param("sourceFileName") String sourceFileName,
                                      @Param("categoryId") Integer categoryId,
                                      @Param("offset") int offset,
                                      @Param("size") int size);

    // 统计用户自主题目总数
    int countByUserId(@Param("userId") Integer userId,
                      @Param("sourceFileName") String sourceFileName,
                      @Param("categoryId") Integer categoryId);

    // 批量更新分类（删除分类时迁移题目用）
    int updateCategoryId(@Param("userId") Integer userId,
                         @Param("oldCategoryId") Integer oldCategoryId,
                         @Param("newCategoryId") Integer newCategoryId);

    // 修改单题分类
    int updateQuestionCategory(@Param("questionId") Integer questionId,
                               @Param("userId") Integer userId,
                               @Param("categoryId") Integer categoryId);

    // 批量插入题目（Agent生成后写入）
    void insert(CustomQuestion customQuestion);

    // 逻辑删除（按用户+题目ID）
    int softDelete(@Param("userId") Integer userId,
                   @Param("id") Integer id);

    // 批量逻辑删除（按用户ID，可选按分类筛选）
    int softDeleteAllByUserId(@Param("userId") Integer userId,
                              @Param("categoryId") Integer categoryId);
}
