import { describe, expect, it } from "vitest";
import { allocatePayment, applyPayment, deriveInstallmentStatus, reversePayment } from "@/lib/domain/allocation";
import { getContractBalances } from "@/lib/domain/balances";
import { TODAY, basePayment, makeContract } from "./helpers";

// 12 قسطاً: 80000 × 1.15 = 92000 ÷ 12 = 7666.67 (الأخير 7666.63)
const INST = 7666.67;

describe("allocatePayment — SPEC §7.2", () => {
  it("دفعة كاملة تسدد القسط الأقدم", () => {
    const c = makeContract();
    const r = allocatePayment(c.installments, INST);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.allocations).toEqual([{ installmentId: "t-1", amount: INST }]);
  });

  it("دفعة جزئية تجعل القسط partial", () => {
    const c = makeContract();
    const res = applyPayment(c, basePayment("p1", 3000), TODAY);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.contract.installments[0].paidAmount).toBe(3000);
    expect(res.contract.installments[0].status).toBe("partial");
    expect(res.contract.installments[1].paidAmount).toBe(0);
  });

  it("دفعة تغطي أكثر من قسط — الأقدم أولاً", () => {
    const c = makeContract();
    const res = applyPayment(c, basePayment("p1", 20000), TODAY);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [a, b, d] = res.contract.installments;
    expect(a.status).toBe("paid");
    expect(b.status).toBe("paid");
    expect(d.paidAmount).toBe(20000 - INST * 2);
    expect(d.status).toBe("partial");
    expect(res.payment.allocations.map((x) => x.installmentId)).toEqual(["t-1", "t-2", "t-3"]);
  });

  it("يكمل القسط الجزئي قبل التالي", () => {
    const c = makeContract();
    const first = applyPayment(c, basePayment("p1", 1000), TODAY);
    if (!first.ok) throw new Error();
    const second = applyPayment(first.contract, basePayment("p2", INST), TODAY);
    if (!second.ok) throw new Error();
    expect(second.payment.allocations).toEqual([
      { installmentId: "t-1", amount: INST - 1000 },
      { installmentId: "t-2", amount: 1000 },
    ]);
  });

  it("رفض دفعة أكبر من المتبقي", () => {
    const c = makeContract();
    const r = allocatePayment(c.installments, 92000.01);
    expect(r).toEqual({ ok: false, error: "exceedsRemaining", maxAllowed: 92000 });
    const res = applyPayment(c, basePayment("p1", 100000), TODAY);
    expect(res.ok).toBe(false);
  });

  it("رفض مبلغ صفر أو سالب", () => {
    const c = makeContract();
    expect(allocatePayment(c.installments, 0).ok).toBe(false);
    expect(allocatePayment(c.installments, -5).ok).toBe(false);
  });

  it("سداد كامل المتبقي يجعل العقد paid_off", () => {
    const c = makeContract();
    const res = applyPayment(c, basePayment("p1", 92000), TODAY);
    if (!res.ok) throw new Error();
    expect(res.contract.status).toBe("paid_off");
    expect(getContractBalances(res.contract, TODAY).remaining).toBe(0);
    expect(getContractBalances(res.contract, TODAY).progress).toBe(1);
  });

  it("رسوم التوقيع تُحصّل منفصلة ولا تُسدد الأقساط", () => {
    const c = makeContract({ upfrontFee: 2000 });
    const before = getContractBalances(c, TODAY);
    expect(before.contractTotal).toBe(114000);
    expect(before.remaining).toBe(94000);

    const paid = applyPayment(c, { ...basePayment("fee", 2000), type: "contract_fee" }, TODAY);
    if (!paid.ok) throw new Error();
    expect(paid.payment.allocations).toEqual([]);
    expect(getContractBalances(paid.contract, TODAY).upfrontFeePaid).toBe(2000);
    expect(getContractBalances(paid.contract, TODAY).remaining).toBe(92000);
    expect(paid.contract.status).toBe("active");

    const installmentsPaid = applyPayment(paid.contract, basePayment("installments", 92000), TODAY);
    if (!installmentsPaid.ok) throw new Error();
    expect(installmentsPaid.contract.status).toBe("paid_off");
    expect(getContractBalances(installmentsPaid.contract, TODAY).remaining).toBe(0);
  });

  it("لا يقبل تحصيلاً يتجاوز المتبقي من رسوم التوقيع", () => {
    const c = makeContract({ upfrontFee: 2000 });
    const first = applyPayment(c, { ...basePayment("fee-1", 1500), type: "contract_fee" }, TODAY);
    if (!first.ok) throw new Error();
    expect(applyPayment(first.contract, { ...basePayment("fee-2", 501), type: "contract_fee" }, TODAY)).toEqual({
      ok: false,
      error: "exceedsRemaining",
      maxAllowed: 500,
    });
  });
});

