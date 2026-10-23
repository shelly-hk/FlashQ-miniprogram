package com.flashq.common.report;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.imageio.ImageIO;
import java.awt.AlphaComposite;
import java.awt.Color;
import java.awt.Font;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RadialGradientPaint;
import java.awt.RenderingHints;
import java.awt.geom.Point2D;
import java.awt.image.BufferedImage;
import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * 学习海报服务端渲染（规范 3.8 / 5.2.4）
 * <p>
 * 单体适配：规范中的 Node Canvas / Chromium headless 渲染集群，
 * 以 JDK 内置 Java2D 等价实现，零额外依赖，输出 750×1334 PNG。
 * 图片落本地 uploads/report/ 目录（等价规范中的 OSS），
 * 通过既有 /uploads/** 静态路由分发；部署服务器需安装中文字体
 * （如 fonts-noto-cjk），否则中文将渲染为方块。
 */
@Component
public class PosterRenderer {

    private static final Logger log = LoggerFactory.getLogger(PosterRenderer.class);

    /** 海报画布尺寸（750×1334，等价 375×667 @2x） */
    private static final int W = 750;
    private static final int H = 1334;

    /** 缩略图宽度 */
    private static final int THUMB_W = 300;

    private static final Color C_GOLD = new Color(0xF5, 0xC2, 0x6B);
    private static final Color C_WHITE = Color.WHITE;

    private final String uploadDir;
    private final String baseUrl;

    public PosterRenderer(@Value("${app.upload.upload-dir:./uploads}") String uploadDir,
                          @Value("${app.base-url:}") String baseUrl) {
        this.uploadDir = uploadDir;
        this.baseUrl = baseUrl;
    }

    /** 海报渲染输入数据（由 ReportService 聚合后传入） */
    public static class PosterData {
        public String periodLabel = "近 30 天";
        public String dateRangeLabel = "";
        public int streakCurrent;
        public int totalQuestions;
        public int totalCorrect;
        public int totalDays;
        public String bestSubjectName;
        public Double bestSubjectAccuracy;
        public String bestSectionLabel;
        /** 最近每日答题数（最多 30 个，按时间正序） */
        public List<Integer> heatCounts = new ArrayList<>();
    }

    /** 渲染结果（本地文件 + 可访问 URL） */
    public static class RenderResult {
        public String imagePath;
        public String thumbPath;
        public String imageUrl;
        public String thumbUrl;
    }

    /**
     * 渲染海报并写入本地目录
     *
     * @throws IOException 磁盘写入失败（调用方按规范 5.2.4 做重试与降级）
     */
    public RenderResult render(PosterData data) throws IOException {
        BufferedImage image = new BufferedImage(W, H, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        try {
            configureHints(g);
            drawBackground(g);
            drawHeader(g, data);
            drawStreakHero(g, data);
            drawStatCards(g, data);
            drawHighlights(g, data);
            drawMiniHeatmap(g, data);
            drawFooter(g, data);
        } finally {
            g.dispose();
        }

        File dir = new File(uploadDir, "report");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("创建海报目录失败: " + dir.getAbsolutePath());
        }
        String token = UUID.randomUUID().toString().replace("-", "").substring(0, 16);
        File imageFile = new File(dir, token + ".png");
        File thumbFile = new File(dir, token + "_thumb.png");

        if (!ImageIO.write(image, "png", imageFile)) {
            throw new IOException("海报 PNG 编码失败");
        }
        if (!ImageIO.write(scale(image, THUMB_W), "png", thumbFile)) {
            log.warn("海报缩略图编码失败，主图仍可用: {}", imageFile.getName());
        }

        String prefix = baseUrl.endsWith("/") ? baseUrl + "uploads/report/" : baseUrl + "/uploads/report/";
        RenderResult result = new RenderResult();
        result.imagePath = imageFile.getAbsolutePath();
        result.thumbPath = thumbFile.getAbsolutePath();
        result.imageUrl = prefix + imageFile.getName();
        result.thumbUrl = prefix + thumbFile.getName();
        return result;
    }

    // ---------------------------------------------------------------- 绘制分区

