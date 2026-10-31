import type { Role, StaffRole } from "@/types/domain";
import type { TKey } from "@/lib/i18n";

/** كل الإجراءات في النظام — SPEC §2.2 */
export type Action =
  | "dashboard.view"
  | "vehicles.view"
  | "vehicles.viewAll"
  | "vehicles.manage"
  | "vehicles.expenses.view"
  | "vehicles.expenses.manage"
  | "vehicles.viewCost"
  | "customers.view"
  | "customers.create"
  | "contracts.view"
  | "contracts.create"
  | "contracts.approve"
  | "contracts.viewProfit"
  | "contracts.handover"
  | "contracts.receiveReturn"
  | "contracts.registerOwnership"
  | "payments.view"
  | "payments.record"
  | "payments.reverse"
  | "collections.view"
  | "collections.manage"
  | "notifications.view"
  | "reports.view"
  | "reports.sales"
  | "reports.financial"
  | "reports.fleet"
  | "settings.manage"
  | "users.manage"
  | "audit.view"
  | "portal.access";

const ALL: Role[] = ["admin", "sales", "accountant", "procurement", "customer"];

/** المصفوفة حرفياً من SPEC §2.2 — مصدر وحيد للصلاحيات */
export const PERMISSIONS: Record<Action, readonly Role[]> = {
  "dashboard.view": ["admin", "sales", "accountant", "procurement"],
  // السيارات — عرض: المبيعات ترى المتاحة فقط
  "vehicles.view": ["admin", "sales", "accountant", "procurement"],
  "vehicles.viewAll": ["admin", "accountant", "procurement"],
  "vehicles.manage": ["admin", "procurement"],
  "vehicles.expenses.view": ["admin", "accountant", "procurement"],
  "vehicles.expenses.manage": ["admin", "procurement"],
  "vehicles.viewCost": ["admin", "accountant", "procurement"],
  // العملاء — عرض/إضافة: الحسابات عرض فقط
  "customers.view": ["admin", "sales", "accountant"],
  "customers.create": ["admin", "sales"],
  "contracts.view": ["admin", "sales", "accountant"],
  "contracts.create": ["admin", "sales"],
  "contracts.approve": ["admin"],
  "contracts.viewProfit": ["admin"],
  // تسليم / استرداد: المشتريات للاستلام فقط
  "contracts.handover": ["admin", "sales"],
  "contracts.receiveReturn": ["admin", "sales", "procurement"],
  "contracts.registerOwnership": ["admin"],
  "payments.view": ["admin", "accountant"],
  "payments.record": ["admin", "accountant"],
  "payments.reverse": ["admin"],
  // التحصيل: المبيعات عرض فقط
  "collections.view": ["admin", "sales", "accountant"],
  "collections.manage": ["admin", "accountant"],
  "notifications.view": ALL,
  "reports.view": ["admin", "sales", "accountant", "procurement"],
  "reports.sales": ["admin", "sales"],
  "reports.financial": ["admin", "accountant"],
  "reports.fleet": ["admin", "procurement"],
  "settings.manage": ["admin"],
  "users.manage": ["admin"],
  "audit.view": ["admin"],
  "portal.access": ["customer"],
};

export const ACTIONS = Object.keys(PERMISSIONS) as Action[];

export function can(role: Role | null | undefined, action: Action): boolean {
  if (!role) return false;
  return PERMISSIONS[action].includes(role);
}

/** حماية المسارات — أول تطابق (الأطول) يفوز */
const ROUTE_RULES: { prefix: string; action: Action }[] = [
  { prefix: "/contracts/new", action: "contracts.create" },
  { prefix: "/customers/new", action: "customers.create" },
  { prefix: "/vehicles/new", action: "vehicles.manage" },
  { prefix: "/accounts", action: "users.manage" },
  { prefix: "/audit", action: "audit.view" },
  { prefix: "/account", action: "dashboard.view" },
  { prefix: "/settings", action: "settings.manage" },
  { prefix: "/dashboard", action: "dashboard.view" },
  { prefix: "/contracts", action: "contracts.view" },
  { prefix: "/customers", action: "customers.view" },
  { prefix: "/vehicles", action: "vehicles.view" },
  { prefix: "/payments", action: "payments.view" },
  { prefix: "/collections", action: "collections.view" },
  { prefix: "/notifications", action: "notifications.view" },
  { prefix: "/reports", action: "reports.view" },
  { prefix: "/portal", action: "portal.access" },
];

export const PUBLIC_ROUTES = ["/login", "/offline"];

export function routeAction(pathname: string): Action | null {
  const rule = ROUTE_RULES.filter((r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)).sort(
    (a, b) => b.prefix.length - a.prefix.length,
  )[0];
  return rule?.action ?? null;
}

export function canAccessRoute(role: Role | null | undefined, pathname: string): boolean {
  if (PUBLIC_ROUTES.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return true;
  const action = routeAction(pathname);
  if (!action) return Boolean(role);
  return can(role, action);
}

export const homeFor = (role: Role): string => (role === "customer" ? "/portal" : "/dashboard");

export type NavIcon =
  | "dashboard"
  | "contracts"
  | "customers"
  | "vehicles"
  | "payments"
  | "collections"
  | "notifications"
  | "reports"
  | "settings"
  | "accounts"
  | "audit";

export interface NavItem {
  key: NavIcon;
  href: string;
  label: TKey;
  action: Action;
}

export const STAFF_NAV: NavItem[] = [
  { key: "dashboard", href: "/dashboard", label: "nav.dashboard", action: "dashboard.view" },
  { key: "contracts", href: "/contracts", label: "nav.contracts", action: "contracts.view" },
  { key: "customers", href: "/customers", label: "nav.customers", action: "customers.view" },
  { key: "vehicles", href: "/vehicles", label: "nav.vehicles", action: "vehicles.view" },
  { key: "payments", href: "/payments", label: "nav.payments", action: "payments.view" },
  { key: "collections", href: "/collections", label: "nav.collections", action: "collections.view" },
  { key: "notifications", href: "/notifications", label: "nav.notifications", action: "notifications.view" },
  { key: "reports", href: "/reports", label: "nav.reports", action: "reports.view" },
  { key: "accounts", href: "/accounts", label: "nav.accounts", action: "users.manage" },
  { key: "audit", href: "/audit", label: "nav.audit", action: "audit.view" },
  { key: "settings", href: "/settings", label: "nav.settings", action: "settings.manage" },
];

export const navForRole = (role: Role): NavItem[] => STAFF_NAV.filter((n) => can(role, n.action));

/** عناصر Bottom Nav للموبايل (5 كحد أقصى) حسب أولوية الدور */
const MOBILE_PRIORITY: Record<StaffRole, NavIcon[]> = {
  admin: ["dashboard", "contracts", "notifications", "audit"],
  sales: ["dashboard", "contracts", "customers", "vehicles"],
  accountant: ["dashboard", "payments", "collections", "contracts"],
  procurement: ["dashboard", "vehicles", "reports", "notifications"],
};

export function mobileNavForRole(role: StaffRole): NavItem[] {
  const allowed = navForRole(role);
  return MOBILE_PRIORITY[role]
    .map((k) => allowed.find((n) => n.key === k))
    .filter((n): n is NavItem => Boolean(n));
}

export type FabAction = "newContract" | "recordPayment" | "addVehicle";

/** الإجراء الأهم للدور (FAB في الموبايل) */
export function fabForRole(role: Role): FabAction | null {
  if (role === "sales") return "newContract";
  if (role === "accountant") return "recordPayment";
  if (role === "procurement") return "addVehicle";
  if (role === "admin") return "newContract";
  return null;
}
