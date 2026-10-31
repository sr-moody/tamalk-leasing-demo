import type { Contract, Installment, Payment, Vehicle } from "@/types/domain";
import { installmentRemaining } from "./allocation";
import { daysBetween, type ISODate } from "./dates";
import { round2, sum, toHalalas, toRiyals } from "./money";
import { calcVat } from "./vat";

export interface ContractBalances {
  vehiclePrice: number;
  downPayment: number;
  upfrontFee: number;
  upfrontFeePaid: number;
  upfrontFeeRemaining: number;
  financedAmount: number;
  vat: number;
  /** المستحق بالأقساط (الممول + الضريبة) */
  totalPayable: number;
  /** إجمالي العقد = المقدم + المستحق بالأقساط */
  contractTotal: number;
  paid: number;
  remaining: number;
  overdueAmount: number;
  overdueCount: number;
  /** 0..1 */
  progress: number;
  daysOverdue: number;
  nextInstallment: Installment | null;
  daysToNext: number | null;
  paidCount: number;
  remainingCount: number;
  daysToEnd: number;
}

/**
 * SPEC §7.3 — كل أرقام العقد في كل الشاشات تأتي من هنا.
 * يفترض أن الأقساط محدثة عبر `refreshContract`.
 */
export type BalanceInput = Pick<Contract, "installments" | "vehiclePrice" | "downPayment" | "upfrontFee" | "vatRate" | "endDate" | "payments">;

export function getContractBalances(contract: BalanceInput, today: ISODate): ContractBalances {
  const totalPayable = sum(contract.installments.map((i) => i.amount));
  const paid = sum(contract.installments.map((i) => i.paidAmount));
  const upfrontFee = contract.upfrontFee ?? 0;
  const upfrontFeePaid = sum(contract.payments
    .filter((payment) => payment.type === "contract_fee" && !payment.reversed)
    .map((payment) => payment.amount));
  const upfrontFeeRemaining = toRiyals(Math.max(0, toHalalas(upfrontFee) - toHalalas(upfrontFeePaid)));
  const remaining = toRiyals(Math.max(0, toHalalas(totalPayable) - toHalalas(paid)) + toHalalas(upfrontFeeRemaining));
  const overdue = contract.installments.filter((i) => i.status === "overdue");
  const overdueAmount = sum(overdue.map(installmentRemaining));
  const oldestOverdue = overdue.reduce<Installment | null>((a, i) => (!a || i.seq < a.seq ? i : a), null);
  const nextInstallment =
    contract.installments
      .filter((i) => i.status !== "paid" && i.status !== "overdue")
      .sort((a, b) => a.seq - b.seq)[0] ?? null;
  const financedAmount = round2(contract.vehiclePrice - contract.downPayment);
  const vat = calcVat(financedAmount, contract.vatRate);

  return {
    vehiclePrice: contract.vehiclePrice,
    downPayment: contract.downPayment,
    upfrontFee,
    upfrontFeePaid,
    upfrontFeeRemaining,
    financedAmount,
    vat,
    totalPayable,
    contractTotal: round2(contract.downPayment + upfrontFee + totalPayable),
    paid,
    remaining,
    overdueAmount,
    overdueCount: overdue.length,
    progress: totalPayable > 0 ? Math.min(1, paid / totalPayable) : 0,
    daysOverdue: oldestOverdue ? Math.max(0, daysBetween(oldestOverdue.dueDate, today)) : 0,
    nextInstallment,
    daysToNext: nextInstallment ? daysBetween(today, nextInstallment.dueDate) : null,
    paidCount: contract.installments.filter((i) => i.status === "paid").length,
    remainingCount: contract.installments.filter((i) => i.status !== "paid").length,
    daysToEnd: daysBetween(today, contract.endDate),
  };
}

/** العقود التي تُحتسب في المحفظة القائمة */
export const isPortfolioContract = (c: Contract): boolean =>
  c.status === "active" || c.status === "overdue" || c.status === "paid_off";

export interface CustomerSummary {
  totalCommitment: number;
  paid: number;
  remaining: number;
  overdueAmount: number;
  /** نسبة الأقساط المسددة في موعدها (0..1) أو null إن لم يحل أي قسط */
  onTimeRate: number | null;
  contractsCount: number;
}

/** آخر تاريخ دفع غطّى القسط بالكامل */
function installmentSettledAt(inst: Installment, payments: Payment[]): string | null {
  let acc = 0;
  const sorted = payments.filter((p) => !p.reversed).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
  for (const p of sorted) {
    for (const a of p.allocations) {
      if (a.installmentId !== inst.id) continue;
      acc += toHalalas(a.amount);
      if (acc >= toHalalas(inst.amount)) return p.paidAt.slice(0, 10);
    }
  }
  return null;
}

export function getCustomerSummary(contracts: Contract[], today: ISODate): CustomerSummary {
  const relevant = contracts.filter((c) => c.status !== "draft" && c.status !== "terminated" && c.status !== "pending_approval");
  const balances = relevant.map((c) => getContractBalances(c, today));
  let dueCount = 0;
  let onTime = 0;
  for (const c of relevant) {
    for (const inst of c.installments) {
      if (daysBetween(inst.dueDate, today) < 0) continue; // لم يحل بعد
      dueCount += 1;
      const settled = installmentSettledAt(inst, c.payments);
      if (settled && settled <= inst.dueDate) onTime += 1;
    }
  }
  return {
    totalCommitment: sum(balances.map((b) => b.contractTotal)),
    paid: sum(balances.map((b) => round2(b.paid + b.downPayment + b.upfrontFeePaid))),
    remaining: sum(balances.map((b) => b.remaining)),
    overdueAmount: sum(balances.map((b) => b.overdueAmount)),
    onTimeRate: dueCount > 0 ? onTime / dueCount : null,
    contractsCount: relevant.length,
  };
}

export interface VehicleEconomics {
  purchasePrice: number;
  expensesTotal: number;
  /** التكلفة الفعلية = الشراء + المصروفات */
  actualCost: number;
  /** قيمة العقد (سعر البيع قبل الضريبة) — للعقد الحالي أو سعر القائمة */
  contractValue: number;
  /** ربح تقديري (ليس محاسبياً) */
  estimatedProfit: number;
  margin: number;
}

export function getVehicleEconomics(vehicle: Vehicle, currentContract?: Contract | null): VehicleEconomics {
  const expensesTotal = sum(vehicle.expenses.map((e) => e.amount));
  const actualCost = round2(vehicle.purchasePrice + expensesTotal);
  const contractValue = currentContract ? currentContract.vehiclePrice : vehicle.listPrice;
  const estimatedProfit = round2(contractValue - actualCost);
  return {
    purchasePrice: vehicle.purchasePrice,
    expensesTotal,
    actualCost,
    contractValue,
    estimatedProfit,
    margin: contractValue > 0 ? estimatedProfit / contractValue : 0,
  };
}

/** الربح التقديري لعقد جديد في المعالج */
export const estimateDealProfit = (vehicle: Vehicle, vehiclePrice: number): number =>
  round2(vehiclePrice - vehicle.purchasePrice - sum(vehicle.expenses.map((e) => e.amount)));
