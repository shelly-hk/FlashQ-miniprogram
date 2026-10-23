package com.flashq.service.impl;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.flashq.entity.CustomCategory;
import com.flashq.entity.CustomQuestion;
import com.flashq.entity.UploadRecord;
import com.flashq.mapper.CustomCategoryMapper;
import com.flashq.mapper.CustomQuestionMapper;
import com.flashq.mapper.UploadRecordMapper;
import com.flashq.service.AgentService;
import com.flashq.service.UploadService;
import com.flashq.service.WxSecurityService;
import lombok.RequiredArgsConstructor;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.apache.poi.xwpf.usermodel.XWPFParagraph;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileReader;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
@RequiredArgsConstructor
public class UploadServiceImpl implements UploadService {

    private static final Logger log = LoggerFactory.getLogger(UploadServiceImpl.class);

    private final UploadRecordMapper uploadRecordMapper;
    private final AgentService agentService;
    private final CustomCategoryMapper customCategoryMapper;
    private final CustomQuestionMapper customQuestionMapper;
    private final WxSecurityService wxSecurityService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${app.upload.daily-limit:30}")
    private int dailyLimit;

    @Value("${app.upload.image-max-size:5242880}")
    private long imageMaxSize;

    @Value("${app.upload.doc-max-size:1048576}")
    private long docMaxSize;

    @Value("${app.upload.image-types:jpg,jpeg,png,webp}")
    private String imageTypes;

    @Value("${app.upload.doc-types:pdf,doc,docx,txt}")
    private String docTypes;

    @Value("${app.upload.upload-dir:./uploads}")
    private String uploadDir;

    @Override
    public Map<String, Object> getUploadQuota(Integer userId) {
        LocalDate today = LocalDate.now();
        int usedToday = uploadRecordMapper.countTodayByUserId(userId, today);
        int extraReward = 0; // 当前阶段无广告奖励

        Map<String, Object> data = new HashMap<>();
        data.put("dailyLimit", dailyLimit);
        data.put("usedToday", usedToday);
        data.put("remaining", Math.max(0, dailyLimit + extraReward - usedToday));
        data.put("extraReward", extraReward);
        return data;
    }

    @Override
    public Map<String, Object> uploadFile(MultipartFile file, Integer userId, Integer categoryId) {
        // 1. 校验文件非空
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件不能为空");
        }

        // 2. 判断文件类型与大小
        String originalName = file.getOriginalFilename();
        String ext = getExtension(originalName);
        String fileType;
        long fileSize = file.getSize();

        Set<String> imgSet = new HashSet<>(Arrays.asList(imageTypes.split(",")));
        Set<String> docSet = new HashSet<>(Arrays.asList(docTypes.split(",")));

        if (imgSet.contains(ext)) {
            fileType = "image";
            if (fileSize > imageMaxSize) {
                throw new IllegalArgumentException("图片大小超过限制（最大5MB）");
            }
        } else if (docSet.contains(ext)) {
            fileType = "document";
            if (fileSize > docMaxSize) {
                throw new IllegalArgumentException("文档大小超过限制（最大100KB）");
            }
        } else {
            throw new IllegalArgumentException("不支持的文件格式：" + ext);
        }

        // 3. 检查每日上传次数
        LocalDate today = LocalDate.now();
        int usedToday = uploadRecordMapper.countTodayByUserId(userId, today);
        if (usedToday >= dailyLimit) {
            throw new RuntimeException("QUOTA_EXCEEDED");
        }

        // 3.5 解析categoryId，不传或无效则归入"其他"默认分类
        Integer resolvedCategoryId = resolveCategoryId(userId, categoryId);

        // 3.6 图片安全检测（微信 img_sec_check）
        if ("image".equals(fileType)) {
            try {
                wxSecurityService.checkImage(file.getBytes(), originalName);
            } catch (java.io.IOException e) {
                log.error("读取图片字节失败: {}", e.getMessage());
                throw new RuntimeException("文件读取失败，请重试");
            }
        }

        // 4. 保存文件到服务器
        String dirPath = uploadDir + "/" + userId;
        File dir = new File(dirPath);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        String savedName = System.currentTimeMillis() + "_" + sanitizeFileName(originalName);
        File destFile = new File(dir, savedName).getAbsoluteFile();
        try {
            file.transferTo(destFile);
        } catch (IOException e) {
            log.error("文件保存失败: {}", e.getMessage());
            throw new RuntimeException("文件保存失败");
        }

