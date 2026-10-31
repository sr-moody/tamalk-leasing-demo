import { describe, expect, it } from "vitest";
import type { Customer, Vehicle } from "@/types/domain";
import { alertsForViewer, computeAlerts, DEFAULT_ALERT_SETTINGS, overdueBucket } from "@/lib/domain/alerts";
import { addDaysISO, addMonthsISO } from "@/lib/domain/dates";
import { TODAY, makeContract } from "./helpers";

const customer: Customer = {
  id: "c-1",
  fullName: "فهد سعد القحطاني",
  nationalId: "1012345678",
  idType: "citizen",
  phone: "+966551112222",
  city: "الرياض",
  riskLevel: "low",
  documents: [],
  communications: [],
  createdAt: "2026-01-01T10:00:00",
};

const vehicle = { id: "v-1", make: "تويوتا", model: "كامري", year: 2026, plateEn: "ABC 1234", listPrice: 100000, status: "contracted", statusHistory: [] } as unknown as Vehicle;

const run = (contracts: ReturnType<typeof makeContract>[], customers: Customer[] = [customer], vehicles: Vehicle[] = [vehicle], settings = DEFAULT_ALERT_SETTINGS) =>
  computeAlerts({ contracts, customers, vehicles, settings, today: TODAY });

describe("قواعد التنبيه — SPEC §7.4", () => {
  it("قسط بعد 3 أيام يُنتج INSTALLMENT_DUE_SOON", () => {
    const c = makeContract({ firstDueDate: addDaysISO(TODAY, 3) });
    const alerts = run([c]);
    const soon = alerts.filter((a) => a.rule === "INSTALLMENT_DUE_SOON");
    expect(soon).toHaveLength(1);
    expect(soon[0].severity).toBe("info");
    expect(soon[0].audience).toEqual(["accountant", "admin", "customer"]);
  });

  it("قسط بعد 4 أيام لا يُنتج تنبيهاً", () => {
    const c = makeContract({ firstDueDate: addDaysISO(TODAY, 4) });
    expect(run([c]).filter((a) => a.rule.startsWith("INSTALLMENT"))).toHaveLength(0);
  });

  it("تعديل عدد الأيام من الإعدادات", () => {
    const c = makeContract({ firstDueDate: addDaysISO(TODAY, 5) });
    const settings = { ...DEFAULT_ALERT_SETTINGS, INSTALLMENT_DUE_SOON: { enabled: true, days: 5 } };
    expect(run([c], [customer], [vehicle], settings).some((a) => a.rule === "INSTALLMENT_DUE_SOON")).toBe(true);
    const off = { ...DEFAULT_ALERT_SETTINGS, INSTALLMENT_DUE_SOON: { enabled: false, days: 5 } };
    expect(run([c], [customer], [vehicle], off).some((a) => a.rule === "INSTALLMENT_DUE_SOON")).toBe(false);
  });

  it("قسط اليوم يُنتج INSTALLMENT_DUE_TODAY بشدة warning", () => {
    const c = makeContract({ firstDueDate: TODAY });
    const today = run([c]).filter((a) => a.rule === "INSTALLMENT_DUE_TODAY");
    expect(today).toHaveLength(1);
    expect(today[0].severity).toBe("warning");
  });

  it("عقد ينتهي بعد يومين يُنتج CONTRACT_ENDING_SOON", () => {
    // 12 قسطاً، آخرها بعد يومين
    const first = addMonthsISO(addDaysISO(TODAY, 2), -11);
    const c = makeContract({ firstDueDate: first });
    expect(c.endDate).toBe(addDaysISO(TODAY, 2));
    const ending = run([c]).filter((a) => a.rule === "CONTRACT_ENDING_SOON");
    expect(ending).toHaveLength(1);
    expect(ending[0].audience).toEqual(["admin", "sales", "accountant", "customer"]);
  });

  it("المتأخرات: إشعار واحد للعقد بشدة critical", () => {
    const c = makeContract({ firstDueDate: "2026-09-10" });
    const overdue = run([c]).filter((a) => a.rule === "INSTALLMENT_OVERDUE");
    expect(overdue).toHaveLength(1);
    expect(overdue[0].severity).toBe("critical");
  });

  it("فئات المتأخرات 1–7 / 8–30 / +30", () => {
    expect(overdueBucket(0)).toBeNull();
    expect(overdueBucket(1)).toBe("b1_7");
    expect(overdueBucket(7)).toBe("b1_7");
    expect(overdueBucket(8)).toBe("b8_30");
    expect(overdueBucket(30)).toBe("b8_30");
    expect(overdueBucket(31)).toBe("b30_plus");
    expect(overdueBucket(120)).toBe("b30_plus");
  });

  it("وثيقة تنتهي خلال 30 يوماً", () => {
    const withDoc: Customer = {
      ...customer,
      documents: [
        { id: "d1", type: "license", expiresAt: addDaysISO(TODAY, 30), uploadedAt: TODAY },
        { id: "d2", type: "national_id", expiresAt: addDaysISO(TODAY, 31), uploadedAt: TODAY },
        { id: "d3", type: "national_id", expiresAt: addDaysISO(TODAY, -1), uploadedAt: TODAY },
      ],
    };
    const docs = run([], [withDoc]).filter((a) => a.rule === "DOCUMENT_EXPIRING");
    expect(docs.map((d) => d.id)).toEqual(["DOCUMENT_EXPIRING:c-1:d1"]);
  });

  it("عقد بانتظار الاعتماد للأدمن فقط", () => {
    const c = makeContract({ status: "pending_approval", firstDueDate: "2026-12-01" });
    const alerts = run([c]);
    expect(alerts.map((a) => a.rule)).toEqual(["CONTRACT_PENDING_APPROVAL"]);
    expect(alertsForViewer(alerts, "admin")).toHaveLength(1);
    expect(alertsForViewer(alerts, "sales")).toHaveLength(0);
  });

  it("سيارة أصبحت متاحة للمبيعات", () => {
    const ready = { ...vehicle, status: "available", statusHistory: [{ status: "available", at: `${addDaysISO(TODAY, -2)}T10:00:00`, by: "u-proc" }] } as Vehicle;
    const alerts = run([], [customer], [ready]);
    expect(alerts.map((a) => a.rule)).toEqual(["VEHICLE_READY"]);
    expect(alerts[0].audience).toEqual(["sales"]);
  });

  it("العميل يرى إشعاراته فقط", () => {
    const mine = makeContract({ firstDueDate: TODAY });
    const other = makeContract({ id: "k-2", customerId: "c-2", firstDueDate: TODAY, installments: mine.installments.map((i) => ({ ...i, id: `o${i.id}` })) });
    const alerts = run([mine, other], [customer, { ...customer, id: "c-2" }]);
    expect(alertsForViewer(alerts, "customer", "c-1").every((a) => a.customerId === "c-1")).toBe(true);
    expect(alertsForViewer(alerts, "customer", "c-1")).toHaveLength(1);
    expect(alertsForViewer(alerts, "procurement")).toHaveLength(0);
  });

  it("العقود المسددة والمفسوخة لا تُنتج تنبيهات أقساط", () => {
    const c = makeContract({ firstDueDate: TODAY, status: "terminated" });
    expect(run([c]).filter((a) => a.rule.startsWith("INSTALLMENT"))).toHaveLength(0);
  });
});
