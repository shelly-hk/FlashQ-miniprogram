package com.flashq.common;

import lombok.Data;

/**
 * Jev 决策模型（腾讯云 EdgeOne Makers · TypeSafe System One）的出题前置决策结果
 */
@Data
public class JevDecision {

    /** Jev 是否成功返回决策（false = 未启用/超时/异常，调用方应降级走原逻辑） */
    private boolean available;

    /** 是否为 shadow 模式（只观测不生效：不拦截、不注入题数和难度） */
    private boolean shadow;

    /** 是否值得出题（false = 内容信息量不足，应拦截） */
    private boolean shouldGenerate;

    /** 建议题目数量区间（min/max；0 = 无建议，调用方用原逻辑） */
    private int questionCountMin;
    private int questionCountMax;

    /** 建议难度：简单/中等/困难（null = 无建议） */
    private String difficulty;

    /** suitable 原始值（noul，yes=适合出题的概率，0~1） */
    private double suitableNoul;

    /** density 原始值（score，0~4 分档） */
    private double densityScore;

    /** count_tier 原始值（少量/适中/大量） */
    private String countTier;

    /** 拦截原因（shouldGenerate=false 时非空） */
    private String reason;

    /**
     * 降级决策：Jev 不可用时返回，不拦截、不影响题数与难度
     */
    public static JevDecision degraded() {
        JevDecision d = new JevDecision();
        d.available = false;
        d.shouldGenerate = true;
        d.questionCountMin = 0;
        d.questionCountMax = 0;
        return d;
    }
}
