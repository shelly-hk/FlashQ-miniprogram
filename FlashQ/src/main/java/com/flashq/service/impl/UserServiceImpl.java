package com.flashq.service.impl;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.entity.CustomCategory;
import com.flashq.entity.RankLike;
import com.flashq.entity.User;
import com.flashq.mapper.CustomCategoryMapper;
import com.flashq.mapper.FavoriteMapper;
import com.flashq.mapper.RankLikeMapper;
import com.flashq.mapper.UserMapper;
import com.flashq.mapper.WrongQuestionMapper;
import com.flashq.service.UserService;
import com.flashq.service.WxSecurityService;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private static final Logger log = LoggerFactory.getLogger(UserServiceImpl.class);

    private final UserMapper userMapper;

    private final FavoriteMapper favoriteMapper;

    private final WrongQuestionMapper wrongQuestionMapper;

    private final CustomCategoryMapper customCategoryMapper;

    private final RankLikeMapper rankLikeMapper;

    private final WxSecurityService wxSecurityService;

    @Value("${app.upload.upload-dir:./uploads}")
    private String uploadDir;

    @Value("${app.base-url:https://api.flashq.site}")
    private String baseUrl;

    @Value("${wx.app-id:}")
    private String wxAppId;

    @Value("${wx.app-secret:}")
    private String wxAppSecret;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Map<String, Object> login(String code) {
        // 调用微信 jscode2session 接口，用 code 换取真实 openid
        String openid = getOpenidByCode(code);
        User user = userMapper.findByOpenid(openid);
        boolean isNew = false;
        if (user == null) {
            user = new User();
            user.setOpenid(openid);
            user.setToken(UUID.randomUUID().toString().replace("-", ""));
            user.setNickNo("用户" + (10000 + new Random().nextInt(90000)));
            userMapper.insert(user);
            isNew = true;
            // 为新用户自动创建"其他"默认分类
            ensureDefaultCategory(user.getId());
        } else {
            // 老用户重新登录：刷新 update_time，避免因长期未活跃导致 token 被
            // LoginInterceptor 按 30 天过期规则拒绝（修复"登录即登出"死循环）
            userMapper.updateLoginTime(user.getId());
        }
        Map<String, Object> data = new HashMap<>();
        data.put("token", user.getToken());
        data.put("nickNo", user.getNickNo());
        data.put("isNew", isNew);
        return data;
    }

    @Override
    public Map<String, Object> getUserInfo(Integer userId) {
        User user = userMapper.findById(userId);   // 需在 UserMapper 补充此方法
        Map<String, Object> data = new HashMap<>();
        data.put("nickNo", user.getNickNo());
        data.put("avatar", user.getAvatar());
        data.put("totalCount", user.getTotalCount());
        data.put("todayCount", todayCountOf(user));
        data.put("rank", userMapper.countRankByUser(userId));
        data.put("todayRank", userMapper.countTodayRankByUser(userId));
        data.put("wrongTotal", wrongQuestionMapper.findByUserId(userId).size());
        data.put("favoriteTotal", favoriteMapper.findByUserId(userId).size());
        return data;
    }

    @Override
    public Map<String, Object> getRankList(Integer userId, String type) {
        boolean isToday = "today".equals(type);
        List<User> top = isToday ? userMapper.findTopTodayRank() : userMapper.findTopRank();
        LocalDate today = LocalDate.now();

        // 收集所有上榜用户ID
        List<Integer> targetIds = new ArrayList<>();
        for (User u : top) {
            targetIds.add(u.getId());
        }

        // 批量查询当前用户今日已点赞的目标
        Set<Integer> likedIds = new HashSet<>();
        int remainingLikes = 3;
        if (userId != null && !targetIds.isEmpty()) {
            List<Integer> liked = rankLikeMapper.findLikedTargetIds(userId, type, today, targetIds);
            likedIds.addAll(liked);
            int used = rankLikeMapper.countTodayLikes(userId, type, today);
            remainingLikes = Math.max(0, 3 - used);
        }

        List<Map<String, Object>> list = new ArrayList<>();
        int rank = 1;
        for (User u : top) {
            Map<String, Object> item = new HashMap<>();
            item.put("rank", rank++);
            item.put("userId", u.getId());
            item.put("nickNo", u.getNickNo());
            item.put("avatar", u.getAvatar());
            item.put("totalCount", isToday ? u.getTodayCount() : u.getTotalCount());

            // 获赞数：今日榜只统计当天，总榜统计全部
            int likeCount = rankLikeMapper.countLikesByTarget(u.getId(), type, today, isToday);
            item.put("likeCount", likeCount);

            // 当前用户是否已对该用户点赞
            item.put("liked", likedIds.contains(u.getId()));

            list.add(item);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("list", list);
        data.put("type", isToday ? "today" : "total");
        data.put("remainingLikes", remainingLikes);
        if (userId != null) {
            data.put("myRank", isToday ? userMapper.countTodayRankByUser(userId) : userMapper.countRankByUser(userId));
            User me = userMapper.findById(userId);
            if (me != null) {
                data.put("myTotalCount", isToday ? todayCountOf(me) : me.getTotalCount());
            }
        }
        return data;
    }

    /**
     * 今日答题数（跨天安全）。
     * <p>
     * {@code today_count} 只在答题时由 {@code incrementStats} 重置，当天未答题时会残留昨日数值；
     * 若 {@code last_study_date} 不是今天，一律返回 0，避免把昨日计数当作今日数据返回给前端
     * （该泄漏曾导致小程序「我的」/「学习报告」把昨日题量重复记到今日，热力图与连续打卡虚高）。
     */
    private int todayCountOf(User user) {
        if (user == null || user.getTodayCount() == null) {
            return 0;
        }
        LocalDate lastStudyDate = user.getLastStudyDate();
        boolean studiedToday = lastStudyDate != null && lastStudyDate.equals(LocalDate.now());
        return studiedToday ? Math.max(0, user.getTodayCount()) : 0;
    }

    private static final int DAILY_LIKE_LIMIT = 3;

    // 点赞"检查-插入"临界区锁（单实例足够；多实例需数据库唯一约束）
    private final Object likeLock = new Object();

    @Override
    public Map<String, Object> likeRankUser(Integer userId, Integer targetId, String rankType) {
        if (userId == null) {
            throw new IllegalArgumentException("请先登录");
        }
        if (targetId == null) {
            throw new IllegalArgumentException("目标用户不能为空");
        }
        if (!"total".equals(rankType) && !"today".equals(rankType)) {
            rankType = "total";
        }

        final LocalDate today = LocalDate.now();
        int used = 0;

        // 临界区：防止并发请求同时通过校验后重复插入，突破每日 3 次上限或对同一目标重复加分
        synchronized (likeLock) {
            // 锁内重新校验（double-check）
            RankLike existing = rankLikeMapper.findTodayLike(userId, targetId, rankType, today);
            if (existing != null) {
                throw new IllegalArgumentException("今天已经为TA点过赞了");
            }

            used = rankLikeMapper.countTodayLikes(userId, rankType, today);
            if (used >= DAILY_LIKE_LIMIT) {
                throw new IllegalArgumentException("今日点赞次数已用完（最多" + DAILY_LIKE_LIMIT + "次）");
            }

            // 插入点赞记录
            RankLike like = new RankLike();
            like.setLikerId(userId);
            like.setTargetId(targetId);
            like.setRankType(rankType);
            like.setLikeDate(today);
            rankLikeMapper.insert(like);
        }

        boolean isToday = "today".equals(rankType);
        int likeCount = rankLikeMapper.countLikesByTarget(targetId, rankType, today, isToday);
        int remaining = DAILY_LIKE_LIMIT - used - 1;

        log.info("用户{} 为用户{} 点赞（{}榜），剩余{}次", userId, targetId, rankType, remaining);

        Map<String, Object> data = new HashMap<>();
        data.put("likeCount", likeCount);
        data.put("remainingLikes", remaining);
        return data;
    }

    @Override
    public User getUserByToken(String token) {
        return userMapper.findByToken(token);
    }

    @Override
    public Map<String, Object> updateNickName(Integer userId, String nickName) {
        if (nickName == null || nickName.trim().isEmpty()) {
            throw new IllegalArgumentException("昵称不能为空");
        }
        nickName = nickName.trim();
        if (nickName.length() > 8) {
            throw new IllegalArgumentException("昵称不超过8个字符");
        }

        // 微信内容安全检测
        wxSecurityService.checkText(nickName);

        userMapper.updateNickName(userId, nickName);

        Map<String, Object> data = new HashMap<>();
        data.put("nickName", nickName);
        return data;
    }

    @Override
    public Map<String, Object> uploadAvatar(MultipartFile file, Integer userId) throws IOException {
        // 1. 非空校验
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请选择头像图片");
        }

        // 2. 格式校验
        String originalName = file.getOriginalFilename();
        String ext = getExtension(originalName);
        Set<String> allowedExt = new HashSet<>(Arrays.asList("jpg", "jpeg", "png", "webp"));
        if (!allowedExt.contains(ext)) {
            throw new IllegalArgumentException("头像格式不支持，仅支持 jpg/jpeg/png/webp");
        }

        // 3. 大小校验（2MB）
        if (file.getSize() > 2 * 1024 * 1024) {
            throw new IllegalArgumentException("头像大小不能超过2MB");
        }

        // 3.5 微信图片安全检测
        wxSecurityService.checkImage(file.getBytes(), originalName);

        // 4. 保存文件到 ./uploads/avatar/{userId}/
        String fileName = System.currentTimeMillis() + "_avatar." + ext;
        String dirPath = uploadDir + "/avatar/" + userId;
        File dir = new File(dirPath);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        File destFile = new File(dir, fileName).getAbsoluteFile();
        try {
            file.transferTo(destFile);
        } catch (IOException e) {
            log.error("头像保存失败: {}", e.getMessage());
            throw e;
        }

        // 5. 生成可访问 URL 并更新数据库
        String avatarUrl = baseUrl + "/uploads/avatar/" + userId + "/" + fileName;
        userMapper.updateAvatar(userId, avatarUrl);

        // 6. 返回 URL
        Map<String, Object> data = new HashMap<>();
        data.put("avatarUrl", avatarUrl);
        return data;
    }

    @Override
    public Map<String, Object> updateProfile(MultipartFile file, String nickName, Integer userId) throws IOException {
        // 1. 至少传一个
        boolean hasFile = (file != null && !file.isEmpty());
        boolean hasName = (nickName != null && !nickName.trim().isEmpty());
        if (!hasFile && !hasName) {
            throw new IllegalArgumentException("昵称和头像不能同时为空");
        }

        // 2. 更新昵称
        if (hasName) {
            nickName = nickName.trim();
            if (nickName.length() > 8) {
                throw new IllegalArgumentException("昵称不超过8个字符");
            }
            userMapper.updateNickName(userId, nickName);
        }

        // 3. 更新头像（复用 uploadAvatar 的文件保存逻辑）
        if (hasFile) {
            uploadAvatar(file, userId);
        }

        // 4. 返回最新资料
        User user = userMapper.findById(userId);
        Map<String, Object> data = new HashMap<>();
        data.put("nickName", user.getNickNo());
        data.put("avatar", user.getAvatar());
        return data;
    }

    private String getExtension(String fileName) {
        if (fileName == null || !fileName.contains(".")) {
            return "";
        }
        return fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
    }

    /**
     * 调用微信 jscode2session 接口，用前端传来的 code 换取真实 openid。
     * 同一微信用户在同一小程序下的 openid 是固定不变的。
     */
    private String getOpenidByCode(String code) {
        if (wxAppId == null || wxAppId.isBlank()) {
            throw new RuntimeException("未配置微信 appId，请检查 application.yaml 中的 wx.app-id");
        }
        if (wxAppSecret == null || wxAppSecret.isBlank()) {
            throw new RuntimeException("未配置微信 appSecret，请检查环境变量 WX_APP_SECRET");
        }

        String urlStr = "https://api.weixin.qq.com/sns/jscode2session"
                + "?appid=" + wxAppId
                + "&secret=" + wxAppSecret
                + "&js_code=" + code
                + "&grant_type=authorization_code";
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(urlStr).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(10000);
            conn.setReadTimeout(10000);

            int respCode = conn.getResponseCode();
            String resp = readResponse(conn, respCode);

            if (respCode != 200) {
                log.error("jscode2session HTTP {}: {}", respCode, resp);
                throw new RuntimeException("微信登录服务暂时不可用，请稍后重试");
            }

            Map<String, Object> result = objectMapper.readValue(resp, new TypeReference<>() {});
            Integer errcode = (Integer) result.get("errcode");
            if (errcode != null && errcode != 0) {
                log.error("jscode2session errcode={}, errmsg={}", errcode, result.get("errmsg"));
                throw new RuntimeException("微信登录失败: " + result.get("errmsg"));
            }

            String openid = (String) result.get("openid");
            if (openid == null || openid.isEmpty()) {
                throw new RuntimeException("微信登录失败: openid 为空");
            }
            return openid;
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            log.error("jscode2session 调用异常: {}", e.getMessage());
            throw new RuntimeException("微信登录服务暂时不可用，请稍后重试");
        }
    }

    private String readResponse(HttpURLConnection conn, int responseCode) throws IOException {
        InputStream is = (responseCode >= 200 && responseCode < 300) ? conn.getInputStream() : conn.getErrorStream();
        if (is == null) return "";
        StringBuilder sb = new StringBuilder();
        try (BufferedReader br = new BufferedReader(new InputStreamReader(is, StandardCharsets.UTF_8))) {
            String line;
            while ((line = br.readLine()) != null) {
                sb.append(line);
            }
        }
        return sb.toString();
    }

    /**
     * 确保用户拥有"其他"默认分类（幂等，已存在则跳过）
     */
    private void ensureDefaultCategory(Integer userId) {
        CustomCategory existing = customCategoryMapper.findDefaultByUserId(userId);
        if (existing == null) {
            CustomCategory defaultCategory = new CustomCategory();
            defaultCategory.setUserId(userId);
            defaultCategory.setName("其他");
            defaultCategory.setSortOrder(0);
            defaultCategory.setIsDefault(1);
            customCategoryMapper.insert(defaultCategory);
        }
    }
}