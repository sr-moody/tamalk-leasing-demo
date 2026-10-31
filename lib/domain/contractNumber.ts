import { appConfig } from "@/lib/config";

const pad5 = (n: number): string => String(n).padStart(5, "0");

/** `MLK-2026-00042` */
export const formatContractNumber = (year: number, seq: number, prefix: string = appConfig.contractPrefix): string =>
  `${prefix}-${year}-${pad5(seq)}`;

/** `RCPT-2026-00042` */
export const formatReceiptNumber = (year: number, seq: number, prefix: string = appConfig.receiptPrefix): string =>
  `${prefix}-${year}-${pad5(seq)}`;

/** الرقم التسلسلي التالي بناءً على الأرقام الموجودة لنفس السنة */
export function nextSequence(existing: string[], year: number, prefix: string): number {
  const re = new RegExp(`^${prefix}-${year}-(\\d{5})$`);
  return existing.reduce((max, n) => {
    const m = re.exec(n);
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0) + 1;
}
