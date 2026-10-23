package com.flashq.service;

import com.flashq.entity.User;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.util.List;
import java.util.Map;

public interface UserService {

    // 微信登录（换 token）
    Map<String, Object> login(String code);

    // 获取用户统计（接口文档 4.8）
    Map<String, Object> getUserInfo(Integer userId);

    // 排行榜（接口文档 4.9），type = "total" | "today"
    Map<String, Object> getRankList(Integer userId, String type);

    // 排行榜点赞
    Map<String, Object> likeRankUser(Integer userId, Integer targetId, String rankType);

    // 根据 token 取用户
    User getUserByToken(String token);

    // 修改昵称（接口文档 4.1）
    Map<String, Object> updateNickName(Integer userId, String nickName);

    // 上传头像（接口文档 4.2）
    Map<String, Object> uploadAvatar(MultipartFile file, Integer userId) throws IOException;

    // 同时修改头像和昵称（接口文档 4.3）
    Map<String, Object> updateProfile(MultipartFile file, String nickName, Integer userId) throws IOException;
}