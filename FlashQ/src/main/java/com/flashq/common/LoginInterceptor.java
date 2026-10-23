package com.flashq.common;

import com.flashq.entity.User;
import com.flashq.mapper.UserMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

@Component
@RequiredArgsConstructor
public class LoginInterceptor implements HandlerInterceptor {


    private final UserMapper userMapper;

    // Token 过期天数（基于 update_time，用户活跃会自动续期）
    private static final long TOKEN_EXPIRE_DAYS = 30;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
            throws Exception {
        // 1. 从请求头获取 token
        String token = request.getHeader("Authorization");

        // 2. 没有 token → 未登录，返回 401
        if (token == null || token.isEmpty()) {
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"msg\":\"未登录或登录已失效\",\"data\":null}");
            return false;
        }

        // 3. 根据 token 查用户
        User user = userMapper.findByToken(token);

        // 4. 查不到用户 → token 无效，返回 401
        if (user == null) {
            response.setStatus(401);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"code\":401,\"msg\":\"未登录或登录已失效\",\"data\":null}");
            return false;
        }

        // 5. 检查 Token 是否过期（基于 update_time，30天未活跃则失效）
        if (user.getUpdateTime() != null) {
            long daysSinceUpdate = ChronoUnit.DAYS.between(user.getUpdateTime(), LocalDateTime.now());
            if (daysSinceUpdate > TOKEN_EXPIRE_DAYS) {
                response.setStatus(401);
                response.setContentType("application/json;charset=UTF-8");
                response.getWriter().write("{\"code\":401,\"msg\":\"登录已过期，请重新登录\",\"data\":null}");
                return false;
            }
        }

        // 6. 把当前用户放进 request，供 Controller 使用
        request.setAttribute("currentUser", user);
        return true;
    }
}