package com.flashq.mapper;

import com.flashq.entity.Question;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import java.util.List;

@Mapper
public interface QuestionMapper {

    // 随机取一题，可按科目、难度、题目类型(it/code/interview)和风格(quick/quality)筛选
    Question selectRandom(@Param("subjectId") Integer subjectId,
                          @Param("difficulty") Integer difficulty,
                          @Param("quizType") String quizType,
                          @Param("style") String style);

    // 按ID查（判题用）
    Question findById(Integer id);
}