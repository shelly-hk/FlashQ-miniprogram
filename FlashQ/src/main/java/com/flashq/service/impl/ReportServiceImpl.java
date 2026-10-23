package com.flashq.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.common.BizException;
import com.flashq.common.report.HeatmapLevelResolver;
import com.flashq.common.report.MigrationConflictResolver;
import com.flashq.common.report.PosterRenderer;
import com.flashq.common.report.SectionBucketizer;
import com.flashq.common.report.SectionBucketizer.DaySections;
import com.flashq.common.report.SectionBucketizer.ReportSection;
import com.flashq.common.report.StreakCalculator;
import com.flashq.entity.CustomCategory;
import com.flashq.entity.ReportDailySnapshot;
import com.flashq.entity.ReportPoster;
import com.flashq.entity.ReportShareVisit;
import com.flashq.entity.ReportStreak;
import com.flashq.entity.ReportSubjectDaily;
import com.flashq.entity.Subject;
import com.flashq.entity.User;
import com.flashq.mapper.CustomCategoryMapper;
import com.flashq.mapper.ReportDailySnapshotMapper;
import com.flashq.mapper.ReportPosterMapper;
import com.flashq.mapper.ReportShareVisitMapper;
import com.flashq.mapper.ReportStreakMapper;
import com.flashq.mapper.ReportSubjectDailyMapper;
import com.flashq.mapper.SubjectMapper;
import com.flashq.mapper.UserMapper;
import com.flashq.service.ReportService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

/**
 * 学习报告服务实现（《学习报告后端新增功能开发规范》v1.0.0）
 */
@Service
public class ReportServiceImpl implements ReportService {

    private static final Logger log = LoggerFactory.getLogger(ReportServiceImpl.class);

    /** 海报每日生成上限（规范 6.3 用户级限流） */
    private static final int POSTER_DAILY_LIMIT = 10;
    /** 幂等键有效期（规范 3.8：24 小时） */
    private static final int IDEMPOTENCY_HOURS = 24;
    /** 海报有效期（规范 3.8：7 天） */
    private static final int POSTER_EXPIRE_DAYS = 7;
    /** 科目正确率最大跨度（规范 3.5：90 天） */
    private static final int ACCURACY_MAX_DAYS = 90;
    /** 时段分布最大窗口（规范 3.6：90 天） */
    private static final int TIME_DIST_MAX_DAYS = 90;
    /** 分享场景字段最大长度（与 DDL VARCHAR(16) 对齐） */
    private static final int SCENE_MAX_LEN = 16;

    private static final Random RANDOM = new SecureRandom();
    private static final String BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    private final ReportDailySnapshotMapper snapshotMapper;
    private final ReportSubjectDailyMapper subjectDailyMapper;
    private final ReportStreakMapper streakMapper;
    private final ReportPosterMapper posterMapper;
    private final ReportShareVisitMapper shareVisitMapper;
    private final UserMapper userMapper;
    private final SubjectMapper subjectMapper;
    private final CustomCategoryMapper customCategoryMapper;
    private final HeatmapLevelResolver levelResolver;
    private final PosterRenderer posterRenderer;
    private final ObjectMapper objectMapper;

    public ReportServiceImpl(ReportDailySnapshotMapper snapshotMapper,
                             ReportSubjectDailyMapper subjectDailyMapper,
                             ReportStreakMapper streakMapper,
                             ReportPosterMapper posterMapper,
                             ReportShareVisitMapper shareVisitMapper,
                             UserMapper userMapper,
                             SubjectMapper subjectMapper,
                             CustomCategoryMapper customCategoryMapper,
                             HeatmapLevelResolver levelResolver,
                             PosterRenderer posterRenderer,
                             ObjectMapper objectMapper) {
        this.snapshotMapper = snapshotMapper;
        this.subjectDailyMapper = subjectDailyMapper;
        this.streakMapper = streakMapper;
        this.posterMapper = posterMapper;
        this.shareVisitMapper = shareVisitMapper;
        this.userMapper = userMapper;
        this.subjectMapper = subjectMapper;
        this.customCategoryMapper = customCategoryMapper;
        this.levelResolver = levelResolver;
        this.posterRenderer = posterRenderer;
        this.objectMapper = objectMapper;
    }

