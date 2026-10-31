import { describe, expect, it } from "vitest";
import { appConfig } from "@/lib/config";
import { formatAuditDateTime, pruneAudit } from "@/lib/audit";
import { formatTime } from "@/lib/format";
import { auditActionLabel } from "@/lib/audit-labels";
import type { AuditEntry } from "@/types/domain";

const makeEntry = (index: number, at: string): AuditEntry => ({
  id: `audit-${index}`,
  at,
  userId: "u-admin",
  action: "user.updated",
  entity: "user",
  entityId: `u-${index}`,
});

describe("audit retention and timestamps", () => {
  it("keeps only valid entries inside the retention window and caps the newest events", () => {
    const now = Date.parse("2026-10-27T12:00:00.000Z");
    const stale = makeEntry(1, new Date(now - (appConfig.auditRetentionDays + 1) * 86_400_000).toISOString());
    const recent = Array.from({ length: appConfig.auditMaxEntries + 1 }, (_, index) =>
      makeEntry(index + 2, new Date(now - index * 1000).toISOString()),
    );
    const result = pruneAudit([stale, ...recent], now);

    expect(result).toHaveLength(appConfig.auditMaxEntries);
    expect(result[0].id).toBe("audit-2");
    expect(result.some((entry) => entry.id === stale.id)).toBe(false);
    expect(result.every((entry) => Date.parse(entry.at) >= now - appConfig.auditRetentionDays * 86_400_000)).toBe(true);
  });

  it("formats event timestamps with an Arabic date and abbreviated 12-hour period", () => {
    const formatted = formatAuditDateTime(new Date(2026, 9, 27, 9, 5, 42).toISOString());

    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    expect(formatted).toContain("ص");
    expect(formatted).toContain("أكتوبر");
    expect(formatted).not.toContain(" · ");
  });

  it("formats time-only values with ص and م", () => {
    expect(formatTime(new Date(2026, 9, 27, 9, 5))).toBe("9:05 ص");
    expect(formatTime(new Date(2026, 9, 27, 21, 5))).toBe("9:05 م");
  });

  it("translates all seeded audit action codes", () => {
    expect(auditActionLabel("contract.created")).toBe("إنشاء عقد");
    expect(auditActionLabel("contract.handover")).toBe("تسليم العقد");
    expect(auditActionLabel("contract.owned")).toBe("تمليك السيارة");
    expect(auditActionLabel("contract.terminated")).toBe("إنهاء العقد");
    expect(auditActionLabel("settings.alerts")).toBe("تحديث إعدادات التنبيهات");
    expect(auditActionLabel("vehicle.ready")).toBe("إتاحة سيارة");
    expect(auditActionLabel("user.review_requested")).toBe("إرسال حساب موظف للمراجعة");
    expect(auditActionLabel("customer.review_requested")).toBe("إرسال حساب عميل للمراجعة");
    expect(auditActionLabel("unknown.action")).toBe("عملية مسجلة");
  });
});
