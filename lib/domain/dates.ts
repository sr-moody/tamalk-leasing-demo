import { addMonths, differenceInCalendarDays, format, parseISO, startOfDay } from "date-fns";

/** تاريخ بصيغة YYYY-MM-DD */
export type ISODate = string;

export const toISODate = (d: Date): ISODate => format(d, "yyyy-MM-dd");

export const parseDate = (iso: string): Date => startOfDay(parseISO(iso));

export const todayISO = (now: Date = new Date()): ISODate => toISODate(startOfDay(now));

/** إضافة أيام لتاريخ ISO */
export const addDaysISO = (iso: ISODate, days: number): ISODate => {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
};

/** إضافة أشهر بدون تجاوز نهاية الشهر (31 يناير + 1 = 28/29 فبراير) */
export const addMonthsISO = (iso: ISODate, months: number): ISODate => toISODate(addMonths(parseDate(iso), months));

/** عدد الأيام من a إلى b (b − a) */
export const daysBetween = (a: ISODate, b: ISODate): number =>
  differenceInCalendarDays(parseDate(b), parseDate(a));

export const isSameMonth = (a: ISODate, b: ISODate): boolean => a.slice(0, 7) === b.slice(0, 7);
