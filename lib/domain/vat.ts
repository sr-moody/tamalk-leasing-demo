import { round2 } from "./money";

export const DEFAULT_VAT_RATE = 0.15;

/** ضريبة القيمة المضافة على مبلغ */
export const calcVat = (amount: number, rate: number = DEFAULT_VAT_RATE): number => round2(amount * rate);

/** فصل الضريبة من مبلغ شامل */
export const splitVatInclusive = (gross: number, rate: number = DEFAULT_VAT_RATE) => {
  const net = round2(gross / (1 + rate));
  return { net, vat: round2(gross - net) };
};
