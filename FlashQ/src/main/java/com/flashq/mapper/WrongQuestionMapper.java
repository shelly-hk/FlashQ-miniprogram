package com.flashq.mapper;

import com.flashq.entity.WrongQuestion;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.util.List;

@Mapper
public interface WrongQuestionMapper {

    // 查询用户的错题列表
    List<WrongQuestion> findByUserId(Integer userId);

    // 查询用户的错题列表（分页 + 可选按科目/题目类型筛选）
    List<WrongQuestion> findByUserIdPaged(@Param("userId") Integer userId,
                                           @Param("subjectId") Integer subjectId,
                                           @Param("quizType") String quizType,
                                           @Param("offset") int offset,
                                           @Param("size") int size);

    // 统计用户错题总数（可选按科目/题目类型筛选）
    int countByUserId(@Param("userId") Integer userId,
                      @Param("subjectId") Integer subjectId,
                      @Param("quizType") String quizType);

    // 按用户+题目查（判断是否已在错题本）
    WrongQuestion findByUserIdAndQuestionId(@Param("userId") Integer userId,
                                            @Param("questionId") Integer questionId);
    // 新增错题记录
    void insert(WrongQuestion wrongQuestion);

    // 更新错题次数（答错累加）
    void updateWrongTimes(WrongQuestion wrongQuestion);

    // 删除错题（按用户+题目）
    int deleteByUserIdAndQuestionId(Integer userId, Integer questionId);
}
