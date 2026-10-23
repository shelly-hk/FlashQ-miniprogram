package com.flashq.mapper;

import com.flashq.entity.Subject;
import org.apache.ibatis.annotations.Mapper;
import java.util.List;

@Mapper
public interface SubjectMapper {

    // 查询所有科目列表（接口文档 4.2）
    List<Subject> findAll();

    // 按题目类型查询科目列表（新增：代码题/面试题等）
    List<Subject> findByQuizType(@org.apache.ibatis.annotations.Param("quizType") String quizType);

    // 按ID查科目名称
    Subject findById(Integer id);
}