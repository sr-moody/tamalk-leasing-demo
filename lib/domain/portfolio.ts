import type { Contract, Installment, Payment, Vehicle, VehicleStatus, ExpenseType } from "@/types/domain";
import { installmentRemaining } from "./allocation";
import { getContractBalances, getVehicleEconomics, isPortfolioContract, type ContractBalances } from "./balances";
import { overdueBucket, OVERDUE_BUCKETS, type OverdueBucket } from "./alerts";
import { addMonthsISO, daysBetween, isSameMonth, type ISODate } from "./dates";
import { sum } from "./money";

export interface PortfolioSummary {
  totalRemaining: number;
  overdueTotal: number;
  activeCount: number;
  overdueCount: number;
  endingSoonCount: number;
  pendingApprovalCount: number;
  ownedCount: number;
  collectedThisMonth: number;
  collectedToday: number;
  dueThisMonth: number;
  /** المحصل من أقساط الشهر ÷ مستحق الشهر */
  collectionRate: number;
}

const livePayments = (contracts: Contract[]): Payment[] =>
  contracts.flatMap((c) => c.payments.filter((p) => !p.reversed && p.type !== "down"));

export function getPortfolioSummary(contracts: Contract[], today: ISODate, endingSoonDays = 3): PortfolioSummary {
  const live = contracts.filter(isPortfolioContract);
  const balances = live.map((c) => getContractBalances(c, today));
  const monthInstallments = live.flatMap((c) => c.installments.filter((i) => isSameMonth(i.dueDate, today)));
  const dueThisMonth = sum(monthInstallments.map((i) => i.amount));
  const paidOfMonth = sum(monthInstallments.map((i) => i.paidAmount));
  const payments = livePayments(contracts);

  return {
    totalRemaining: sum(balances.map((b) => b.remaining)),
    overdueTotal: sum(balances.map((b) => b.overdueAmount)),
    activeCount: live.filter((c) => c.status === "active").length,
    overdueCount: live.filter((c) => c.status === "overdue").length,
    endingSoonCount: live.filter((c) => {
      const d = daysBetween(today, c.endDate);
      return c.status !== "paid_off" && d >= 0 && d <= endingSoonDays;
    }).length,
    pendingApprovalCount: contracts.filter((c) => c.status === "pending_approval").length,
    ownedCount: contracts.filter((c) => c.status === "owned" || c.status === "paid_off").length,
    collectedThisMonth: sum(payments.filter((p) => isSameMonth(p.paidAt.slice(0, 10), today)).map((p) => p.amount)),
    collectedToday: sum(payments.filter((p) => p.paidAt.slice(0, 10) === today).map((p) => p.amount)),
    dueThisMonth,
    collectionRate: dueThisMonth > 0 ? Math.min(1, paidOfMonth / dueThisMonth) : 0,
  };
}

export interface AgingRow {
  bucket: OverdueBucket;
  count: number;
  amount: number;
  contractIds: string[];
}

/** أعمار المتأخرات بالفئات الثلاث */
export function getAging(contracts: Contract[], today: ISODate): AgingRow[] {
  const rows: Record<OverdueBucket, AgingRow> = Object.fromEntries(
    OVERDUE_BUCKETS.map((b) => [b, { bucket: b, count: 0, amount: 0, contractIds: [] }]),
  ) as unknown as Record<OverdueBucket, AgingRow>;
  for (const c of contracts.filter(isPortfolioContract)) {
    const b = getContractBalances(c, today);
    const bucket = overdueBucket(b.daysOverdue);
    if (!bucket || b.overdueAmount <= 0) continue;
    rows[bucket].count += 1;
    rows[bucket].amount = sum([rows[bucket].amount, b.overdueAmount]);
    rows[bucket].contractIds.push(c.id);
  }
  return OVERDUE_BUCKETS.map((b) => rows[b]);
}

export interface DueItem {
  contract: Contract;
  installment: Installment;
  daysUntil: number;
  remaining: number;
}

