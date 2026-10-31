import type { Contract, ContractStatus, Installment, InstallmentStatus, Payment, PaymentAllocation } from "@/types/domain";
import { daysBetween, type ISODate } from "./dates";
import { toHalalas, toRiyals } from "./money";

export const DEFAULT_DUE_SOON_DAYS = 3;

/** حالة القسط مشتقة من المدفوع وتاريخ اليوم */
export function deriveInstallmentStatus(
  inst: Pick<Installment, "amount" | "paidAmount" | "dueDate">,
  today: ISODate,
  dueSoonDays: number = DEFAULT_DUE_SOON_DAYS,
): InstallmentStatus {
  const amount = toHalalas(inst.amount);
  const paid = toHalalas(inst.paidAmount);
  if (paid >= amount) return "paid";
  const daysUntil = daysBetween(today, inst.dueDate);
  if (daysUntil < 0) return "overdue";
  if (paid > 0) return "partial";
  if (daysUntil <= dueSoonDays) return "due";
  return "upcoming";
}

export const installmentRemaining = (inst: Pick<Installment, "amount" | "paidAmount">): number =>
  toRiyals(Math.max(0, toHalalas(inst.amount) - toHalalas(inst.paidAmount)));

export type AllocationResult =
  | { ok: true; allocations: PaymentAllocation[]; remainingAfter: number }
  | { ok: false; error: "invalidAmount" | "exceedsRemaining"; maxAllowed: number };

/** SPEC §7.2 — توزيع الدفعة على الأقساط غير المسددة، الأقدم أولاً */
export function allocatePayment(installments: Installment[], amount: number): AllocationResult {
  const open = [...installments]
    .filter((i) => toHalalas(i.paidAmount) < toHalalas(i.amount))
    .sort((a, b) => a.seq - b.seq);
  const totalRemaining = open.reduce((acc, i) => acc + toHalalas(i.amount) - toHalalas(i.paidAmount), 0);
  const value = toHalalas(amount);

  if (!(value > 0)) return { ok: false, error: "invalidAmount", maxAllowed: toRiyals(totalRemaining) };
  if (value > totalRemaining) return { ok: false, error: "exceedsRemaining", maxAllowed: toRiyals(totalRemaining) };

  let left = value;
  const allocations: PaymentAllocation[] = [];
  for (const inst of open) {
    if (left <= 0) break;
    const due = toHalalas(inst.amount) - toHalalas(inst.paidAmount);
    const take = Math.min(due, left);
    allocations.push({ installmentId: inst.id, amount: toRiyals(take) });
    left -= take;
  }
  return { ok: true, allocations, remainingAfter: toRiyals(totalRemaining - value) };
}

/** إعادة بناء المدفوع لكل قسط من الدفعات غير المعكوسة، ثم اشتقاق الحالات */
export function recomputeInstallments(
  installments: Installment[],
  payments: Payment[],
  today: ISODate,
  dueSoonDays: number = DEFAULT_DUE_SOON_DAYS,
): Installment[] {
  const paidById = new Map<string, number>();
  for (const p of payments) {
    if (p.reversed) continue;
    for (const a of p.allocations) {
      paidById.set(a.installmentId, (paidById.get(a.installmentId) ?? 0) + toHalalas(a.amount));
    }
  }
  return installments.map((inst) => {
    const paidAmount = toRiyals(paidById.get(inst.id) ?? 0);
    return { ...inst, paidAmount, status: deriveInstallmentStatus({ ...inst, paidAmount }, today, dueSoonDays) };
  });
}

const LIFECYCLE_WITH_SCHEDULE: ContractStatus[] = ["active", "overdue", "paid_off"];

/** الحالة الفعلية للعقد: «متأخر» و«مسدد» مشتقتان من الأقساط */
export function deriveContractStatus(contract: Pick<Contract, "status" | "installments" | "upfrontFee" | "payments">): ContractStatus {
  if (!LIFECYCLE_WITH_SCHEDULE.includes(contract.status)) return contract.status;
  const feePaid = contract.payments
    .filter((payment) => payment.type === "contract_fee" && !payment.reversed)
    .reduce((total, payment) => total + toHalalas(payment.amount), 0);
  const feeRemaining = Math.max(0, toHalalas(contract.upfrontFee ?? 0) - feePaid);
  const allPaid = feeRemaining === 0 && contract.installments.every((i) => toHalalas(i.paidAmount) >= toHalalas(i.amount));
  if (allPaid) return "paid_off";
  if (contract.installments.some((i) => i.status === "overdue")) return "overdue";
  return "active";
}

/** يعيد العقد بأقساط وحالة محدثة حسب اليوم */
export function refreshContract(contract: Contract, today: ISODate, dueSoonDays: number = DEFAULT_DUE_SOON_DAYS): Contract {
  const installments = recomputeInstallments(contract.installments, contract.payments, today, dueSoonDays);
  const next = { ...contract, installments };
  return { ...next, status: deriveContractStatus(next) };
}

export type ApplyPaymentResult = { ok: true; contract: Contract; payment: Payment } | Extract<AllocationResult, { ok: false }>;

/** تسجيل دفعة على عقد: توزيع + تحديث الأرصدة والحالة */
export function applyPayment(
  contract: Contract,
  payment: Omit<Payment, "allocations" | "contractId">,
  today: ISODate,
): ApplyPaymentResult {
  const current = refreshContract(contract, today);
  if (payment.type === "contract_fee") {
    const feePaid = current.payments
      .filter((item) => item.type === "contract_fee" && !item.reversed)
      .reduce((total, item) => total + toHalalas(item.amount), 0);
    const feeRemaining = Math.max(0, toHalalas(current.upfrontFee ?? 0) - feePaid);
    const value = toHalalas(payment.amount);
    if (value <= 0) return { ok: false, error: "invalidAmount", maxAllowed: toRiyals(feeRemaining) };
    if (value > feeRemaining) return { ok: false, error: "exceedsRemaining", maxAllowed: toRiyals(feeRemaining) };
    const full: Payment = { ...payment, contractId: contract.id, allocations: [] };
    const updated = refreshContract({ ...current, payments: [...current.payments, full] }, today);
    return { ok: true, contract: updated, payment: full };
  }
  const result = allocatePayment(current.installments, payment.amount);
  if (!result.ok) return result;
  const full: Payment = { ...payment, contractId: contract.id, allocations: result.allocations };
  const updated = refreshContract({ ...current, payments: [...current.payments, full] }, today);
  return { ok: true, contract: updated, payment: full };
}

export type ReverseResult = { ok: true; contract: Contract } | { ok: false; error: "reasonRequired" | "notFound" | "alreadyReversed" };

/** SPEC §7.2 — عكس دفعة بسبب إجباري؛ الدفعة تبقى ظاهرة مشطوبة */
export function reversePayment(
  contract: Contract,
  paymentId: string,
  by: string,
  reason: string,
  at: string,
  today: ISODate,
): ReverseResult {
  if (!reason.trim()) return { ok: false, error: "reasonRequired" };
  const target = contract.payments.find((p) => p.id === paymentId);
  if (!target) return { ok: false, error: "notFound" };
  if (target.reversed) return { ok: false, error: "alreadyReversed" };
  const payments = contract.payments.map((p) => (p.id === paymentId ? { ...p, reversed: { at, by, reason: reason.trim() } } : p));
  // عند عكس دفعة على عقد مسدد يعود العقد نشطاً
  const status: ContractStatus = contract.status === "paid_off" ? "active" : contract.status;
  return { ok: true, contract: refreshContract({ ...contract, status, payments }, today) };
}