    // ================================================================
    // 规范 5.1 答题事件落库（同一事务：日快照 + 科目日统计 + 连续打卡）
    // ================================================================

    @Override
    @Transactional
    public void recordAnswer(Integer userId, String subjectId, boolean correct, LocalDateTime answerTime) {
        if (userId == null || answerTime == null) {
            return;
        }
        LocalDate date = answerTime.toLocalDate();
        int hour = answerTime.getHour();
        int correctInc = correct ? 1 : 0;

        // 1. 日快照（uk_user_date 唯一键 + FOR UPDATE 行锁，规范 5.3）
        ReportDailySnapshot snapshot = snapshotMapper.selectForUpdate(userId, date);
        if (snapshot == null) {
            snapshot = new ReportDailySnapshot();
            snapshot.setUserId(userId);
            snapshot.setDate(date);
            snapshot.setTotal(1);
            snapshot.setCorrect(correctInc);
            snapshot.setFirstAt(answerTime);
            snapshot.setLastAt(answerTime);
            DaySections sections = new DaySections();
            sections.addAnswer(hour, correct);
            snapshot.setSections(sections.toJson());
            snapshot.setSource("event");
            snapshotMapper.insert(snapshot);
        } else {
            snapshot.setTotal(safeInt(snapshot.getTotal()) + 1);
            snapshot.setCorrect(safeInt(snapshot.getCorrect()) + correctInc);
            if (snapshot.getFirstAt() == null || answerTime.isBefore(snapshot.getFirstAt())) {
                snapshot.setFirstAt(answerTime);
            }
            if (snapshot.getLastAt() == null || answerTime.isAfter(snapshot.getLastAt())) {
                snapshot.setLastAt(answerTime);
            }
            DaySections sections = DaySections.fromJson(snapshot.getSections());
            sections.addAnswer(hour, correct);
            snapshot.setSections(sections.toJson());
            if (!"event".equals(snapshot.getSource())) {
                snapshot.setSource("event");
            }
            snapshotMapper.updateById(snapshot);
        }

        // 2. 科目日统计（uk_user_date_subj 唯一键）
        ReportSubjectDaily subjectDaily = subjectDailyMapper.selectForUpdate(userId, date, subjectId);
        if (subjectDaily == null) {
            subjectDaily = new ReportSubjectDaily();
            subjectDaily.setUserId(userId);
            subjectDaily.setDate(date);
            subjectDaily.setSubjectId(subjectId);
            subjectDaily.setTotal(1);
            subjectDaily.setCorrect(correctInc);
            subjectDailyMapper.insert(subjectDaily);
        } else {
            subjectDaily.setTotal(safeInt(subjectDaily.getTotal()) + 1);
            subjectDaily.setCorrect(safeInt(subjectDaily.getCorrect()) + correctInc);
            subjectDailyMapper.updateById(subjectDaily);
        }

        // 3. 连续打卡（SELECT ... FOR UPDATE + 事务，规范 5.2.1）
        ReportStreak current = streakMapper.selectForUpdate(userId);
        StreakCalculator.State state = current == null ? null
                : new StreakCalculator.State(current.getLastActiveDate(),
                safeInt(current.getStreakCurrent()),
                safeInt(current.getStreakLongest()),
                safeInt(current.getTotalDays()));
        StreakCalculator.State next = StreakCalculator.update(state, date);

        ReportStreak toSave = new ReportStreak();
        toSave.setUserId(userId);
        toSave.setStreakCurrent(next.streakCurrent);
        toSave.setStreakLongest(next.streakLongest);
        toSave.setLastActiveDate(next.lastActiveDate);
        toSave.setTotalDays(next.totalDays);
        streakMapper.upsert(toSave);
    }

    // ================================================================
    // 规范 3.3 获取报告汇总
    // ================================================================

    @Override
    public Map<String, Object> getSummary(Integer userId, String timezone) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("user_id", userId);

        ReportStreak streak = streakMapper.selectForUpdate(userId);
        Map<String, Object> sum = snapshotMapper.sumByUser(userId);
        int totalQuestions = toInt(sum.get("total_questions"));
        int totalCorrect = toInt(sum.get("total_correct"));
        int activeDays = snapshotMapper.countActiveDays(userId);
        LocalDate lastActiveDate = snapshotMapper.selectLastActiveDate(userId);