/** أقساط مستحقة بين fromDays و toDays من اليوم (شاملة) */
export function getDueItems(contracts: Contract[], today: ISODate, fromDays: number, toDays: number): DueItem[] {
  return contracts
    .filter(isPortfolioContract)
    .flatMap((contract) =>
      contract.installments
        .filter((i) => i.status !== "paid")
        .map((installment) => ({ contract, installment, daysUntil: daysBetween(today, installment.dueDate), remaining: installmentRemaining(installment) }))
        .filter((d) => d.daysUntil >= fromDays && d.daysUntil <= toDays),
    )
    .sort((a, b) => a.daysUntil - b.daysUntil || b.remaining - a.remaining);
}

export interface MonthlyPoint {
  month: ISODate;
  collected: number;
  due: number;
}

/** المحصل مقابل المستحق لآخر N شهور */
export function getMonthlyCollections(contracts: Contract[], today: ISODate, months = 6): MonthlyPoint[] {
  const live = contracts.filter((c) => isPortfolioContract(c) || c.status === "owned");
  const payments = livePayments(contracts);
  return Array.from({ length: months }, (_, idx) => {
    const month = addMonthsISO(`${today.slice(0, 7)}-01`, idx - months + 1);
    return {
      month,
      collected: sum(payments.filter((p) => isSameMonth(p.paidAt.slice(0, 10), month)).map((p) => p.amount)),
      due: sum(live.flatMap((c) => c.installments.filter((i) => isSameMonth(i.dueDate, month)).map((i) => i.amount))),
    };
  });
}

export type FleetCounts = Record<VehicleStatus, number>;

export function getFleetCounts(vehicles: Vehicle[]): FleetCounts {
  const counts: FleetCounts = { in_purchase: 0, preparing: 0, available: 0, reserved: 0, contracted: 0, returned: 0, sold: 0 };
  for (const v of vehicles) counts[v.status] += 1;
  return counts;
}

export interface FleetProfit {
  totalCost: number;
  totalContractValue: number;
  estimatedProfit: number;
  margin: number;
  averageCost: number;
}

/** الربح التقديري للأسطول (السيارات المتعاقد عليها والمملكة) */
export function getFleetProfit(vehicles: Vehicle[], contracts: Contract[]): FleetProfit {
  const rows = vehicles.map((v) => {
    const contract = currentContractFor(v.id, contracts);
    return { contracted: Boolean(contract), econ: getVehicleEconomics(v, contract) };
  });
  const contracted = rows.filter((r) => r.contracted);
  const totalCost = sum(contracted.map((r) => r.econ.actualCost));
  const totalContractValue = sum(contracted.map((r) => r.econ.contractValue));
  const estimatedProfit = sum(contracted.map((r) => r.econ.estimatedProfit));
  return {
    totalCost,
    totalContractValue,
    estimatedProfit,
    margin: totalContractValue > 0 ? estimatedProfit / totalContractValue : 0,
    averageCost: rows.length ? sum(rows.map((r) => r.econ.actualCost)) / rows.length : 0,
  };
}

const CURRENT_STATUSES = new Set(["pending_approval", "approved", "active", "overdue", "paid_off", "owned"]);

/** العقد الحالي لسيارة (غير مفسوخ) */
export const currentContractFor = (vehicleId: string, contracts: Contract[]): Contract | null =>
  contracts.find((c) => c.vehicleId === vehicleId && CURRENT_STATUSES.has(c.status)) ?? null;

/** مصروفات شهر معيّن حسب النوع */
export function getExpensesByType(vehicles: Vehicle[], month: ISODate): Record<ExpenseType, number> {
  const out: Record<ExpenseType, number> = { maintenance: 0, insurance: 0, registration: 0, preparation: 0, other: 0 };
  for (const v of vehicles) for (const e of v.expenses) if (isSameMonth(e.date, month)) out[e.type] = sum([out[e.type], e.amount]);
  return out;
}

export interface ContractRow {
  contract: Contract;
  balances: ContractBalances;
}

export const withBalances = (contracts: Contract[], today: ISODate): ContractRow[] =>
  contracts.map((contract) => ({ contract, balances: getContractBalances(contract, today) }));
