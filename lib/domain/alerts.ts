import type {
  AlertRule,
  AlertSettings,
  AppNotification,
  Contract,
  Customer,
  Role,
  Severity,
  Vehicle,
} from "@/types/domain";
import { t } from "@/lib/i18n";
import { formatDate, formatMoney, formatRelativeDay } from "@/lib/format";
import { installmentRemaining } from "./allocation";
import { getContractBalances } from "./balances";
import { addDaysISO, daysBetween, type ISODate } from "./dates";

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  INSTALLMENT_DUE_SOON: { enabled: true, days: 3 },
  INSTALLMENT_DUE_TODAY: { enabled: true, days: 0 },
  INSTALLMENT_OVERDUE: { enabled: true, days: 1 },
  CONTRACT_ENDING_SOON: { enabled: true, days: 3 },
  DOCUMENT_EXPIRING: { enabled: true, days: 30 },
  CONTRACT_PENDING_APPROVAL: { enabled: true, days: 0 },
  VEHICLE_READY: { enabled: true, days: 7 },
};

/** SPEC §7.4 — من يرى كل قاعدة */
export const RULE_AUDIENCE: Record<AlertRule, Role[]> = {
  INSTALLMENT_DUE_SOON: ["accountant", "admin", "customer"],
  INSTALLMENT_DUE_TODAY: ["accountant", "admin", "customer"],
  INSTALLMENT_OVERDUE: ["accountant", "admin", "customer"],
  CONTRACT_ENDING_SOON: ["admin", "sales", "accountant", "customer"],
  DOCUMENT_EXPIRING: ["sales", "admin", "customer"],
  CONTRACT_PENDING_APPROVAL: ["admin"],
  VEHICLE_READY: ["sales"],
};

export const RULE_SEVERITY: Record<AlertRule, Severity> = {
  INSTALLMENT_DUE_SOON: "info",
  INSTALLMENT_DUE_TODAY: "warning",
  INSTALLMENT_OVERDUE: "critical",
  CONTRACT_ENDING_SOON: "warning",
  DOCUMENT_EXPIRING: "info",
  CONTRACT_PENDING_APPROVAL: "info",
  VEHICLE_READY: "info",
};

export const ALERT_RULES = Object.keys(RULE_AUDIENCE) as AlertRule[];

export type OverdueBucket = "b1_7" | "b8_30" | "b30_plus";
export const OVERDUE_BUCKETS: OverdueBucket[] = ["b1_7", "b8_30", "b30_plus"];

/** فئات المتأخرات: 1–7 / 8–30 / +30 */
export function overdueBucket(daysOverdue: number): OverdueBucket | null {
  if (daysOverdue <= 0) return null;
  if (daysOverdue <= 7) return "b1_7";
  if (daysOverdue <= 30) return "b8_30";
  return "b30_plus";
}

export interface AlertInput {
  contracts: Contract[];
  customers: Customer[];
  vehicles: Vehicle[];
  settings: AlertSettings;
  today: ISODate;
}

const OPEN_STATUSES = new Set(["active", "overdue", "paid_off"]);

const vehicleLabel = (v: Vehicle | undefined): string => (v ? `${v.make} ${v.model} ${v.year}` : "");

/**
 * يحسب كل الإشعارات من البيانات (SPEC §7.4). المعرّفات ثابتة حتى تبقى حالة «مقروء» بعد إعادة الحساب.
 */
