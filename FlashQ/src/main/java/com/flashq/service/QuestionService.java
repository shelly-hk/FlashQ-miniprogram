package com.flashq.service;

import com.flashq.entity.Question;
import com.flashq.entity.User;

import java.util.Map;

public interface QuestionService {

    /**
     * 随机取一题（接口文档 4.3）
     * @param subjectId 科目ID，0或null表示全科目
     * @param difficulty 难度，0或null表示全部难度
     * @param quizType 题目类型：it/code/interview；null 时默认 it（向后兼容）
     * @param style 题目风格：quick/quality；null 表示不限
     * @return 题目对象（不含正确答案）
     */
    Question getRandomQuestion(Integer subjectId, Integer difficulty, String quizType, String style);

    /**
     * 判题（接口文档 4.4）
     * @param questionId 题目ID
     * @param userAnswer 用户答案（字母）
     * @return 判题结果 data
     */
    Map<String, Object> judgeQuestion(Integer questionId, String userAnswer, User currentUser);
}