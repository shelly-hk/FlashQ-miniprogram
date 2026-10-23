package com.flashq.service;

import com.flashq.entity.UploadRecord;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

public interface UploadService {

    /**
     * 查询今日上传配额
     */
    Map<String, Object> getUploadQuota(Integer userId);

    /**
     * 上传文件
     * @param categoryId 分类ID，不传则归入"其他"
     * @return 包含 taskId、status、message
     */
    Map<String, Object> uploadFile(MultipartFile file, Integer userId, Integer categoryId);

    /**
     * 上传文本
     */
    Map<String, Object> uploadText(String text, Integer userId);

    /**
     * 查询解析任务状态
     */
    Map<String, Object> getTaskStatus(Integer taskId, Integer userId);

    /**
     * 查询用户上传记录列表（分页）
     */
    Map<String, Object> getUploadRecordList(Integer userId, int page, int size);

    /**
     * 导入题目（按格式规范的文本，不走AI解析，直接解析入库）
     * @param text       按格式规范编写的题目文本
     * @param userId     用户ID
     * @param categoryId 目标分类ID（可选，不传归入"其他"）
     * @return 包含 imported（成功导入数）、failed（解析失败数）、total（总题数）
     */
    Map<String, Object> importQuestionsFromText(String text, Integer userId, Integer categoryId);

    /**
     * 导入题目（按格式规范的文件，不走AI解析，直接解析入库）
     * @param file       按格式规范编写的文档（pdf/doc/docx/txt）
     * @param userId     用户ID
     * @param categoryId 目标分类ID（可选，不传归入"其他"）
     */
    Map<String, Object> importQuestionsFromFile(MultipartFile file, Integer userId, Integer categoryId);
}
