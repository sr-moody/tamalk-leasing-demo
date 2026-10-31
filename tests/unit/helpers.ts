import type { Contract } from "@/types/domain";
import { calcContractTerms, generateSchedule } from "@/lib/domain/schedule";
import { refreshContract } from "@/lib/domain/allocation";

export const TODAY = "2026-10-26";

export function makeContract(overrides: Partial<Contract> & { firstDueDate?: string; months?: number } = {}): Contract {
  const months = overrides.months ?? 12;
  const firstDueDate = overrides.firstDueDate ?? "2026-11-01";
  const terms = calcContractTerms({ vehiclePrice: 100000, downPayment: 20000, months });
  const installments = generateSchedule({ terms, firstDueDate, idPrefix: "t" });
  const base: Contract = {
    id: "k-test",
    number: "MLK-2026-00001",
    customerId: "c-1",
    vehicleId: "v-1",
    vehiclePrice: 100000,
    downPayment: 20000,
    months,
    installmentAmount: terms.installment,
    vatRate: 0.15,
    firstDueDate,
    endDate: installments[installments.length - 1].dueDate,
    dueDay: Number(firstDueDate.slice(8)),
    status: "active",
    createdAt: "2026-10-01T10:00:00",
    createdBy: "u-sales1",
    termsSnapshot: "",
    installments,
    payments: [],
    ...overrides,
  };
  return refreshContract(base, TODAY);
}

export const basePayment = (id: string, amount: number) => ({
  id,
  receiptNo: `RCPT-2026-${id}`,
  type: "installment" as const,
  amount,
  method: "cash" as const,
  paidAt: `${TODAY}T10:00:00`,
  createdBy: "u-acc1",
});
