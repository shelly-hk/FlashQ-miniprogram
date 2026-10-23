package com.flashq;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@MapperScan("com.flashq.mapper")
@EnableAsync
@EnableScheduling
public class FlashQApplication {

    public static void main(String[] args) {
        SpringApplication.run(FlashQApplication.class, args);
    }

}