        // 5. 创建上传记录（status=0 解析中）
        UploadRecord record = new UploadRecord();
        record.setUserId(userId);
        record.setFileName(originalName);
        record.setFileType(fileType);
        record.setFileSize(fileSize);
        record.setFilePath(destFile.getAbsolutePath());
        record.setStatus(0);
        record.setQuestionCount(0);
        record.setUploadDate(today);
        uploadRecordMapper.insert(record);

        // 6. 异步调用 Agent 解析，传入 categoryId
        agentService.processUploadAsync(record.getId(), resolvedCategoryId);

        // 7. 返回 taskId
        Map<String, Object> data = new HashMap<>();
        data.put("taskId", record.getId());
        data.put("status", 0);
        data.put("message", "文件已接收，正在解析中");
        return data;
    }

    @Override
    public Map<String, Object> uploadText(String text, Integer userId) {
        // 1. 校验文本内容
        if (text == null || text.trim().isEmpty()) {
            throw new IllegalArgumentException("文本内容不能为空");
        }
        if (text.trim().length() < 10) {
            throw new IllegalArgumentException("文本内容太短，至少10个字");
        }

        // 2. 检查每日上传次数
        LocalDate today = LocalDate.now();
        int usedToday = uploadRecordMapper.countTodayByUserId(userId, today);
        if (usedToday >= dailyLimit) {
            throw new RuntimeException("QUOTA_EXCEEDED");
        }

        // 3. 将文本保存为 .txt 文件（复用现有解析流程）
        String dirPath = uploadDir + "/" + userId;
        File dir = new File(dirPath);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        String savedName = System.currentTimeMillis() + "_粘贴文本.txt";
        File destFile = new File(dir, savedName).getAbsoluteFile();
        try {
            Files.write(destFile.toPath(), text.getBytes(StandardCharsets.UTF_8));
        } catch (IOException e) {
            log.error("保存文本文件失败: {}", e.getMessage());
            throw new RuntimeException("文本保存失败，请重试");
        }

        // 4. 创建上传记录（status=0 解析中）
        UploadRecord record = new UploadRecord();
        record.setUserId(userId);
        record.setFileName("粘贴文本");
        record.setFileType("text");
        record.setFileSize((long) text.getBytes(StandardCharsets.UTF_8).length);
        record.setFilePath(destFile.getAbsolutePath());
        record.setStatus(0);
        record.setQuestionCount(0);
        record.setUploadDate(today);
        uploadRecordMapper.insert(record);

        // 5. 异步调用 Agent 解析（粘贴文本不指定分类，用户可在前端后续归类）
        agentService.processUploadAsync(record.getId(), null);

        // 6. 返回 taskId
        Map<String, Object> data = new HashMap<>();
        data.put("taskId", record.getId());
        data.put("status", 0);
        data.put("message", "文本已接收，正在解析中");
        return data;
    }

    @Override
    public Map<String, Object> getTaskStatus(Integer taskId, Integer userId) {
        UploadRecord record = uploadRecordMapper.findById(taskId);
        if (record == null || !record.getUserId().equals(userId)) {
            throw new IllegalArgumentException("任务不存在或无权查看");
        }

        Map<String, Object> data = new HashMap<>();
        data.put("taskId", record.getId());
        data.put("status", record.getStatus());

        switch (record.getStatus()) {
            case 0 -> {
                data.put("statusText", "解析中");
                data.put("questionCount", 0);
            }
            case 1 -> {
                data.put("statusText", "成功");
                data.put("questionCount", record.getQuestionCount());
                data.put("fileName", record.getFileName());
            }
            case 2 -> {
                data.put("statusText", "失败");
                data.put("questionCount", 0);
                data.put("failReason", record.getFailReason());
            }
        }
        return data;
    }

    @Override
    public Map<String, Object> getUploadRecordList(Integer userId, int page, int size) {
        int offset = (page - 1) * size;
        List<UploadRecord> records = uploadRecordMapper.findByUserId(userId, offset, size);
        int total = uploadRecordMapper.countByUserId(userId);

        List<Map<String, Object>> list = new ArrayList<>();
        for (UploadRecord r : records) {
            Map<String, Object> item = new HashMap<>();
            item.put("taskId", r.getId());
            item.put("fileName", r.getFileName());
            item.put("fileType", r.getFileType());
            item.put("fileSize", r.getFileSize());
            item.put("status", r.getStatus());
            item.put("statusText", getStatusText(r.getStatus()));
            item.put("questionCount", r.getQuestionCount());
            if (r.getFailReason() != null) {
                item.put("failReason", r.getFailReason());
            }
            item.put("createTime", r.getCreateTime());
            list.add(item);
        }

        Map<String, Object> data = new HashMap<>();
        data.put("total", total);
        data.put("list", list);
        return data;
    }

    private String getExtension(String fileName) {
        if (fileName == null || !fileName.contains(".")) {
            return "";
        }
        return fileName.substring(fileName.lastIndexOf('.') + 1).toLowerCase();
    }

    private String getStatusText(int status) {
        return switch (status) {
            case 0 -> "解析中";
            case 1 -> "成功";
            case 2 -> "失败";
            default -> "未知";
        };
    }

    /**
     * 解析categoryId，不传或无效则归入"其他"默认分类
     */
    private Integer resolveCategoryId(Integer userId, Integer categoryId) {
        if (categoryId != null && categoryId > 0) {
            // 校验分类归属
            CustomCategory category = customCategoryMapper.findByIdAndUserId(categoryId, userId);
            if (category != null) {
                return categoryId;
            }
        }
        // 未传或无效 → 归入"其他"
        CustomCategory defaultCategory = customCategoryMapper.findDefaultByUserId(userId);
        return defaultCategory != null ? defaultCategory.getId() : null;
    }

    // ==================== 导入题目（按格式规范，不走AI） ====================

    /** 选项行匹配：A. / A、 / A) / A） 开头 */
    private static final Pattern OPTION_PATTERN = Pattern.compile("^([A-Za-z])[.、)）]\\s*(.+)");

    /** 解析失败计数上限提示 */
    private static final int IMPORT_MAX_QUESTIONS = 200;

    @Override
    public Map<String, Object> importQuestionsFromText(String text, Integer userId, Integer categoryId) {
        if (text == null || text.trim().isEmpty()) {
            throw new IllegalArgumentException("文本内容不能为空");
        }
        if (text.trim().length() < 10) {
            throw new IllegalArgumentException("文本内容太短，至少10个字");
        }
        if (text.length() > 50000) {
            throw new IllegalArgumentException("文本内容过长，最大50000字");
        }

        // 安全检测
        wxSecurityService.checkText(text);

        // 解析题目
        ParseOutcome outcome = parseQuestions(text, userId);
        if (outcome.questions.isEmpty()) {
            // 全部失败，拼接错误详情
            String detail = String.join("；", outcome.errors);
            throw new IllegalArgumentException("未解析到有效题目。" + detail);
        }
        if (outcome.questions.size() > IMPORT_MAX_QUESTIONS) {
            throw new IllegalArgumentException("题目数量超过上限（" + IMPORT_MAX_QUESTIONS + "道）");
        }

        Integer resolvedCategoryId = resolveCategoryId(userId, categoryId);

        int success = 0;
        for (CustomQuestion q : outcome.questions) {
            q.setCategoryId(resolvedCategoryId);
            q.setSourceType("text");
            q.setSourceFileName("导入题目");
            q.setUploadRecordId(null);
            customQuestionMapper.insert(q);
            success++;
        }

        log.info("用户{} 导入文本题目 {} 道，失败 {} 道", userId, success, outcome.errors.size());

        Map<String, Object> data = new HashMap<>();
        data.put("imported", success);
        data.put("failed", outcome.errors.size());
        data.put("total", success);
        if (!outcome.errors.isEmpty()) {
            data.put("errors", outcome.errors);
        }
        return data;
    }

    @Override
    public Map<String, Object> importQuestionsFromFile(MultipartFile file, Integer userId, Integer categoryId) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("文件不能为空");
        }

        String originalName = file.getOriginalFilename();
        String ext = getExtension(originalName);
        long fileSize = file.getSize();

        Set<String> docSet = new HashSet<>(Arrays.asList(docTypes.split(",")));
        if (!docSet.contains(ext)) {
            throw new IllegalArgumentException("不支持的文件格式：" + ext + "，仅支持 " + docTypes);
        }
        if (fileSize > docMaxSize) {
            throw new IllegalArgumentException("文档大小超过限制（最大1MB）");
        }

        // 保存文件到临时位置
        String dirPath = uploadDir + "/" + userId;
        File dir = new File(dirPath);
        if (!dir.exists()) {
            dir.mkdirs();
        }
        String savedName = System.currentTimeMillis() + "_import_" + sanitizeFileName(originalName);
        File destFile = new File(dir, savedName).getAbsoluteFile();
        try {
            file.transferTo(destFile);
        } catch (IOException e) {
            log.error("文件保存失败: {}", e.getMessage());
            throw new RuntimeException("文件保存失败");
        }

        // 提取文本内容
        String textContent = extractTextForImport(destFile.getAbsolutePath(), ext);
        if (textContent == null || textContent.trim().isEmpty()) {
            throw new IllegalArgumentException("无法从文件中提取文本内容，请检查文件是否正确");
        }
        // 文件导入允许更大的文本量（50000字符，约300道题）
        if (textContent.length() > 50000) {
            textContent = textContent.substring(0, 50000);
        }

        // 安全检测
        wxSecurityService.checkText(textContent);

        // 解析题目
        ParseOutcome outcome = parseQuestions(textContent, userId);
        if (outcome.questions.isEmpty()) {
            String detail = String.join("；", outcome.errors);
            throw new IllegalArgumentException("未解析到有效题目。" + detail);
        }
        if (outcome.questions.size() > IMPORT_MAX_QUESTIONS) {
            throw new IllegalArgumentException("题目数量超过上限（" + IMPORT_MAX_QUESTIONS + "道）");
        }

        Integer resolvedCategoryId = resolveCategoryId(userId, categoryId);

        int success = 0;
        for (CustomQuestion q : outcome.questions) {
            q.setCategoryId(resolvedCategoryId);
            q.setSourceType("document");
            q.setSourceFileName(originalName);
            q.setUploadRecordId(null);
            customQuestionMapper.insert(q);
            success++;
        }

        log.info("用户{} 导入文件题目 {} 道，失败 {} 道，来源：{}", userId, success, outcome.errors.size(), originalName);

        Map<String, Object> data = new HashMap<>();
        data.put("imported", success);
        data.put("failed", outcome.errors.size());
        data.put("total", success);
        if (!outcome.errors.isEmpty()) {
            data.put("errors", outcome.errors);
        }
        return data;
    }

    /**
     * 按格式规范解析题目文本
     * 格式：每道题由"题干："开头，选项用 A./B./C./D.，答案用"答案："，解析用"解析："，难度用"难度："
     * 题目之间用空行分隔
     */
    private ParseOutcome parseQuestions(String text, Integer userId) {
        List<CustomQuestion> questions = new ArrayList<>();
        List<String> errors = new ArrayList<>();

        // 按空行分割题目块
        String[] blocks = text.split("\\n\\s*\\n");

        int blockIndex = 0;
        for (String block : blocks) {
            blockIndex++;
            String trimmed = block.trim();
            if (trimmed.isEmpty()) continue;

            // 跳过不含"题干"的文本块（如文档标题、目录、前言等非题目内容）
            if (!trimmed.contains("题干")) {
                continue;
            }

            ParseResult pr = parseQuestionBlock(trimmed, userId);
            if (pr.question != null) {
                questions.add(pr.question);
            } else {
                errors.add("第" + blockIndex + "题：" + pr.error);
            }
        }

        return new ParseOutcome(questions, errors);
    }

    /** 解析单个题目块，返回题目或错误原因 */
    private ParseResult parseQuestionBlock(String block, Integer userId) {
        String[] lines = block.split("\\n");

        String stem = null;
        List<String> options = new ArrayList<>();
        String answer = null;
        String explanation = "";
        int difficulty = 2; // 默认中等

        for (String rawLine : lines) {
            String line = rawLine.trim();
            if (line.isEmpty()) continue;

            // 匹配题干
            if (line.startsWith("题干：") || line.startsWith("题干:")) {
                stem = extractAfterColon(line);
            }
            // 匹配答案
            else if (line.startsWith("答案：") || line.startsWith("答案:")) {
                answer = extractAfterColon(line).toUpperCase().replaceAll("[^A-Z]", "");
            }
            // 匹配解析
            else if (line.startsWith("解析：") || line.startsWith("解析:")) {
                explanation = extractAfterColon(line);
            }
            // 匹配难度
            else if (line.startsWith("难度：") || line.startsWith("难度:")) {
                String diff = extractAfterColon(line).trim();
                if (diff.contains("初") || diff.contains("简") || diff.contains("1") || diff.contains("易")) {
                    difficulty = 1;
                } else if (diff.contains("高") || diff.contains("难") || diff.contains("3")) {
                    difficulty = 3;
                } else {
                    difficulty = 2;
                }
            }
            // 匹配选项：A.xxx / A、xxx / A)xxx / A）xxx
            else {
                Matcher m = OPTION_PATTERN.matcher(line);
                if (m.matches()) {
                    String letter = m.group(1).toUpperCase();
                    String content = m.group(2).trim();
                    options.add(letter + "." + content);
                }
            }
        }

        // 校验必须字段，返回具体错误原因
        if (stem == null || stem.isEmpty()) {
            return ParseResult.fail("缺少\"题干：\"或题干内容为空");
        }
        if (options.size() < 2) {
            return ParseResult.fail("选项不足2个（当前" + options.size() + "个），需以 A. B. C. ... 格式编写");
        }
        if (answer == null || answer.isEmpty()) {
            return ParseResult.fail("缺少\"答案：\"或答案内容为空");
        }
        // 校验答案字母在选项范围内
        String maxLetter = String.valueOf((char) ('A' + options.size() - 1));
        for (char c : answer.toCharArray()) {
            String letter = String.valueOf(c);
            if (letter.compareTo("A") < 0 || letter.compareTo(maxLetter) > 0) {
                return ParseResult.fail("答案\"" + answer + "\"超出选项范围（A-" + maxLetter + "）");
            }
        }

        CustomQuestion q = new CustomQuestion();
        q.setUserId(userId);
        q.setContent(stem);
        try {
            q.setOptionList(objectMapper.writeValueAsString(options));
        } catch (Exception e) {
            log.error("序列化选项失败: {}", e.getMessage());
            return ParseResult.fail("选项序列化失败");
        }
        q.setAnswer(answer);
        q.setExplanation(explanation);
        q.setDifficulty(difficulty);
        return ParseResult.ok(q);
    }

    /**
     * 提取冒号后的内容（支持中文：和英文:）
     */
    private String extractAfterColon(String line) {
        int idx = line.indexOf('：');
        if (idx < 0) idx = line.indexOf(':');
        if (idx < 0) return "";
        return line.substring(idx + 1).trim();
    }

    /**
     * 净化原始文件名：仅保留字母、数字、点、下划线、短横，其余替换为下划线。
     * 防止路径穿越（../）、绝对路径、特殊字符注入。
     */
    private String sanitizeFileName(String name) {
        if (name == null) return "file";
        String safe = name.replaceAll("[^a-zA-Z0-9._-]", "_");
        // 进一步限制长度，避免过长
        if (safe.length() > 80) {
            safe = safe.substring(safe.length() - 80);
        }
        return safe.isEmpty() ? "file" : safe;
    }

    /**
     * 从文件提取文本（导入专用，支持txt/pdf/docx）
     */
    private String extractTextForImport(String filePath, String ext) {
        File file = new File(filePath);
        if (!file.exists()) return null;

        try {
            switch (ext) {
                case "txt":
                    return readTextFileForImport(file);
                case "pdf":
                    return readPdfForImport(file);
                case "docx":
                    return readDocxForImport(file);
                case "doc":
                    // 旧版 .doc 格式暂不支持纯文本提取
                    log.warn("导入不支持旧版.doc格式，请转换为.docx");
                    return null;
                default:
                    return null;
            }
        } catch (Exception e) {
            log.error("提取文件内容失败: {}", e.getMessage());
            return null;
        }
    }

    private String readTextFileForImport(File file) throws Exception {
        StringBuilder sb = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new FileReader(file, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                sb.append(line).append("\n");
            }
        }
        return sb.toString();
    }

    private String readPdfForImport(File file) {
        try {
            byte[] data = Files.readAllBytes(file.toPath());
            try (PDDocument document = Loader.loadPDF(data)) {
                PDFTextStripper stripper = new PDFTextStripper();
                return stripper.getText(document);
            }
        } catch (Exception e) {
            log.error("PDF解析失败: {}", e.getMessage());
            return null;
        }
    }

    private String readDocxForImport(File file) {
        StringBuilder sb = new StringBuilder();
        try (FileInputStream fis = new FileInputStream(file);
             XWPFDocument doc = new XWPFDocument(fis)) {
            for (XWPFParagraph para : doc.getParagraphs()) {
                String text = para.getText();
                if (text != null && !text.isBlank()) {
                    sb.append(text).append("\n");
                } else {
                    // 保留空段落作为题目之间的分隔符（不跳过！）
                    sb.append("\n");
                }
            }
        } catch (Exception e) {
            log.error("docx解析失败: {}", e.getMessage());
            return null;
        }
        return sb.toString();
    }

    // ==================== 导入解析辅助类 ====================

    /** 单道题目的解析结果 */
    private static class ParseResult {
        final CustomQuestion question;
        final String error;

        private ParseResult(CustomQuestion question, String error) {
            this.question = question;
            this.error = error;
        }

        static ParseResult ok(CustomQuestion q) {
            return new ParseResult(q, null);
        }

        static ParseResult fail(String reason) {
            return new ParseResult(null, reason);
        }
    }

    /** 整体解析结果：成功题目 + 失败详情 */
    private static class ParseOutcome {
        final List<CustomQuestion> questions;
        final List<String> errors;

        ParseOutcome(List<CustomQuestion> questions, List<String> errors) {
            this.questions = questions;
            this.errors = errors;
        }
    }
}
