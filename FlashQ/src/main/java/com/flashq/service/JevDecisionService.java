package com.flashq.service;

import com.flashq.common.JevDecision;

/**
 * Jev 决策模型服务（出题前置决策）
 * 判断内容是否适合出题、内容密度、建议出题量级与难度
 */
public interface JevDecisionService {

    /**
     * 对上传内容做出题前置决策
     *
     * @param textContent 文本内容（已截断至 AI 上下文上限）
     * @param charCount   原始内容总字数（截断前的真实长度，用于量级判断）
     * @param sourceType  来源文件类型，如 pdf/docx/jpg
     * @return 决策结果；Jev 未启用或调用失败时返回降级决策（available=false），
     *         调用方按原逻辑继续，不拦截不出题
     */
    JevDecision decide(String textContent, int charCount, String sourceType);
}
