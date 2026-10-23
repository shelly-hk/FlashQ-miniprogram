package com.flashq.service.impl;

import com.flashq.entity.Subject;
import com.flashq.mapper.SubjectMapper;
import com.flashq.service.SubjectService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.List;

@Service
@RequiredArgsConstructor
public class SubjectServiceImpl implements SubjectService {

    private final SubjectMapper subjectMapper;

    @Override
    public List<Subject> getSubjectList() {
        // 直接调用 Mapper 的 findAll 方法查询数据库全部科目
        return subjectMapper.findAll();
    }

    @Override
    public List<Subject> getSubjectListByQuizType(String quizType) {
        return subjectMapper.findByQuizType(quizType);
    }
}