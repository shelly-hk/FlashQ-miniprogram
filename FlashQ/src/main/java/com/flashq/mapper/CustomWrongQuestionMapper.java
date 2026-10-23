package com.flashq.mapper;

import com.flashq.entity.CustomWrongQuestion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface CustomWrongQuestionMapper {

    // 查询用户错题列表
    List<CustomWrongQuestion> findByUserId(Integer userId);

    // 查询用户错题列表（分页 + 可选按分类筛选）
    List<CustomWrongQuestion> findByUserIdPaged(@Param("userId") Integer userId,
                                                 @Param("categoryId") Integer categoryId,
                                                 @Param("offset") int offset,
                                                 @Param("size") int size);

    // 统计用户错题总数（可选按分类筛选）
    int countByUserId(@Param("userId") Integer userId,
                      @Param("categoryId") Integer categoryId);

    // 按用户+题目查询单条（判断是否已存在）
    CustomWrongQuestion findByUserIdAndQuestionId(@Param("userId") Integer userId,
                                                   @Param("questionId") Integer questionId);

    // 新增错题记录
    void insert(CustomWrongQuestion customWrongQuestion);

    // 更新错题次数
    void updateWrongTimes(CustomWrongQuestion customWrongQuestion);

    // 删除错题（按用户+题目）
    int deleteByUserIdAndQuestionId(@Param("userId") Integer userId,
                                    @Param("questionId") Integer questionId);

    // 按题目ID删除（级联删除，题目被删除时调用）
    void deleteByQuestionId(@Param("questionId") Integer questionId);
}
