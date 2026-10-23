package com.flashq.report;

import com.flashq.common.report.MigrationConflictResolver;
import com.flashq.common.report.MigrationConflictResolver.ClientDaily;
import com.flashq.common.report.MigrationConflictResolver.Decision;
import com.flashq.entity.ReportDailySnapshot;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * MigrationConflictResolver 单元测试（规范 7.2）
 * 覆盖：四种冲突矩阵（规范 5.2.3）全部场景
 */
class MigrationConflictResolverTest {

    private final ClientDaily client = new ClientDaily(LocalDate.of(2026, 10, 16), 20);

    @Test
    void 服务端无记录客户端有记录_直接插入() {
        assertEquals(Decision.INSERT,
                MigrationConflictResolver.decide(null, client));
    }

    @Test
    void 服务端有记录客户端无记录_不动() {
        ReportDailySnapshot server = new ReportDailySnapshot();
        server.setTotal(30);
        assertEquals(Decision.SKIP,
                MigrationConflictResolver.decide(server, null));
    }

    @Test
    void 双方都有同日数据_取较大值合并() {
        ReportDailySnapshot server = new ReportDailySnapshot();
        server.setTotal(15);
        assertEquals(Decision.MERGE_MAX,
                MigrationConflictResolver.decide(server, client));
    }

    @Test
    void 客户端日期晚于服务端_拒绝迁移() {
        assertTrue(MigrationConflictResolver.shouldRejectMigration(
                LocalDate.of(2026, 10, 18), LocalDate.of(2026, 10, 16)));
    }

    @Test
    void 客户端日期不晚于服务端_允许迁移() {
        assertFalse(MigrationConflictResolver.shouldRejectMigration(
                LocalDate.of(2026, 10, 16), LocalDate.of(2026, 10, 18)));
        assertFalse(MigrationConflictResolver.shouldRejectMigration(
                LocalDate.of(2026, 10, 18), LocalDate.of(2026, 10, 18)));
    }

    @Test
    void 服务端无任何数据_不拒绝() {
        assertFalse(MigrationConflictResolver.shouldRejectMigration(
                LocalDate.of(2026, 10, 18), null));
    }

    @Test
    void 客户端无数据_不拒绝() {
        assertFalse(MigrationConflictResolver.shouldRejectMigration(
                null, LocalDate.of(2026, 10, 18)));
    }
}
