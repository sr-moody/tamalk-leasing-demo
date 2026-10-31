import { describe, expect, it } from "vitest";
import { formatDate, formatHijri, formatMoney, formatPhone, maskNationalId, normalizePhone, whatsappLink } from "@/lib/format";

describe("lib/format", () => {
  it("المبالغ: 12,450.00 ر.س", () => {
    expect(formatMoney(12450)).toBe("12,450.00 ر.س");
    expect(formatMoney(0.5)).toBe("0.50 ر.س");
  });
  it("التاريخ: 26 أكتوبر 2026", () => {
    expect(formatDate("2026-10-26")).toBe("26 أكتوبر 2026");
  });
  it("الهجري", () => {
    expect(formatHijri("2026-10-26")).toContain("1448");
  });
  it("الجوال: +966 5X XXX XXXX", () => {
    expect(formatPhone("+966551234567")).toBe("+966 55 123 4567");
    expect(formatPhone("0551234567")).toBe("+966 55 123 4567");
    expect(normalizePhone("055 123 4567")).toBe("+966551234567");
    expect(whatsappLink("0551234567")).toBe("https://wa.me/966551234567");
  });
  it("الهوية مقنّعة: 1•••••••45", () => {
    expect(maskNationalId("1012345645")).toBe("1•••••••45");
  });
});
