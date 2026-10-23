package com.flashq.config;
import com.flashq.common.LoginInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.File;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    @Autowired
    private LoginInterceptor loginInterceptor;

    @Value("${app.upload.upload-dir:./uploads}")
    private String uploadDir;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(loginInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/wx/login",
                        "/api/subject/list",
                        "/api/question/random",
                        "/api/question/judge",
                        "/api/rank/list",
                        "/api/config/info",
                        // 学习报告-分享回流：允许匿名调用（规范 3.9），仅记录访问事件不返回私有数据
                        "/api/report/share/visit"
                );
    }

    // 允许跨域（仅限小程序和备案域名）
    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOriginPatterns(
                        "https://api.flashq.site",
                        "https://*.flashq.site"
                )
                .allowedMethods("GET", "POST", "PUT", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }

    // 静态资源映射：头像等上传文件可通过 URL 直接访问
    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        registry.addResourceHandler("/uploads/**")
                .addResourceLocations("file:" + new File(uploadDir).getAbsolutePath() + "/");
    }
}