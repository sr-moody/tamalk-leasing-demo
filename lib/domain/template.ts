import type { CompanySettings, Customer, Vehicle } from "@/types/domain";
import { formatAmount, formatDate, formatNationalId, formatPhone } from "@/lib/format";
import type { ContractTerms } from "./schedule";

/** المتغيرات المتاحة في قالب العقد */
export const TEMPLATE_VARIABLES = [
  "company.name",
  "company.crNumber",
  "company.vatNumber",
  "contract.number",
  "contract.date",
  "customer.fullName",
  "customer.nationalId",
  "customer.phone",
  "customer.city",
  "vehicle.make",
  "vehicle.model",
  "vehicle.year",
  "vehicle.color",
  "vehicle.plate",
  "vehicle.vin",
  "contract.vehiclePrice",
  "contract.downPayment",
  "contract.upfrontFee",
  "contract.financedAmount",
  "contract.vat",
  "contract.totalPayable",
  "contract.months",
  "contract.installment",
  "contract.lastInstallment",
  "contract.firstDueDate",
  "contract.endDate",
] as const;

export type TemplateVariable = (typeof TEMPLATE_VARIABLES)[number];
export type TemplateVars = Partial<Record<TemplateVariable, string>>;

/** استبدال `{{path}}` بالقيم؛ المتغير غير المعروف يبقى كما هو */
export function renderTemplate(template: string, vars: TemplateVars): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => vars[key as TemplateVariable] ?? m);
}

export interface TemplateContext {
  company: CompanySettings;
  customer: Customer;
  vehicle: Vehicle;
  terms: ContractTerms;
  number: string;
  createdAt: string;
  firstDueDate: string;
  endDate: string;
}

export function buildTemplateVars(ctx: TemplateContext): TemplateVars {
  return {
    "company.name": ctx.company.legalName,
    "company.crNumber": ctx.company.crNumber,
    "company.vatNumber": ctx.company.vatNumber,
    "contract.number": ctx.number,
    "contract.date": formatDate(ctx.createdAt),
    "customer.fullName": ctx.customer.fullName,
    "customer.nationalId": formatNationalId(ctx.customer.nationalId),
    "customer.phone": formatPhone(ctx.customer.phone),
    "customer.city": ctx.customer.city,
    "vehicle.make": ctx.vehicle.make,
    "vehicle.model": ctx.vehicle.model,
    "vehicle.year": String(ctx.vehicle.year),
    "vehicle.color": ctx.vehicle.color,
    "vehicle.plate": `${ctx.vehicle.plateAr} | ${ctx.vehicle.plateEn}`,
    "vehicle.vin": ctx.vehicle.vin,
    "contract.vehiclePrice": formatAmount(ctx.terms.vehiclePrice),
    "contract.downPayment": formatAmount(ctx.terms.downPayment),
    "contract.upfrontFee": formatAmount(ctx.terms.upfrontFee),
    "contract.financedAmount": formatAmount(ctx.terms.financedAmount),
    "contract.vat": formatAmount(ctx.terms.vat),
    "contract.totalPayable": formatAmount(ctx.terms.totalPayable),
    "contract.months": String(ctx.terms.months),
    "contract.installment": formatAmount(ctx.terms.installment),
    "contract.lastInstallment": formatAmount(ctx.terms.lastInstallment),
    "contract.firstDueDate": formatDate(ctx.firstDueDate),
    "contract.endDate": formatDate(ctx.endDate),
  };
}