        int streakCurrent = streak != null ? safeInt(streak.getStreakCurrent()) : 0;
        int streakLongest = streak != null ? safeInt(streak.getStreakLongest()) : 0;
        int totalDays = streak != null ? safeInt(streak.getTotalDays()) : 0;

        data.put("streak_current", streakCurrent);
        data.put("streak_longest", streakLongest);
        data.put("total_questions", totalQuestions);
        data.put("total_correct", totalCorrect);
        data.put("total_days", Math.max(totalDays, activeDays));
        data.put("last_active_date", lastActiveDate != null ? lastActiveDate.toString() : null);
        data.put("updated_at", LocalDateTime.now(ZONE).atZone(ZONE).toEpochSecond());
        return data;
    }

    // ================================================================
    // 规范 3.4 获取热力图数据
    // ================================================================

    @Override
    public Map<String, Object> getHeatmap(Integer userId, int days, LocalDate endDate) {
        LocalDate end = endDate != null ? endDate : LocalDate.now(ZONE);
        if (end.isAfter(LocalDate.now(ZONE))) {
            throw new BizException(422, "end_date 不能超过今天");
        }
        LocalDate start = end.minusDays(days - 1L);

        List<ReportDailySnapshot> rows = snapshotMapper.selectRange(userId, start, end);
        Map<LocalDate, Integer> countByDate = new LinkedHashMap<>();
        for (ReportDailySnapshot row : rows) {
            countByDate.put(row.getDate(), safeInt(row.getTotal()));
        }

        List<Map<String, Object>> cells = new ArrayList<>();
        int maxCount = 0;
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            int count = countByDate.getOrDefault(d, 0);
            maxCount = Math.max(maxCount, count);
            Map<String, Object> cell = new LinkedHashMap<>();
            cell.put("date", d.toString());
            cell.put("count", count);
            cell.put("level", levelResolver.levelOf(count));
            cells.add(cell);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("days", days);
        data.put("end_date", end.toString());
        data.put("cells", cells);
        data.put("legend", levelResolver.legend(maxCount));
        return data;
    }

    // ================================================================
    // 规范 3.5 获取科目正确率
    // ================================================================

    @Override
    public Map<String, Object> getSubjectAccuracy(Integer userId, LocalDate startDate, LocalDate endDate) {
        if (startDate == null || endDate == null) {
            throw new BizException(422, "start_date 与 end_date 为必填参数");
        }
        if (endDate.isBefore(startDate)) {
            throw new BizException(422, "start_date 不能晚于 end_date");
        }
        if (startDate.plusDays(ACCURACY_MAX_DAYS - 1L).isBefore(endDate)) {
            throw new BizException(422, "日期跨度不能超过 " + ACCURACY_MAX_DAYS + " 天");
        }

        List<Map<String, Object>> rows = subjectDailyMapper.aggregateRange(userId, startDate, endDate);
        List<Map<String, Object>> subjects = new ArrayList<>();
        for (Map<String, Object> row : rows) {
            String subjectId = String.valueOf(row.get("subject_id"));
            int total = toInt(row.get("total"));
            int correct = toInt(row.get("correct"));
            Map<String, Object> subject = new LinkedHashMap<>();
            subject.put("subject_id", subjectId);
            subject.put("subject_name", resolveSubjectName(userId, subjectId));
            subject.put("total", total);
            subject.put("correct", correct);
            subject.put("accuracy", total > 0
                    ? BigDecimal.valueOf(correct).divide(BigDecimal.valueOf(total), 3, RoundingMode.HALF_UP).doubleValue()
                    : 0d);
            subjects.add(subject);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        Map<String, Object> range = new LinkedHashMap<>();
        range.put("start_date", startDate.toString());
        range.put("end_date", endDate.toString());
        data.put("range", range);
        data.put("subjects", subjects);
        return data;
    }

    // ================================================================
    // 规范 3.6 获取最佳时段分布
    // ================================================================

    @Override
    public Map<String, Object> getTimeDistribution(Integer userId, int days, String bucket) {
        int window = Math.min(Math.max(days, 1), TIME_DIST_MAX_DAYS);
        LocalDate end = LocalDate.now(ZONE);
        LocalDate start = end.minusDays(window - 1L);

        List<ReportDailySnapshot> rows = snapshotMapper.selectRange(userId, start, end);
        DaySections merged = new DaySections();
        for (ReportDailySnapshot row : rows) {
            merged.mergeMax(DaySections.fromJson(row.getSections()));
        }

        boolean hourBucket = "hour".equalsIgnoreCase(bucket);
        List<Map<String, Object>> sections = new ArrayList<>();
        if (hourBucket) {
            for (int h = 0; h < 24; h++) {
                int[] stat = merged.getHours().getOrDefault(String.valueOf(h), new int[]{0, 0});
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("key", String.valueOf(h));
                item.put("label", String.format("%02d:00", h));
                item.put("count", stat[0]);
                item.put("accuracy", accuracyOf(stat[1], stat[0]));
                sections.add(item);
            }
        } else {
            Map<String, int[]> agg = merged.sectionAgg();
            for (ReportSection section : ReportSection.ordered()) {
                int[] stat = agg.get(section.key);
                Map<String, Object> item = new LinkedHashMap<>();
                item.put("key", section.key);
                item.put("label", section.label);
                item.put("count", stat[0]);
                item.put("accuracy", accuracyOf(stat[1], stat[0]));
                sections.add(item);
            }
        }

        // best_section：取 count ≥ 10 的时段中 accuracy × log(count+1) 最高者（规范 3.6）
        Map<String, Object> bestSection = null;
        double bestScore = -1;
        Map<String, int[]> sectionAgg = merged.sectionAgg();
        for (ReportSection section : ReportSection.ordered()) {
            int[] stat = sectionAgg.get(section.key);
            int count = stat[0];
            if (count < 10) continue;
            double score = ((double) stat[1] / count) * Math.log(count + 1);
            if (score > bestScore) {
                bestScore = score;
                bestSection = new LinkedHashMap<>();
                bestSection.put("key", section.key);
                bestSection.put("label", section.label);
            }
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("bucket", hourBucket ? "hour" : "section");
        data.put("days", window);
        data.put("sections", sections);
        data.put("best_section", bestSection);
        return data;
    }

    // ================================================================
    // 规范 3.7 按日期回溯快照
    // ================================================================

    @Override
    public Map<String, Object> getSnapshot(Integer userId, LocalDate date) {
        if (date == null) {
            throw new BizException(422, "日期格式错误，应为 YYYY-MM-DD");
        }
        if (date.isAfter(LocalDate.now(ZONE))) {
            throw new BizException(422, "日期不能超过今天");
        }
        ReportDailySnapshot snapshot = snapshotMapper.selectForUpdate(userId, date);
        if (snapshot == null || safeInt(snapshot.getTotal()) <= 0) {
            throw new BizException(404, "该日期无答题记录");
        }

        List<ReportSubjectDaily> subjectRows = subjectDailyMapper.selectByUserAndDate(userId, date);
        List<Map<String, Object>> subjects = new ArrayList<>();
        for (ReportSubjectDaily row : subjectRows) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("subject_id", row.getSubjectId());
            item.put("subject_name", resolveSubjectName(userId, row.getSubjectId()));
            item.put("total", safeInt(row.getTotal()));
            item.put("correct", safeInt(row.getCorrect()));
            subjects.add(item);
        }

        Map<String, int[]> sectionAgg = DaySections.fromJson(snapshot.getSections()).sectionAgg();
        List<Map<String, Object>> sections = new ArrayList<>();
        for (ReportSection section : ReportSection.ordered()) {
            int[] stat = sectionAgg.get(section.key);
            if (stat[0] <= 0) continue;
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", section.key);
            item.put("count", stat[0]);
            sections.add(item);
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("date", date.toString());
        data.put("total_questions", safeInt(snapshot.getTotal()));
        data.put("total_correct", safeInt(snapshot.getCorrect()));
        data.put("subjects", subjects);
        data.put("sections", sections);
        data.put("first_answer_at", toEpochSecond(snapshot.getFirstAt()));
        data.put("last_answer_at", toEpochSecond(snapshot.getLastAt()));
        return data;
    }

    // ================================================================
    // 规范 3.8 生成学习海报
    // ================================================================

    @Override
    public Map<String, Object> generatePoster(Integer userId, String template,
                                              LocalDate startDate, LocalDate endDate,
                                              boolean highlightStreak, boolean highlightBestSubject,
                                              boolean highlightBestSection, String idempotencyKey) {
        LocalDate start = startDate != null ? startDate : LocalDate.now(ZONE).minusDays(29);
        LocalDate end = endDate != null ? endDate : LocalDate.now(ZONE);
        if (end.isBefore(start)) {
            throw new BizException(422, "start_date 不能晚于 end_date");
        }
        if (end.isAfter(LocalDate.now(ZONE))) {
            throw new BizException(422, "end_date 不能超过今天");
        }

        // 1. 限流：单用户每日 10 次（规范 6.3）
        LocalDateTime dayStart = LocalDate.now(ZONE).atStartOfDay();
        if (posterMapper.countTodayByUser(userId, dayStart) >= POSTER_DAILY_LIMIT) {
            throw new BizException(429, "今日海报生成次数已达上限（" + POSTER_DAILY_LIMIT + " 次），明天再试");
        }

        // 2. 幂等：24h 内相同 idempotency_key 直接返回首次结果（规范 3.8）
        if (idempotencyKey != null && !idempotencyKey.isBlank()) {
            ReportPoster existed = posterMapper.findByIdempotencyKey(userId, idempotencyKey,
                    LocalDateTime.now(ZONE).minusHours(IDEMPOTENCY_HOURS));
            if (existed != null) {
                log.info("海报幂等命中: userId={}, key={}", userId, idempotencyKey);
                return buildPosterResponse(existed);
            }
        }

        // 3. 聚合海报数据
        PosterRenderer.PosterData posterData = buildPosterData(userId, start, end);

        // 4. 先落生成中记录（status=1），再渲染（规范 5.2.4 状态机）
        ReportPoster record = new ReportPoster();
        record.setPosterId("p_" + randomToken(12));
        record.setUserId(userId);
        record.setTemplate(template != null && !template.isBlank() ? template : "default_v1");
        record.setRangeJson(buildRangeJson(start, end, highlightStreak, highlightBestSubject, highlightBestSection));
        record.setImageUrl("");
        record.setThumbUrl("");
        record.setShareToken("st_" + randomToken(14));
        record.setIdempotencyKey(idempotencyKey);
        record.setStatus(1);
        record.setExpiresAt(LocalDateTime.now(ZONE).plusDays(POSTER_EXPIRE_DAYS));
        posterMapper.insert(record);

        // 5. 渲染 + 本地写入（失败指数退避重试 3 次，规范 5.2.4）
        PosterRenderer.RenderResult rendered = null;
        Exception lastError = null;
        for (int attempt = 1; attempt <= 3; attempt++) {
            try {
                rendered = posterRenderer.render(posterData);
                break;
            } catch (Exception e) {
                lastError = e;
                log.warn("海报渲染失败(第{}次): userId={}, err={}", attempt, userId, e.getMessage());
                try {
                    Thread.sleep((long) attempt * attempt * 200L);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }

        if (rendered == null) {
            posterMapper.updateStatus(record.getId(), 4, null);
            log.error("海报渲染最终失败: userId={}, posterId={}", userId, record.getPosterId(), lastError);
            throw new BizException(500, "海报生成失败，请稍后再试");
        }

        record.setImageUrl(rendered.imageUrl);
        record.setThumbUrl(rendered.thumbUrl);
        posterMapper.updateStatus(record.getId(), 2, LocalDateTime.now(ZONE));
        record.setStatus(2);

        log.info("海报生成成功: userId={}, posterId={}, shareToken={}",
                userId, record.getPosterId(), record.getShareToken());
        return buildPosterResponse(record);
    }

    // ================================================================
    // 规范 3.9 记录分享回流（匿名接口）
    // ================================================================

    @Override
    public boolean recordShareVisit(String shareToken, String scene, String entryPage, String visitorIp) {
        if (shareToken == null || shareToken.isBlank()) {
            return true;
        }
        ReportPoster poster = posterMapper.findByShareToken(shareToken);
        if (poster == null) {
            log.warn("分享回流-无效 share_token: {}", shareToken);
            return true;
        }

        ReportShareVisit visit = new ReportShareVisit();
        visit.setPosterId(poster.getPosterId());
        visit.setOwnerId(poster.getUserId());
        visit.setScene(truncate(scene != null ? scene : "unknown", SCENE_MAX_LEN));
        visit.setEntryPage(truncate(entryPage, 128));
        visit.setVisitorIp(truncate(visitorIp, 64));
        shareVisitMapper.insert(visit);
        return true;
    }

    // ================================================================
    // 规范 3.10 客户端 LocalStorage 数据合并迁移
    // ================================================================

    @Override
    @Transactional
    public Map<String, Object> migrate(Integer userId, Map<String, Object> clientStats, String idempotencyKey) {
        // 1. 幂等：已完成迁移的用户再次调用直接返回合并摘要（规范 3.10）
        User user = userMapper.findById(userId);
        if (user != null && user.getReportMigratedAt() != null) {
            log.info("报告迁移幂等命中: userId={}, migratedAt={}", userId, user.getReportMigratedAt());
            return buildMigrateResponse(0, 0);
        }

        // 2. 解析客户端日报数据
        List<MigrationConflictResolver.ClientDaily> clientDaily = parseClientDaily(clientStats);

        // 3. 冲突裁决：客户端最大日期 > 服务端最大日期 → 拒绝（规范 5.2.3 / 10422）
        LocalDate serverMaxDate = snapshotMapper.selectMaxDate(userId);
        LocalDate clientMaxDate = clientDaily.stream()
                .map(c -> c.date).max(LocalDate::compareTo).orElse(null);
        if (MigrationConflictResolver.shouldRejectMigration(clientMaxDate, serverMaxDate)) {
            throw new BizException(422, "本地数据日期晚于服务端，请先进入报告页刷新服务端数据后再迁移");
        }

        // 4. 逐日合并（INSERT / MERGE_MAX，source=migrate）
        int mergedDays = 0;
        int mergedRecords = 0;
        for (MigrationConflictResolver.ClientDaily client : clientDaily) {
            ReportDailySnapshot serverRow = snapshotMapper.selectForUpdate(userId, client.date);
            MigrationConflictResolver.Decision decision =
                    MigrationConflictResolver.decide(serverRow, client);
            if (decision == MigrationConflictResolver.Decision.SKIP) {
                continue;
            }
            if (decision == MigrationConflictResolver.Decision.INSERT) {
                ReportDailySnapshot row = new ReportDailySnapshot();
                row.setUserId(userId);
                row.setDate(client.date);
                row.setTotal(client.count);
                row.setCorrect(0);
                row.setSections("{\"hours\":{}}");
                row.setSource("migrate");
                snapshotMapper.insert(row);
                mergedDays++;
                mergedRecords++;
            } else {
                int newTotal = Math.max(safeInt(serverRow.getTotal()), client.count);
                if (newTotal != safeInt(serverRow.getTotal())) {
                    serverRow.setTotal(newTotal);
                    snapshotMapper.updateById(serverRow);
                    mergedRecords++;
                }
                mergedDays++;
            }
        }

        // 5. 科目累计数据：服务端无该科目记录时，补登到客户端最后答题日期
        int subjectMerged = mergeClientSubjects(userId, clientStats, clientMaxDate);
        mergedRecords += subjectMerged;

        // 6. 合并后全量重算连续打卡（保证 streak 与快照一致）
        recalculateStreak(userId);

        // 7. 标记迁移完成（幂等锚点）
        userMapper.updateReportMigratedAt(userId);

        log.info("报告迁移完成: userId={}, mergedDays={}, mergedRecords={}",
                userId, mergedDays, mergedRecords);
        Map<String, Object> response = buildMigrateResponse(mergedDays, mergedRecords);
        response.put("merged_records", mergedRecords);
        return response;
    }

    // ================================================================
    // 内部辅助
    // ================================================================

    /** 科目键 → 展示名：官方题库 "s_{科目ID}" / 自主题库 "c_{分类ID}" */
    private String resolveSubjectName(Integer userId, String subjectId) {
        if (subjectId == null) return "未知科目";
        try {
            if (subjectId.startsWith("s_")) {
                Subject subject = subjectMapper.findById(Integer.parseInt(subjectId.substring(2)));
                return subject != null && subject.getName() != null ? subject.getName() : "综合题库";
            }
            if (subjectId.startsWith("c_")) {
                CustomCategory category = customCategoryMapper.findByIdAndUserId(
                        Integer.parseInt(subjectId.substring(2)), userId);
                return category != null && category.getName() != null ? category.getName() : "自主题库";
            }
        } catch (NumberFormatException ignored) {
        }
        return "综合题库";
    }

    /** 组装海报聚合数据（规范 3.8 请求体 range + highlight） */
    private PosterRenderer.PosterData buildPosterData(Integer userId, LocalDate start, LocalDate end) {
        PosterRenderer.PosterData data = new PosterRenderer.PosterData();
        long days = end.toEpochDay() - start.toEpochDay() + 1;
        data.periodLabel = "近 " + days + " 天";
        data.dateRangeLabel = start + " ~ " + end;

        ReportStreak streak = streakMapper.selectForUpdate(userId);
        data.streakCurrent = streak != null ? safeInt(streak.getStreakCurrent()) : 0;
        data.totalDays = streak != null ? safeInt(streak.getTotalDays()) : 0;
        Map<String, Object> sum = snapshotMapper.sumByUser(userId);
        data.totalQuestions = toInt(sum.get("total_questions"));
        data.totalCorrect = toInt(sum.get("total_correct"));

        List<Map<String, Object>> subjectRows = subjectDailyMapper.aggregateRange(userId, start, end);
        String bestSubjectId = null;
        double bestSubjectAcc = -1;
        for (Map<String, Object> row : subjectRows) {
            int total = toInt(row.get("total"));
            if (total < 10) continue;
            double acc = (double) toInt(row.get("correct")) / total;
            if (acc > bestSubjectAcc) {
                bestSubjectAcc = acc;
                bestSubjectId = String.valueOf(row.get("subject_id"));
            }
        }
        if (bestSubjectId != null) {
            data.bestSubjectName = resolveSubjectName(userId, bestSubjectId);
            data.bestSubjectAccuracy = bestSubjectAcc;
        }

        List<ReportDailySnapshot> rows = snapshotMapper.selectRange(userId, start, end);
        DaySections merged = new DaySections();
        for (ReportDailySnapshot row : rows) {
            merged.mergeMax(DaySections.fromJson(row.getSections()));
        }
        Map<String, int[]> sectionAgg = merged.sectionAgg();
        double bestScore = -1;
        for (ReportSection section : ReportSection.ordered()) {
            int[] stat = sectionAgg.get(section.key);
            if (stat[0] < 10) continue;
            double score = ((double) stat[1] / stat[0]) * Math.log(stat[0] + 1);
            if (score > bestScore) {
                bestScore = score;
                data.bestSectionLabel = section.label;
            }
        }

        Map<LocalDate, Integer> countByDate = new LinkedHashMap<>();
        for (ReportDailySnapshot row : rows) {
            countByDate.put(row.getDate(), safeInt(row.getTotal()));
        }
        List<Integer> heatCounts = new ArrayList<>();
        for (LocalDate d = start; !d.isAfter(end); d = d.plusDays(1)) {
            heatCounts.add(countByDate.getOrDefault(d, 0));
        }
        if (heatCounts.size() > 30) {
            heatCounts = new ArrayList<>(heatCounts.subList(heatCounts.size() - 30, heatCounts.size()));
        }
        data.heatCounts = heatCounts;
        return data;
    }

    private String buildRangeJson(LocalDate start, LocalDate end,
                                  boolean highlightStreak, boolean highlightBestSubject,
                                  boolean highlightBestSection) {
        try {
            Map<String, Object> range = new LinkedHashMap<>();
            range.put("start_date", start.toString());
            range.put("end_date", end.toString());
            Map<String, Object> highlight = new LinkedHashMap<>();
            highlight.put("streak", highlightStreak);
            highlight.put("best_subject", highlightBestSubject);
            highlight.put("best_section", highlightBestSection);
            range.put("highlight", highlight);
            return objectMapper.writeValueAsString(range);
        } catch (Exception e) {
            log.warn("range_json 序列化失败: {}", e.getMessage());
            return "{}";
        }
    }

    private Map<String, Object> buildPosterResponse(ReportPoster poster) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("poster_id", poster.getPosterId());
        data.put("image_url", poster.getImageUrl());
        data.put("thumb_url", poster.getThumbUrl());
        data.put("share_token", poster.getShareToken());
        data.put("expires_at", toEpochSecond(poster.getExpiresAt()));
        data.put("generated_at", toEpochSecond(poster.getGeneratedAt() != null
                ? poster.getGeneratedAt() : poster.getCreateTime()));
        return data;
    }

    private Map<String, Object> buildMigrateResponse(int mergedDays, int mergedRecords) {
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("merged", true);
        data.put("merged_days", mergedDays);
        data.put("merged_records", mergedRecords);
        data.put("conflict_resolution", "max");
        data.put("next_migrate_required", false);
        return data;
    }

    /** 解析客户端 daily 列表：[{date, count}] */
    @SuppressWarnings("unchecked")
    private List<MigrationConflictResolver.ClientDaily> parseClientDaily(Map<String, Object> clientStats) {
        List<MigrationConflictResolver.ClientDaily> result = new ArrayList<>();
        if (clientStats == null) return result;
        Object daily = clientStats.get("daily");
        if (!(daily instanceof List<?> list)) return result;
        for (Object item : list) {
            if (!(item instanceof Map)) continue;
            Map<String, Object> row = (Map<String, Object>) item;
            Object dateObj = row.get("date");
            if (dateObj == null) continue;
            try {
                LocalDate date = LocalDate.parse(String.valueOf(dateObj));
                int count = row.get("count") instanceof Number n ? n.intValue() : 0;
                if (count > 0) {
                    result.add(new MigrationConflictResolver.ClientDaily(date, count));
                }
            } catch (Exception e) {
                log.warn("迁移数据条目解析失败: {}", row);
            }
        }
        return result;
    }

    @SuppressWarnings("unchecked")
    private int mergeClientSubjects(Integer userId, Map<String, Object> clientStats, LocalDate fallbackDate) {
        if (clientStats == null || fallbackDate == null) return 0;
        Object subjects = clientStats.get("subjects");
        if (!(subjects instanceof List<?> list)) return 0;

        int merged = 0;
        for (Object item : list) {
            if (!(item instanceof Map)) continue;
            Map<String, Object> row = (Map<String, Object>) item;
            Object subjectIdObj = row.get("subject_id");
            if (subjectIdObj == null) continue;
            String subjectId = String.valueOf(subjectIdObj);
            int total = row.get("total") instanceof Number n ? n.intValue() : 0;
            int correct = row.get("correct") instanceof Number n ? n.intValue() : 0;
            if (total <= 0) continue;
            if (subjectDailyMapper.existsByUserAndSubject(userId, subjectId)) continue;

            ReportSubjectDaily record = new ReportSubjectDaily();
            record.setUserId(userId);
            record.setDate(fallbackDate);
            record.setSubjectId(subjectId);
            record.setTotal(total);
            record.setCorrect(Math.min(correct, total));
            subjectDailyMapper.insert(record);
            merged++;
        }
        return merged;
    }

    private void recalculateStreak(Integer userId) {
        List<ReportDailySnapshot> all = snapshotMapper.selectRange(userId,
                LocalDate.of(1970, 1, 1), LocalDate.of(2099, 12, 31));
        streakMapper.deleteByUserId(userId);
        StreakCalculator.State state = null;
        for (ReportDailySnapshot row : all) {
            if (safeInt(row.getTotal()) <= 0) continue;
            state = StreakCalculator.update(state, row.getDate());
        }
        if (state == null) return;
        ReportStreak streak = new ReportStreak();
        streak.setUserId(userId);
        streak.setStreakCurrent(state.streakCurrent);
        streak.setStreakLongest(state.streakLongest);
        streak.setLastActiveDate(state.lastActiveDate);
        streak.setTotalDays(state.totalDays);
        streakMapper.upsert(streak);
    }

    private static double accuracyOf(int correct, int total) {
        return total > 0
                ? BigDecimal.valueOf(correct).divide(BigDecimal.valueOf(total), 3, RoundingMode.HALF_UP).doubleValue()
                : 0d;
    }

    private static Integer toEpochSecond(LocalDateTime time) {
        return time != null ? (int) time.atZone(ZONE).toEpochSecond() : null;
    }

    private static int safeInt(Integer value) {
        return value != null ? value : 0;
    }

    private static int toInt(Object value) {
        return value instanceof Number n ? n.intValue() : 0;
    }

    private static String truncate(String value, int maxLen) {
        if (value == null) return null;
        return value.length() <= maxLen ? value : value.substring(0, maxLen);
    }

    private static String randomToken(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(BASE62.charAt(RANDOM.nextInt(BASE62.length())));
        }
        return sb.toString();
    }
}
