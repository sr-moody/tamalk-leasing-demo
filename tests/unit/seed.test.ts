import { describe, expect, it } from "vitest";
import { generateSeed, DEMO_CUSTOMER_PHONE } from "@/mocks/data/seed";
import { computeAlerts, overdueBucket } from "@/lib/domain/alerts";
import { getContractBalances } from "@/lib/domain/balances";
import { daysBetween } from "@/lib/domain/dates";
import { sum, toHalalas } from "@/lib/domain/money";
import { appConfig } from "@/lib/config";

// نختبر على عدة أيام (منها نهايات أشهر) لضمان أن الديمو «حي» دائماً
const DAYS = ["2026-10-26", "2026-01-31", "2026-02-28", "2027-03-30", "2026-12-31"];

describe.each(DAYS)("البيانات الوهمية ليوم %s — SPEC §6.1", (today) => {
  const db = generateSeed(today);
  const count = (s: string) => db.contracts.filter((c) => c.status === s).length;

  it("الأعداد", () => {
    expect(db.customers).toHaveLength(60);
    expect(db.contracts).toHaveLength(45);
    expect(db.users).toHaveLength(6);
    expect(db.vehicles.length).toBeGreaterThanOrEqual(40);
    expect(count("active")).toBe(30);
    expect(count("overdue")).toBe(6);
    expect(count("paid_off") + count("owned")).toBe(4);
    expect(count("pending_approval")).toBe(3);
    expect(count("terminated")).toBe(2);
    expect(db.users.find((user) => user.id === "u-admin")?.name).toBe("أ عبدالعزيز");
    expect(db.users.find((user) => user.id === "u-admin")?.email).toBe("admin@tamalk.sa");
    expect(db.users.every((user) => user.email.endsWith("@tamalk.sa"))).toBe(true);
  });

  it("ثابت: نفس اليوم ← نفس البيانات", () => {
    expect(JSON.stringify(generateSeed(today))).toBe(JSON.stringify(db));
  });

  it("سيارة واحدة لكل عقد قائم", () => {
    const live = db.contracts.filter((c) => !["terminated"].includes(c.status));
    expect(new Set(live.map((c) => c.vehicleId)).size).toBe(live.length);
  });

  it("أسعار الأسطول بين 20 و40 ألف ريال وصور الموديلات محلية", () => {
    expect(db.vehicles.every((vehicle) =>
      vehicle.listPrice >= appConfig.vehiclePriceRange.min
      && vehicle.listPrice <= appConfig.vehiclePriceRange.max
      && vehicle.images.some((image) => image.startsWith("/vehicles/") && image.endsWith(".jpg")),
    )).toBe(true);
  });

  it("العقود التجريبية مدتها 24 شهراً ورسوم توقيعها 2000 ريال", () => {
    expect(db.contracts.every((contract) =>
      contract.months === appConfig.defaultMonths && contract.upfrontFee === appConfig.contractUpfrontFee,
    )).toBe(true);
  });

  it("3 عقود تنتهي خلال 3 أيام", () => {
    const ending = db.contracts.filter((c) => ["active", "overdue"].includes(c.status) && daysBetween(today, c.endDate) >= 0 && daysBetween(today, c.endDate) <= 3);
    expect(ending).toHaveLength(3);
  });

  it("8 أقساط مستحقة خلال 3 أيام و5 مستحقة اليوم", () => {
    const open = db.contracts.filter((c) => ["active", "overdue"].includes(c.status)).flatMap((c) => c.installments.filter((i) => i.status !== "paid"));
    const soon = open.filter((i) => daysBetween(today, i.dueDate) >= 1 && daysBetween(today, i.dueDate) <= 3);
    const todayDue = open.filter((i) => i.dueDate === today);
    expect(soon).toHaveLength(8);
    expect(todayDue).toHaveLength(5);
  });

  it("متأخرات في الفئات الثلاث", () => {
    const buckets = db.contracts
      .filter((c) => c.status === "overdue")
      .map((c) => overdueBucket(getContractBalances(c, today).daysOverdue));
    expect(new Set(buckets)).toEqual(new Set(["b1_7", "b8_30", "b30_plus"]));
  });

  it("العميل التجريبي: 60% مسدد، قسط بعد يومين، وثيقة تنتهي قريباً", () => {
    const demo = db.customers.find((c) => c.phone === DEMO_CUSTOMER_PHONE);
    expect(demo).toBeDefined();
    const contract = db.contracts.find((c) => c.customerId === demo?.id && c.status === "active");
    expect(contract).toBeDefined();
    if (!contract || !demo) return;
    const b = getContractBalances(contract, today);
    expect(Math.round(b.progress * 100)).toBe(60);
    expect(b.daysToNext).toBe(2);
    expect(demo.documents.some((d) => d.expiresAt && daysBetween(today, d.expiresAt) >= 0 && daysBetween(today, d.expiresAt) <= 30)).toBe(true);
  });

  it("سلامة مالية: مجموع الأقساط = المستحق، والمدفوع = مجموع التوزيعات", () => {
    for (const c of db.contracts) {
      const b = getContractBalances(c, today);
      expect(toHalalas(b.totalPayable)).toBe(toHalalas(b.financedAmount + b.vat));
      const allocated = sum(c.payments.filter((p) => !p.reversed).flatMap((p) => p.allocations.map((a) => a.amount)));
      expect(toHalalas(allocated)).toBe(toHalalas(b.paid));
      for (const p of c.payments) expect(p.paidAt.slice(0, 10) <= today).toBe(true);
    }
  });

  it("الأرقام فريدة", () => {
    expect(new Set(db.contracts.map((c) => c.number)).size).toBe(45);
    const receipts = db.contracts.flatMap((c) => c.payments.map((p) => p.receiptNo));
    expect(new Set(receipts).size).toBe(receipts.length);
    expect(new Set(db.customers.map((c) => c.nationalId)).size).toBe(60);
    expect(db.customers.every((c) => /^[12]\d{9}$/.test(c.nationalId))).toBe(true);
    expect(db.customers.every((c) => /^\+9665\d{8}$/.test(c.phone))).toBe(true);
  });

  it("التنبيهات تظهر فعلياً", () => {
    const alerts = computeAlerts({ contracts: db.contracts, customers: db.customers, vehicles: db.vehicles, settings: db.settings.alerts, today });
    const rules = new Set(alerts.map((a) => a.rule));
    for (const r of ["INSTALLMENT_DUE_SOON", "INSTALLMENT_DUE_TODAY", "INSTALLMENT_OVERDUE", "CONTRACT_ENDING_SOON", "DOCUMENT_EXPIRING", "CONTRACT_PENDING_APPROVAL", "VEHICLE_READY"])
      expect(rules.has(r as never)).toBe(true);
  });
});
