package com.flashq.service;

/**
 * Agent 解析服务
 * 负责异步解析上传的文件内容并生成题目
 */
public interface AgentService {

    /**
     * 异步处理上传文件：解析内容 → 生成题目 → 写入自主题库
     * @param uploadRecordId 上传记录ID
     */
    void processUploadAsync(Integer uploadRecordId);

    /**
     * 异步处理上传文件：解析内容 → 生成题目 → 写入自主题库（带分类）
     * @param uploadRecordId 上传记录ID
     * @param categoryId 自定义分类ID，null 则不指定
     */
    void processUploadAsync(Integer uploadRecordId, Integer categoryId);
}