    private void configureHints(Graphics2D g) {
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_TEXT_ANTIALIASING, RenderingHints.VALUE_TEXT_ANTIALIAS_ON);
        g.setRenderingHint(RenderingHints.KEY_RENDERING, RenderingHints.VALUE_RENDER_QUALITY);
    }

    /** 背景：三段品牌渐变 + 右上金色光斑 + 左下冷色光斑 */
    private void drawBackground(Graphics2D g) {
        g.setPaint(new GradientPaint(0, 0, new Color(0x5A, 0x8F, 0xA3),
                0, H * 0.55f, new Color(0x3D, 0x6B, 0x7E)));
        g.fillRect(0, 0, W, H);
        g.setPaint(new GradientPaint(0, H * 0.55f, new Color(0x3D, 0x6B, 0x7E),
                0, H, new Color(0x2A, 0x4F, 0x60)));
        g.fillRect(0, (int) (H * 0.55f), W, H - (int) (H * 0.55f));

        g.setPaint(new RadialGradientPaint(
                new Point2D.Float(W * 0.85f, H * 0.05f), W * 0.7f,
                new float[]{0f, 0.5f, 1f},
                new Color[]{new Color(245, 194, 107, 70), new Color(245, 194, 107, 20), new Color(245, 194, 107, 0)}));
        g.fillRect(0, 0, W, (int) (H * 0.5));

        g.setPaint(new RadialGradientPaint(
                new Point2D.Float(W * 0.1f, H * 0.95f), W * 0.7f,
                new float[]{0f, 1f},
                new Color[]{new Color(135, 206, 235, 46), new Color(135, 206, 235, 0)}));
        g.fillRect(0, (int) (H * 0.55f), W, H - (int) (H * 0.55f));
    }

    /** 顶部：金色圆点 + STUDY REPORT + 期间徽章 */
    private void drawHeader(Graphics2D g, PosterData data) {
        int pad = Math.round(W * 0.08f);

        g.setColor(C_GOLD);
        g.fillOval(pad, (int) (H * 0.052), 8, 8);
        g.setColor(new Color(255, 255, 255, 200));
        g.setFont(resolve(20, Font.PLAIN));
        g.drawString("STUDY REPORT", pad + 16, (int) (H * 0.0635));

        // 期间徽章（金色描边药丸，右上角）
        String badge = data.periodLabel;
        g.setFont(resolve(24, Font.PLAIN));
        int textW = g.getFontMetrics().stringWidth(badge);
        int badgePadX = 24;
        int badgeH = 44;
        int badgeW = textW + badgePadX * 2;
        int badgeX = W - pad - badgeW;
        int badgeY = (int) (H * 0.038);
        g.setColor(new Color(255, 255, 255, 24));
        g.fillRoundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2, badgeH / 2);
        g.setColor(C_GOLD);
        g.drawRoundRect(badgeX, badgeY, badgeW, badgeH, badgeH / 2, badgeH / 2);
        g.setColor(C_GOLD);
        g.drawString(badge, badgeX + badgePadX, badgeY + 30);
    }

    /** 主视觉：连续打卡大数字 */
    private void drawStreakHero(Graphics2D g, PosterData data) {
        int cx = W / 2;
        g.setColor(new Color(255, 255, 255, 190));
        g.setFont(resolve(28, Font.PLAIN));
        String title = "已连续打卡";
        g.drawString(title, cx - g.getFontMetrics().stringWidth(title) / 2, (int) (H * 0.185));

        String num = String.valueOf(Math.max(0, data.streakCurrent));
        g.setFont(resolve(120, Font.BOLD));
        int numW = g.getFontMetrics().stringWidth(num);
        g.setColor(C_WHITE);
        g.drawString(num, cx - numW / 2 - 20, (int) (H * 0.28));

        g.setColor(C_GOLD);
        g.setFont(resolve(34, Font.BOLD));
        g.drawString("天", cx - numW / 2 - 20 + numW + 16, (int) (H * 0.28));

        g.setColor(new Color(255, 255, 255, 150));
        g.setFont(resolve(22, Font.PLAIN));
        String range = data.dateRangeLabel;
        g.drawString(range, cx - g.getFontMetrics().stringWidth(range) / 2, (int) (H * 0.31));
    }

    /** 统计卡片行：累计答题 / 总正确率 / 活跃天数 */
    private void drawStatCards(Graphics2D g, PosterData data) {
        int cardY = (int) (H * 0.36);
        int cardH = 130;
        int pad = Math.round(W * 0.08f);
        int gap = 16;
        int totalW = W - pad * 2;
        int cardW = (totalW - gap * 2) / 3;

        double accuracy = data.totalQuestions > 0
                ? (double) data.totalCorrect / data.totalQuestions : 0;
        String[] labels = {"累计答题", "总正确率", "活跃天数"};
        String[] values = {String.valueOf(data.totalQuestions),
                Math.round(accuracy * 100) + "%",
                String.valueOf(data.totalDays)};

        for (int i = 0; i < 3; i++) {
            int x = pad + i * (cardW + gap);
            g.setColor(new Color(255, 255, 255, 22));
            g.fillRoundRect(x, cardY, cardW, cardH, 16, 16);
            g.setColor(new Color(255, 255, 255, 40));
            g.drawRoundRect(x, cardY, cardW, cardH, 16, 16);

            g.setColor(new Color(255, 255, 255, 170));
            g.setFont(resolve(22, Font.PLAIN));
            String label = labels[i];
            g.drawString(label, x + cardW / 2 - g.getFontMetrics().stringWidth(label) / 2, cardY + 36);

            g.setColor(C_GOLD);
            g.setFont(resolve(40, Font.BOLD));
            String value = values[i];
            g.drawString(value, x + cardW / 2 - g.getFontMetrics().stringWidth(value) / 2, cardY + 96);
        }
    }

    /** 亮点区：最佳科目 / 最佳时段（按 highlight 开关展示） */
    private void drawHighlights(Graphics2D g, PosterData data) {
        int pad = Math.round(W * 0.08f);
        int y = (int) (H * 0.50);
        boolean hasSubject = data.bestSubjectName != null && !data.bestSubjectName.isBlank();
        boolean hasSection = data.bestSectionLabel != null && !data.bestSectionLabel.isBlank();
        if (!hasSubject && !hasSection) return;

        g.setColor(new Color(255, 255, 255, 170));
        g.setFont(resolve(24, Font.PLAIN));
        g.drawString("我的高光时刻", pad, y);

        int lineY = y + 28;
        if (hasSubject) {
            g.setColor(C_WHITE);
            g.setFont(resolve(28, Font.BOLD));
            g.drawString("最佳科目", pad, lineY + 34);
            g.setColor(new Color(255, 255, 255, 210));
            g.setFont(resolve(28, Font.PLAIN));
            String subject = data.bestSubjectName
                    + (data.bestSubjectAccuracy != null
                    ? "（正确率 " + Math.round(data.bestSubjectAccuracy * 100) + "%）" : "");
            g.drawString(subject, pad + 130, lineY + 34);
            lineY += 52;
        }
        if (hasSection) {
            g.setColor(C_WHITE);
            g.setFont(resolve(28, Font.BOLD));
            g.drawString("最佳时段", pad, lineY + 34);
            g.setColor(new Color(255, 255, 255, 210));
            g.setFont(resolve(28, Font.PLAIN));
            g.drawString(data.bestSectionLabel, pad + 130, lineY + 34);
        }
    }

    /** 迷你热力图：最近每日答题数横排方块 */
    private void drawMiniHeatmap(Graphics2D g, PosterData data) {
        List<Integer> counts = data.heatCounts;
        if (counts == null || counts.isEmpty()) return;

        int pad = Math.round(W * 0.08f);
        int y = (int) (H * 0.755);
        g.setColor(new Color(255, 255, 255, 170));
        g.setFont(resolve(24, Font.PLAIN));
        g.drawString("每日刷题量", pad, y);

        int max = counts.stream().mapToInt(Integer::intValue).max().orElse(0);
        int n = Math.min(counts.size(), 30);
        int cell = Math.min(18, (W - pad * 2) / Math.max(n, 1) - 4);
        int startX = pad;
        int startY = y + 20;
        for (int i = 0; i < n; i++) {
            int count = counts.get(counts.size() - n + i);
            int level = levelOf(count, max);
            g.setColor(levelColor(level));
            g.fillRoundRect(startX + i * (cell + 4), startY, cell, cell, 4, 4);
        }
    }

    /** 底部品牌区 */
    private void drawFooter(Graphics2D g, PosterData data) {
        int cx = W / 2;
        g.setColor(C_GOLD);
        g.fillOval(cx - 90, (int) (H * 0.925), 6, 6);
        g.setColor(new Color(255, 255, 255, 200));
        g.setFont(resolve(22, Font.PLAIN));
        String brand = "一句话刷题 · FlashQ";
        g.drawString(brand, cx - 70, (int) (H * 0.925) + 14);

        g.setColor(new Color(255, 255, 255, 130));
        g.setFont(resolve(18, Font.PLAIN));
        String slogan = "每天一句，进步可见";
        g.drawString(slogan, cx - g.getFontMetrics().stringWidth(slogan) / 2, (int) (H * 0.955));
    }

    // ---------------------------------------------------------------- 工具

    private static int levelOf(int count, int max) {
        if (count <= 0 || max <= 0) return 0;
        double ratio = (double) count / max;
        if (ratio < 0.25) return 1;
        if (ratio < 0.50) return 2;
        if (ratio < 0.75) return 3;
        return 4;
    }

    private static Color levelColor(int level) {
        return switch (level) {
            case 1 -> new Color(14, 68, 88);
            case 2 -> new Color(22, 96, 122);
            case 3 -> new Color(43, 120, 145);
            default -> C_GOLD;
        };
    }

    /** 中文字体按优先级选择，服务器缺字体时回退默认（部署需安装中文字体） */
    private static Font resolve(int size, int style) {
        String[] candidates = {"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", "Source Han Sans SC", "SansSerif"};
        for (String name : candidates) {
            Font font = new Font(name, style, size);
            if (!font.getFamily().equals(Font.DIALOG)) {
                return font;
            }
        }
        return new Font(Font.SANS_SERIF, style, size);
    }

    /** 等比缩放生成缩略图 */
    private static BufferedImage scale(BufferedImage src, int width) {
        int height = Math.round(src.getHeight() * ((float) width / src.getWidth()));
        BufferedImage out = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = out.createGraphics();
        try {
            g.setRenderingHint(RenderingHints.KEY_INTERPOLATION, RenderingHints.VALUE_INTERPOLATION_BILINEAR);
            g.setComposite(AlphaComposite.Src);
            g.drawImage(src, 0, 0, width, height, null);
        } finally {
            g.dispose();
        }
        return out;
    }
}
