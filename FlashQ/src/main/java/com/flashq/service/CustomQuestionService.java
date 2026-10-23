package com.flashq.service;

import com.flashq.entity.CustomQuestion;
import com.flashq.entity.User;

import java.util.List;
import java.util.Map;

public interface CustomQuestionService {

    /**
     * 自主题库随机取题（不含答案）
     */
    Map<String, Object> getRandomQuestion(Integer userId, Integer difficulty);

    /**
     * 自主题库随机取题（不含答案），可排除指定题目ID避免重复，可按分类筛选
     */
    Map<String, Object> getRandomQuestion(Integer userId, Integer difficulty, Integer categoryId, Integer excludeId);

    /**
     * 自主题库判题
     */
    Map<String, Object> judgeQuestion(Integer questionId, String userAnswer, Integer userId);

    /**
     * 自主题库题目列表（分页，返回含答案），可按分类筛选
     */
    Map<String, Object> getQuestionList(Integer userId, int page, int size, String sourceFileName, Integer categoryId);

    /**
     * 删除自主题库题目（逻辑删除），并级联删除收藏记录
     */
    boolean deleteQuestion(Integer userId, Integer questionId);

    /**
     * 批量删除自主题库全部题目（逻辑删除），可选按分类筛选
     * @return 删除的题目数量
     */
    int deleteAllQuestions(Integer userId, Integer categoryId);

    /**
     * 修改题目所属分类
     */
    Map<String, Object> updateQuestionCategory(Integer userId, Integer questionId, Integer categoryId);
}