export function computeAlerts({ contracts, customers, vehicles, settings, today }: AlertInput): AppNotification[] {
  const out: AppNotification[] = [];
  const customerById = new Map(customers.map((c) => [c.id, c]));
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const push = (n: Omit<AppNotification, "audience" | "severity" | "readBy">) =>
    out.push({ ...n, audience: RULE_AUDIENCE[n.rule], severity: RULE_SEVERITY[n.rule], readBy: [] });

  for (const contract of contracts) {
    const customer = customerById.get(contract.customerId);
    const vehicle = vehicleById.get(contract.vehicleId);
    const customerName = customer?.fullName ?? "";

    if (contract.status === "pending_approval" && settings.CONTRACT_PENDING_APPROVAL.enabled) {
      push({
        id: `CONTRACT_PENDING_APPROVAL:${contract.id}`,
        rule: "CONTRACT_PENDING_APPROVAL",
        contractId: contract.id,
        customerId: contract.customerId,
        title: t("alerts.pendingApproval.title", { number: contract.number }),
        body: t("alerts.pendingApproval.body", {
          customer: customerName,
          vehicle: vehicleLabel(vehicle),
          amount: formatMoney(contract.vehiclePrice),
        }),
        link: `/contracts/${contract.id}`,
        createdAt: contract.createdAt,
      });
    }

    if (!OPEN_STATUSES.has(contract.status)) continue;

    for (const inst of contract.installments) {
      if (inst.status === "paid") continue;
      const until = daysBetween(today, inst.dueDate);
      const vars = { customer: customerName, seq: inst.seq, amount: formatMoney(installmentRemaining(inst)), number: contract.number };

      if (until === 0 && settings.INSTALLMENT_DUE_TODAY.enabled) {
        push({
          id: `INSTALLMENT_DUE_TODAY:${inst.id}`,
          rule: "INSTALLMENT_DUE_TODAY",
          contractId: contract.id,
          customerId: contract.customerId,
          title: t("alerts.dueToday.title", vars),
          body: t("alerts.dueToday.body", vars),
          customerTitle: t("alerts.dueToday.customerTitle"),
          customerBody: t("alerts.dueToday.customerBody", vars),
          link: `/contracts/${contract.id}`,
          portalLink: "/portal/installments",
          createdAt: `${today}T07:00:00`,
        });
      } else if (until > 0 && until <= settings.INSTALLMENT_DUE_SOON.days && settings.INSTALLMENT_DUE_SOON.enabled) {
        const when = formatRelativeDay(inst.dueDate, today);
        push({
          id: `INSTALLMENT_DUE_SOON:${inst.id}`,
          rule: "INSTALLMENT_DUE_SOON",
          contractId: contract.id,
          customerId: contract.customerId,
          title: t("alerts.dueSoon.title", { ...vars, when }),
          body: t("alerts.dueSoon.body", vars),
          customerTitle: t("alerts.dueSoon.customerTitle", { when }),
          customerBody: t("alerts.dueSoon.customerBody", vars),
          link: `/contracts/${contract.id}`,
          portalLink: "/portal/installments",
          createdAt: `${addDaysISO(inst.dueDate, -settings.INSTALLMENT_DUE_SOON.days)}T07:00:00`,
        });
      }
    }

    // متأخرات: إشعار واحد لكل عقد بأقدم قسط متأخر
    if (settings.INSTALLMENT_OVERDUE.enabled) {
      const b = getContractBalances(contract, today);
      if (b.overdueCount > 0 && b.daysOverdue >= settings.INSTALLMENT_OVERDUE.days) {
        const oldest = contract.installments.filter((i) => i.status === "overdue").sort((a, c) => a.seq - c.seq)[0];
        const vars = { customer: customerName, days: b.daysOverdue, amount: formatMoney(b.overdueAmount), count: b.overdueCount, number: contract.number };
        push({
          id: `INSTALLMENT_OVERDUE:${contract.id}:${oldest.id}`,
          rule: "INSTALLMENT_OVERDUE",
          contractId: contract.id,
          customerId: contract.customerId,
          title: t("alerts.overdue.title", vars),
          body: t("alerts.overdue.body", vars),
          customerTitle: t("alerts.overdue.customerTitle"),
          customerBody: t("alerts.overdue.customerBody", vars),
          link: `/contracts/${contract.id}`,
          portalLink: "/portal/installments",
          createdAt: `${addDaysISO(oldest.dueDate, 1)}T08:00:00`,
        });
      }
    }

    if (settings.CONTRACT_ENDING_SOON.enabled && contract.status !== "paid_off") {
      const daysToEnd = daysBetween(today, contract.endDate);
      if (daysToEnd >= 0 && daysToEnd <= settings.CONTRACT_ENDING_SOON.days) {
        const when = formatRelativeDay(contract.endDate, today);
        const vars = { number: contract.number, when, customer: customerName, vehicle: vehicleLabel(vehicle) };
        push({
          id: `CONTRACT_ENDING_SOON:${contract.id}`,
          rule: "CONTRACT_ENDING_SOON",
          contractId: contract.id,
          customerId: contract.customerId,
          title: t("alerts.endingSoon.title", vars),
          body: t("alerts.endingSoon.body", vars),
          customerTitle: t("alerts.endingSoon.customerTitle"),
          customerBody: t("alerts.endingSoon.customerBody", vars),
          link: `/contracts/${contract.id}`,
          portalLink: "/portal/contract",
          createdAt: `${addDaysISO(contract.endDate, -settings.CONTRACT_ENDING_SOON.days)}T07:00:00`,
        });
      }
    }
  }

  if (settings.DOCUMENT_EXPIRING.enabled) {
    for (const customer of customers) {
      for (const doc of customer.documents) {
        if (!doc.expiresAt) continue;
        const left = daysBetween(today, doc.expiresAt);
        if (left < 0 || left > settings.DOCUMENT_EXPIRING.days) continue;
        const vars = {
          document: t(`enums.documentType.${doc.type}`),
          customer: customer.fullName,
          when: formatRelativeDay(doc.expiresAt, today),
          date: formatDate(doc.expiresAt),
        };
        push({
          id: `DOCUMENT_EXPIRING:${customer.id}:${doc.id}`,
          rule: "DOCUMENT_EXPIRING",
          customerId: customer.id,
          title: t("alerts.documentExpiring.title", vars),
          body: t("alerts.documentExpiring.body", vars),
          customerTitle: t("alerts.documentExpiring.customerTitle", vars),
          customerBody: t("alerts.documentExpiring.customerBody", vars),
          link: `/customers/${customer.id}?tab=documents`,
          portalLink: "/portal/documents",
          createdAt: `${addDaysISO(doc.expiresAt, -settings.DOCUMENT_EXPIRING.days)}T07:00:00`,
        });
      }
    }
  }

  if (settings.VEHICLE_READY.enabled) {
    for (const v of vehicles) {
      if (v.status !== "available") continue;
      const last = [...v.statusHistory].reverse().find((h) => h.status === "available");
      if (!last) continue;
      const age = daysBetween(last.at.slice(0, 10), today);
      if (age < 0 || age > settings.VEHICLE_READY.days) continue;
      push({
        id: `VEHICLE_READY:${v.id}`,
        rule: "VEHICLE_READY",
        title: t("alerts.vehicleReady.title", { vehicle: vehicleLabel(v) }),
        body: t("alerts.vehicleReady.body", { plate: v.plateEn, amount: formatMoney(v.listPrice) }),
        link: `/vehicles/${v.id}`,
        createdAt: last.at,
      });
    }
  }

  // createdAt لا يتجاوز الآن
  return out
    .map((n) => (n.createdAt.slice(0, 10) > today ? { ...n, createdAt: `${today}T07:00:00` } : n))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** إشعارات دور معيّن؛ العميل يرى إشعاراته فقط */
export function alertsForViewer(alerts: AppNotification[], role: Role, customerId?: string): AppNotification[] {
  return alerts.filter((a) => a.audience.includes(role) && (role !== "customer" || (customerId && a.customerId === customerId)));
}
