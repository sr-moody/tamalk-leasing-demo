import { describe, expect, it } from "vitest";
import type { Role } from "@/types/domain";
import { ACTIONS, can, canAccessRoute, fabForRole, mobileNavForRole, navForRole, type Action } from "@/lib/permissions";

const ROLES: Role[] = ["admin", "sales", "accountant", "procurement", "customer"];

/** المصفوفة المتوقعة من SPEC §2.2 — ترتيب الأعمدة: أدمن، مبيعات، حسابات، مشتريات، عميل */
const EXPECTED: Record<Action, [boolean, boolean, boolean, boolean, boolean]> = {
  "dashboard.view": [true, true, true, true, false],
  "vehicles.view": [true, true, true, true, false],
  "vehicles.viewAll": [true, false, true, true, false],
  "vehicles.manage": [true, false, false, true, false],
  "vehicles.expenses.view": [true, false, true, true, false],
  "vehicles.expenses.manage": [true, false, false, true, false],
  "vehicles.viewCost": [true, false, true, true, false],
  "customers.view": [true, true, true, false, false],
  "customers.create": [true, true, false, false, false],
  "contracts.view": [true, true, true, false, false],
  "contracts.create": [true, true, false, false, false],
  "contracts.approve": [true, false, false, false, false],
  "contracts.viewProfit": [true, false, false, false, false],
  "contracts.handover": [true, true, false, false, false],
  "contracts.receiveReturn": [true, true, false, true, false],
  "contracts.registerOwnership": [true, false, false, false, false],
  "payments.view": [true, false, true, false, false],
  "payments.record": [true, false, true, false, false],
  "payments.reverse": [true, false, false, false, false],
  "collections.view": [true, true, true, false, false],
  "collections.manage": [true, false, true, false, false],
  "notifications.view": [true, true, true, true, true],
  "reports.view": [true, true, true, true, false],
  "reports.sales": [true, true, false, false, false],
  "reports.financial": [true, false, true, false, false],
  "reports.fleet": [true, false, false, true, false],
  "settings.manage": [true, false, false, false, false],
  "users.manage": [true, false, false, false, false],
  "audit.view": [true, false, false, false, false],
  "portal.access": [false, false, false, false, true],
};

describe("can(role, action) — المصفوفة كاملة", () => {
  it("كل إجراء مغطى في الاختبار", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ACTIONS].sort());
  });

  for (const action of ACTIONS) {
    ROLES.forEach((role, i) => {
      it(`${role} × ${action} = ${EXPECTED[action][i]}`, () => {
        expect(can(role, action)).toBe(EXPECTED[action][i]);
      });
    });
  }

  it("بدون دور = لا صلاحية", () => {
    expect(can(null, "dashboard.view")).toBe(false);
    expect(can(undefined, "notifications.view")).toBe(false);
  });
});

describe("حماية المسارات", () => {
  it("المبيعات لا تصل للإعدادات ولا المدفوعات", () => {
    expect(canAccessRoute("sales", "/settings")).toBe(false);
    expect(canAccessRoute("sales", "/settings/users")).toBe(false);
    expect(canAccessRoute("sales", "/payments")).toBe(false);
    expect(canAccessRoute("sales", "/contracts/new")).toBe(true);
  });
  it("الحسابات لا تنشئ عقوداً لكن ترى العقود", () => {
    expect(canAccessRoute("accountant", "/contracts")).toBe(true);
    expect(canAccessRoute("accountant", "/contracts/k-001")).toBe(true);
    expect(canAccessRoute("accountant", "/contracts/new")).toBe(false);
  });
  it("إنشاء العميل متاح للمبيعات والأدمن فقط", () => {
    expect(canAccessRoute("admin", "/customers/new")).toBe(true);
    expect(canAccessRoute("sales", "/customers/new")).toBe(true);
    expect(canAccessRoute("accountant", "/customers/new")).toBe(false);
    expect(canAccessRoute("procurement", "/customers/new")).toBe(false);
  });
  it("إضافة سيارة للأسطول متاحة للأدمن والمشتريات فقط", () => {
    expect(canAccessRoute("admin", "/vehicles/new")).toBe(true);
    expect(canAccessRoute("procurement", "/vehicles/new")).toBe(true);
    expect(canAccessRoute("sales", "/vehicles/new")).toBe(false);
    expect(canAccessRoute("accountant", "/vehicles/new")).toBe(false);
  });
  it("مركز الحسابات للإدارة فقط", () => {
    expect(canAccessRoute("admin", "/accounts")).toBe(true);
    expect(canAccessRoute("sales", "/accounts")).toBe(false);
    expect(canAccessRoute("customer", "/accounts")).toBe(false);
  });
  it("حساب الموظف متاح للأدوار الداخلية فقط", () => {
    for (const role of ["admin", "sales", "accountant", "procurement"] as const) {
      expect(canAccessRoute(role, "/account")).toBe(true);
    }
    expect(canAccessRoute("customer", "/account")).toBe(false);
  });
  it("المشتريات لا ترى العملاء", () => {
    expect(canAccessRoute("procurement", "/customers")).toBe(false);
    expect(canAccessRoute("procurement", "/vehicles/v-001")).toBe(true);
  });
  it("العميل في البوابة فقط", () => {
    expect(canAccessRoute("customer", "/portal")).toBe(true);
    expect(canAccessRoute("customer", "/portal/installments")).toBe(true);
    expect(canAccessRoute("customer", "/dashboard")).toBe(false);
    expect(canAccessRoute("admin", "/portal")).toBe(false);
  });
  it("صفحة الدخول عامة", () => {
    expect(canAccessRoute(null, "/login")).toBe(true);
    expect(canAccessRoute(null, "/dashboard")).toBe(false);
  });
});

describe("التنقل حسب الدور", () => {
  it("القائمة الجانبية تقرأ من can", () => {
    expect(navForRole("sales").map((n) => n.key)).not.toContain("settings");
    expect(navForRole("admin").map((n) => n.key)).toContain("settings");
    expect(navForRole("procurement").map((n) => n.key)).toEqual(["dashboard", "vehicles", "notifications", "reports"]);
  });
  it("Bottom Nav لا يتجاوز 4 عناصر + المزيد", () => {
    for (const r of ["admin", "sales", "accountant", "procurement"] as const) expect(mobileNavForRole(r).length).toBeLessThanOrEqual(4);
  });
  it("FAB حسب الدور", () => {
    expect(fabForRole("sales")).toBe("newContract");
    expect(fabForRole("accountant")).toBe("recordPayment");
    expect(fabForRole("procurement")).toBe("addVehicle");
    expect(fabForRole("customer")).toBeNull();
  });
});
