package com.flashq.common.report;

import com.flashq.entity.ReportDailySnapshot;

import java.time.LocalDate;

/**
 * 学习报告-客户端数据迁移冲突裁决（规范 5.2.3）
 * <p>
 * 冲突矩阵：
 * <ul>
 *   <li>服务端无记录 + 客户端有记录 → INSERT（source = migrate）；</li>
 *   <li>服务端有记录 + 客户端无记录 → SKIP（不动）；</li>
 *   <li>双方都有同日数据 → MERGE_MAX（count 取较大值，sections 合并取并集）；</li>
 *   <li>客户端最大日期 &gt; 服务端最大日期 → REJECT（对应错误码 10422，
 *       提示用户先完成服务端数据更新，next_migrate_required = true）。</li>
 * </ul>
 */
public final class MigrationConflictResolver {

    private MigrationConflictResolver() {
    }

    public enum Decision {
        INSERT,    // 服务端无记录，直接插入
        MERGE_MAX, // 双方都有，取较大值合并
        SKIP       // 服务端已有、客户端无，不动
    }

    /** 客户端单日数据 */
    public static class ClientDaily {
        public final LocalDate date;
        public final int count;

        public ClientDaily(LocalDate date, int count) {
            this.date = date;
            this.count = count;
        }
    }

    /** 单日记录的合并裁决 */
    public static Decision decide(ReportDailySnapshot serverRow, ClientDaily client) {
        if (serverRow == null) return Decision.INSERT;
        if (client == null) return Decision.SKIP;
        return Decision.MERGE_MAX;
    }

    /**
     * 是否应整体拒绝本次迁移（规范 5.2.3 第四条）
     *
     * @param clientMaxDate 客户端数据的最大日期
     * @param serverMaxDate 服务端已有数据的最大日期（服务端无数据时为 null）
     */
    public static boolean shouldRejectMigration(LocalDate clientMaxDate, LocalDate serverMaxDate) {
        return serverMaxDate != null
                && clientMaxDate != null
                && clientMaxDate.isAfter(serverMaxDate);
    }
}
