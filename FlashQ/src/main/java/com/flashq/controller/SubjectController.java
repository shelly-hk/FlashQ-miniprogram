package com.flashq.controller;

import com.flashq.common.Result;
import com.flashq.entity.Subject;
import com.flashq.service.SubjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import java.util.List;

@RestController
@RequestMapping("/api/subject")
@RequiredArgsConstructor
public class SubjectController {

    private final SubjectService subjectService;

    // 接口文档 4.2：GET /api/subject/list
    // quizType 参数说明：
    //   未传/it  → 随机刷题科目（返回全部科目，排除 code/interview，保持旧版前端行为）
    //   code     → 代码题库独立科目（quiz_type='code'）
    //   interview→ 面试题库独立科目（quiz_type='interview'）
    @GetMapping("/list")
    public Result<List<Subject>> getSubjectList(
            @RequestParam(value = "quizType", required = false) String quizType) {
        List<Subject> list;
        if ("code".equals(quizType) || "interview".equals(quizType)) {
            // 代码/面试题库：只返回对应类型的独立科目
            list = subjectService.getSubjectListByQuizType(quizType);
        } else {
            // 随机刷题（未传/it）：返回全部科目但排除 code/interview，
            // 保证历史自定义科目（quiz_type 为 NULL/'选择题'）不受影响
            list = subjectService.getSubjectListByQuizType(quizType == null || quizType.isEmpty() ? null : quizType);
        }
        return Result.success(list);
    }
}