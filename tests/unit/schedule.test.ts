import { describe, expect, it } from "vitest";
import { calcContractTerms, generateSchedule, validateTerms } from "@/lib/domain/schedule";
import { sum, toHalalas } from "@/lib/domain/money";
import { formatContractNumber, formatReceiptNumber, nextSequence } from "@/lib/domain/contractNumber";
import { renderTemplate } from "@/lib/domain/template";

describe("calcContractTerms — SPEC §7.1", () => {
  it("يحسب الممول والضريبة والإجمالي والقسط", () => {
    const t = calcContractTerms({ vehiclePrice: 100000, downPayment: 20000, months: 36 });
    expect(t.financedAmount).toBe(80000);
    expect(t.vat).toBe(12000);
    expect(t.totalPayable).toBe(92000);
    expect(t.installment).toBe(2555.56);
    expect(t.lastInstallment).toBe(2555.4);
    expect(t.contractTotal).toBe(112000);
  });

  it.each([
    [87650, 13000, 12],
    [118500, 23700, 24],
    [64999.99, 7000, 36],
    [142000, 31000, 48],
    [55500, 5550, 60],
    [99999, 1, 59],
  ])("مجموع الأقساط يساوي الإجمالي بالضبط (سعر %d، مقدم %d، %d شهر)", (price, down, months) => {
    const terms = calcContractTerms({ vehiclePrice: price, downPayment: down, months });
    const schedule = generateSchedule({ terms, firstDueDate: "2026-01-15" });
    expect(schedule).toHaveLength(months);
    expect(toHalalas(sum(schedule.map((i) => i.amount)))).toBe(toHalalas(terms.totalPayable));
    // القسط الأخير يمتص فرق التقريب (أقل من هللة لكل قسط)
    expect(Math.abs(toHalalas(terms.lastInstallment) - toHalalas(terms.installment))).toBeLessThan(months);
    schedule.slice(0, -1).forEach((i) => expect(i.amount).toBe(terms.installment));
  });

  it("القسط اليدوي: القسط الأخير يعدّل ويُظهر الفرق", () => {
    const t = calcContractTerms({ vehiclePrice: 100000, downPayment: 20000, months: 36, installmentOverride: 2600 });
    expect(t.isManual).toBe(true);
    expect(t.installment).toBe(2600);
    expect(t.lastInstallment).toBe(92000 - 2600 * 35);
    expect(t.lastInstallmentDiff).toBe(t.lastInstallment - 2600);
    const schedule = generateSchedule({ terms: t, firstDueDate: "2026-01-01" });
    expect(sum(schedule.map((i) => i.amount))).toBe(92000);
  });

  it("نسبة ضريبة مختلفة من الإعدادات", () => {
    const t = calcContractTerms({ vehiclePrice: 50000, downPayment: 10000, months: 12, vatRate: 0.1 });
    expect(t.vat).toBe(4000);
    expect(t.totalPayable).toBe(44000);
  });

  it("رسوم التوقيع تضاف للإجمالي ولا تدخل في الأقساط", () => {
    const terms = calcContractTerms({ vehiclePrice: 30000, downPayment: 0, upfrontFee: 2000, months: 24 });
    const schedule = generateSchedule({ terms, firstDueDate: "2026-11-01" });
    expect(terms.upfrontFee).toBe(2000);
    expect(terms.totalPayable).toBe(34500);
    expect(terms.contractTotal).toBe(36500);
    expect(schedule).toHaveLength(24);
    expect(sum(schedule.map((item) => item.amount))).toBe(terms.totalPayable);
  });
});

describe("generateSchedule — التواريخ", () => {
  it("شهرياً بنفس اليوم", () => {
    const terms = calcContractTerms({ vehiclePrice: 60000, downPayment: 0, months: 12 });
    const s = generateSchedule({ terms, firstDueDate: "2026-03-10" });
    expect(s.map((i) => i.dueDate).slice(0, 3)).toEqual(["2026-03-10", "2026-04-10", "2026-05-10"]);
    expect(s[11].dueDate).toBe("2027-02-10");
  });

  it("بدون تجاوز نهاية الشهر (31 يناير ← 28 فبراير)", () => {
    const terms = calcContractTerms({ vehiclePrice: 60000, downPayment: 0, months: 12 });
    const s = generateSchedule({ terms, firstDueDate: "2027-01-31" });
    expect(s[1].dueDate).toBe("2027-02-28");
    expect(s[2].dueDate).toBe("2027-03-31");
    expect(s[3].dueDate).toBe("2027-04-30");
  });
});

describe("validateTerms", () => {
  it("المقدم يجب أن يكون أقل من السعر", () => {
    expect(validateTerms({ vehiclePrice: 50000, downPayment: 50000, months: 24 })).toContain("downPaymentTooHigh");
  });
  it("المقدم لا يكون سالباً", () => {
    expect(validateTerms({ vehiclePrice: 50000, downPayment: -1, months: 24 })).toContain("downPaymentNegative");
  });
  it("يدعم مدد 12 و24 و36 شهراً ومدداً مخصصة حتى 60 شهراً", () => {
    expect(validateTerms({ vehiclePrice: 50000, downPayment: 0, months: 12 })).toEqual([]);
    expect(validateTerms({ vehiclePrice: 50000, downPayment: 0, months: 24 })).toEqual([]);
    expect(validateTerms({ vehiclePrice: 50000, downPayment: 0, months: 36 })).toEqual([]);
    expect(validateTerms({ vehiclePrice: 50000, downPayment: 0, months: 60 })).toEqual([]);
    expect(validateTerms({ vehiclePrice: 50000, downPayment: 0, months: 11 })).toContain("monthsOutOfRange");
    expect(validateTerms({ vehiclePrice: 50000, downPayment: 0, months: 61 })).toContain("monthsOutOfRange");
  });
  it("السيارة متاحة فقط", () => {
    expect(validateTerms({ vehiclePrice: 50000, downPayment: 0, months: 24, vehicleStatus: "reserved" })).toContain("vehicleNotAvailable");
  });
  it("قسط يدوي أكبر من اللازم", () => {
    expect(validateTerms({ vehiclePrice: 50000, downPayment: 0, months: 24, installmentOverride: 6000 })).toContain("installmentTooHigh");
  });
});

describe("الترقيم والقالب", () => {
  it("رقم العقد والإيصال", () => {
    expect(formatContractNumber(2026, 42)).toBe("MLK-2026-00042");
    expect(formatReceiptNumber(2026, 7)).toBe("RCPT-2026-00007");
  });
  it("التسلسل التالي", () => {
    expect(nextSequence(["MLK-2026-00041", "MLK-2026-00045", "MLK-2025-00099"], 2026, "MLK")).toBe(46);
    expect(nextSequence([], 2027, "MLK")).toBe(1);
  });
  it("استبدال المتغيرات وترك غير المعروف", () => {
    expect(renderTemplate("السيد {{customer.fullName}} — {{ vehicle.plate }} — {{x.y}}", { "customer.fullName": "فهد", "vehicle.plate": "ABC 123" })).toBe(
      "السيد فهد — ABC 123 — {{x.y}}",
    );
  });
});
