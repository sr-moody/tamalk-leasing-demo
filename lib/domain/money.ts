/** كل العمليات المالية تتم بالهللات (أعداد صحيحة) لتفادي أخطاء الكسور العشرية. */

export const toHalalas = (riyals: number): number => Math.round(riyals * 100);
export const toRiyals = (halalas: number): number => halalas / 100;

/** تقريب لمنزلتين عشريتين */
export const round2 = (n: number): number => toRiyals(toHalalas(n));

export const sum = (values: number[]): number => toRiyals(values.reduce((acc, v) => acc + toHalalas(v), 0));

export const sub = (a: number, b: number): number => toRiyals(toHalalas(a) - toHalalas(b));

export const add = (a: number, b: number): number => toRiyals(toHalalas(a) + toHalalas(b));

export const minMoney = (a: number, b: number): number => (toHalalas(a) <= toHalalas(b) ? a : b);

export const isZero = (n: number): boolean => toHalalas(n) === 0;
