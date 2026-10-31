import type { Installment } from "@/types/domain";
import { addMonthsISO, type ISODate } from "./dates";
import { round2, sub, toHalalas, toRiyals } from "./money";
import { calcVat, DEFAULT_VAT_RATE } from "./vat";

export interface TermsInput {
  vehiclePrice: number;
  downPayment: number;
  upfrontFee?: number;
  months: number;
  vatRate?: number;
  /** قسط مُدخل يدوياً (اختياري) — القسط الأخير يمتص الفرق */
  installmentOverride?: number;
}

export interface ContractTerms {
  vehiclePrice: number;
  downPayment: number;
  upfrontFee: number;
  months: number;
  vatRate: number;
  financedAmount: number;
  vat: number;
  totalPayable: number;
  /** إجمالي العقد = المقدم + المبلغ المستحق بالأقساط */
  contractTotal: number;
  installment: number;
  lastInstallment: number;
  /** القسط المحسوب تلقائياً (قبل أي تعديل يدوي) */
  suggestedInstallment: number;
  /** الفرق بين القسط الأخير والقسط المعتاد (عند التعديل اليدوي) */
  lastInstallmentDiff: number;
  isManual: boolean;
}

/** SPEC §7.1 */
export function calcContractTerms(input: TermsInput): ContractTerms {
  const vatRate = input.vatRate ?? DEFAULT_VAT_RATE;
  const upfrontFee = Math.max(0, round2(input.upfrontFee ?? 0));
  const months = Math.max(1, Math.floor(input.months));
  const financedAmount = sub(input.vehiclePrice, input.downPayment);
  const vat = calcVat(financedAmount, vatRate);
  const totalPayable = round2(financedAmount + vat);
  const suggestedInstallment = round2(totalPayable / months);

  const isManual =
    input.installmentOverride !== undefined &&
    input.installmentOverride > 0 &&
    toHalalas(input.installmentOverride) !== toHalalas(suggestedInstallment);
  const installment = isManual ? round2(input.installmentOverride as number) : suggestedInstallment;
  const lastInstallment = toRiyals(toHalalas(totalPayable) - toHalalas(installment) * (months - 1));

  return {
    vehiclePrice: input.vehiclePrice,
    downPayment: input.downPayment,
    upfrontFee,
    months,
    vatRate,
    financedAmount,
    vat,
    totalPayable,
    contractTotal: round2(input.downPayment + upfrontFee + totalPayable),
    installment,
    lastInstallment,
    suggestedInstallment,
    lastInstallmentDiff: sub(lastInstallment, installment),
    isManual,
  };
}

export interface ScheduleInput {
  terms: Pick<ContractTerms, "months" | "installment" | "lastInstallment">;
  firstDueDate: ISODate;
  idPrefix?: string;
}

/** توليد جدول الأقساط: شهرياً من firstDueDate بدون تجاوز نهاية الشهر */
export function generateSchedule({ terms, firstDueDate, idPrefix = "inst" }: ScheduleInput): Installment[] {
  return Array.from({ length: terms.months }, (_, i) => ({
    id: `${idPrefix}-${i + 1}`,
    seq: i + 1,
    dueDate: addMonthsISO(firstDueDate, i),
    amount: i === terms.months - 1 ? terms.lastInstallment : terms.installment,
    paidAmount: 0,
    status: "upcoming" as const,
  }));
}

/** مفاتيح رسائل الخطأ (من ar.json → validation.*) */
export type TermsError =
  | "downPaymentNegative"
  | "downPaymentTooHigh"
  | "monthsOutOfRange"
  | "installmentTooHigh"
  | "vehicleNotAvailable"
  | "priceRequired";

export function validateTerms(
  input: TermsInput & { vehicleStatus?: string },
  limits: { minMonths: number; maxMonths: number } = { minMonths: 12, maxMonths: 60 },
): TermsError[] {
  const errors: TermsError[] = [];
  if (!(input.vehiclePrice > 0)) errors.push("priceRequired");
  if (input.downPayment < 0) errors.push("downPaymentNegative");
  if (input.downPayment >= input.vehiclePrice) errors.push("downPaymentTooHigh");
  if (input.months < limits.minMonths || input.months > limits.maxMonths || !Number.isInteger(input.months))
    errors.push("monthsOutOfRange");
  if (input.vehicleStatus !== undefined && input.vehicleStatus !== "available") errors.push("vehicleNotAvailable");
  if (errors.length === 0 && input.installmentOverride !== undefined) {
    const terms = calcContractTerms(input);
    if (terms.lastInstallment <= 0) errors.push("installmentTooHigh");
  }
  return errors;
}