describe("reversePayment", () => {
  it("عكس دفعة يعيد الأرصدة كما كانت والدفعة تبقى مشطوبة", () => {
    const c = makeContract();
    const before = getContractBalances(c, TODAY);
    const paid = applyPayment(c, basePayment("p1", 20000), TODAY);
    if (!paid.ok) throw new Error();
    expect(getContractBalances(paid.contract, TODAY).paid).toBe(20000);

    const rev = reversePayment(paid.contract, "p1", "u-admin", "دفعة مكررة", `${TODAY}T12:00:00`, TODAY);
    expect(rev.ok).toBe(true);
    if (!rev.ok) return;
    const after = getContractBalances(rev.contract, TODAY);
    expect(after.paid).toBe(before.paid);
    expect(after.remaining).toBe(before.remaining);
    expect(rev.contract.payments).toHaveLength(1);
    expect(rev.contract.payments[0].reversed?.reason).toBe("دفعة مكررة");
    expect(rev.contract.installments.every((i) => i.paidAmount === 0)).toBe(true);
  });

  it("السبب إجباري", () => {
    const c = makeContract();
    const paid = applyPayment(c, basePayment("p1", 1000), TODAY);
    if (!paid.ok) throw new Error();
    expect(reversePayment(paid.contract, "p1", "u-admin", "  ", TODAY, TODAY)).toEqual({ ok: false, error: "reasonRequired" });
  });

  it("عكس آخر دفعة على عقد مسدد يعيده نشطاً", () => {
    const c = makeContract();
    const paid = applyPayment(c, basePayment("p1", 92000), TODAY);
    if (!paid.ok) throw new Error();
    const rev = reversePayment(paid.contract, "p1", "u-admin", "خطأ", TODAY, TODAY);
    if (!rev.ok) throw new Error();
    expect(rev.contract.status).toBe("active");
  });

  it("عكس رسوم التوقيع يعيد المبلغ إلى الرصيد المستحق", () => {
    const c = makeContract({ upfrontFee: 2000 });
    const paid = applyPayment(c, { ...basePayment("fee", 2000), type: "contract_fee" }, TODAY);
    if (!paid.ok) throw new Error();
    const reversed = reversePayment(paid.contract, "fee", "u-admin", "تحصيل خاطئ", TODAY, TODAY);
    if (!reversed.ok) throw new Error();
    expect(getContractBalances(reversed.contract, TODAY).upfrontFeePaid).toBe(0);
    expect(getContractBalances(reversed.contract, TODAY).remaining).toBe(94000);
  });
});

describe("حالات الأقساط والأرصدة", () => {
  it("اشتقاق الحالة من التاريخ", () => {
    const i = { amount: 100, paidAmount: 0 };
    expect(deriveInstallmentStatus({ ...i, dueDate: "2026-10-25" }, TODAY)).toBe("overdue");
    expect(deriveInstallmentStatus({ ...i, dueDate: "2026-10-26" }, TODAY)).toBe("due");
    expect(deriveInstallmentStatus({ ...i, dueDate: "2026-10-29" }, TODAY)).toBe("due");
    expect(deriveInstallmentStatus({ ...i, dueDate: "2026-10-30" }, TODAY)).toBe("upcoming");
    expect(deriveInstallmentStatus({ ...i, paidAmount: 100, dueDate: "2026-09-01" }, TODAY)).toBe("paid");
    expect(deriveInstallmentStatus({ ...i, paidAmount: 50, dueDate: "2026-11-20" }, TODAY)).toBe("partial");
    expect(deriveInstallmentStatus({ ...i, paidAmount: 50, dueDate: "2026-10-01" }, TODAY)).toBe("overdue");
  });

  it("المتأخر وأيام التأخير والقسط القادم", () => {
    const c = makeContract({ firstDueDate: "2026-09-10" }); // 10 سبتمبر و10 أكتوبر متأخران
    const b = getContractBalances(c, TODAY);
    expect(c.status).toBe("overdue");
    expect(b.overdueCount).toBe(2);
    expect(b.overdueAmount).toBe(INST * 2);
    expect(b.daysOverdue).toBe(46);
    expect(b.nextInstallment?.dueDate).toBe("2026-11-10");
    expect(b.daysToNext).toBe(15);
    expect(b.totalPayable).toBe(92000);
    expect(b.contractTotal).toBe(112000);
  });
});
