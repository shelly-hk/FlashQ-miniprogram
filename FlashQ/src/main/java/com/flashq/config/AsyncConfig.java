package com.flashq.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.aop.interceptor.AsyncUncaughtExceptionHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.AsyncConfigurer;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.Arrays;
import java.util.concurrent.Executor;
import java.util.concurrent.ThreadPoolExecutor;

/**
 * 异步任务线程池配置
 * --------------------------------------------------
 * 背景：仅声明 @EnableAsync 而不配置 ThreadPool 时，
 *      Spring 会回退到 SimpleAsyncTaskExecutor——每次新建线程、
 *      无上限、无队列，突发并发会瞬间创建大量线程造成内存压力。
 *
 * 本配置为 @Async 提供一个有界线程池，覆盖上传出题等异步流程
 * （OCR + AI 生成），核心参数：
 *   - corePoolSize=5   日常并发足够（OCR 本身也被串行锁卡住，多开线程意义不大）
 *   - maxPoolSize=20   突发并发上限（保护内存）
 *   - queueCapacity=50 队列缓冲，避免短时间风暴直接拒绝
 *   - CallerRunsPolicy 队列+线程都满时，让提交任务的线程自己执行，
 *                      天然限流且不丢任务（最坏退化成同步处理）
 */
@Configuration
public class AsyncConfig implements AsyncConfigurer {

    private static final Logger log = LoggerFactory.getLogger(AsyncConfig.class);

    @Override
    public Executor getAsyncExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(5);
        executor.setMaxPoolSize(20);
        executor.setQueueCapacity(50);
        executor.setKeepAliveSeconds(60);
        executor.setThreadNamePrefix("flashq-async-");
        // 队列和线程都满 → 由提交线程自行执行（天然背压，不丢任务）
        executor.setRejectedExecutionHandler(new ThreadPoolExecutor.CallerRunsPolicy());
        // 优雅停机：等待正在跑的任务完成
        executor.setWaitForTasksToCompleteOnShutdown(true);
        executor.setAwaitTerminationSeconds(30);
        executor.initialize();

        log.info("异步任务线程池已初始化：core=5 max=20 queue=50 policy=CallerRuns");
        return executor;
    }

    @Override
    public AsyncUncaughtExceptionHandler getAsyncUncaughtExceptionHandler() {
        // @Async 方法抛出的异常不会被调用方捕获，这里统一打日志，避免静默吞掉
        return (ex, method, params) -> {
            log.error("异步任务未捕获异常：method={}, params={}, error={}",
                    method.getName(), Arrays.toString(params), ex.getMessage(), ex);
        };
    }
}
