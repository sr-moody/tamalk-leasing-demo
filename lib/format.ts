import { t } from "@/lib/i18n";
import { daysBetween, parseDate, type ISODate } from "@/lib/domain/dates";

const moneyFmt = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const compactFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const numberFmt = new Intl.NumberFormat("en-US");

/** `12,450.00` */
export const formatAmount = (n: number): string => moneyFmt.format(n);

/** `12,450.00 ر.س` */
export const formatMoney = (n: number): string => `${moneyFmt.format(n)} ${t("common.currency")}`;

/** `12,450 ر.س` — للأرقام الكبيرة في الداشبورد */
export const formatMoneyShort = (n: number): string => `${compactFmt.format(Math.round(n))} ${t("common.currency")}`;

/** `1.2M` / `450K` للمحاور */
export const formatCompact = (n: number): string =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const formatNumber = (n: number): string => numberFmt.format(n);

export const formatPercent = (ratio: number, digits = 0): string => `${(ratio * 100).toFixed(digits)}%`;

const toDate = (d: string | Date): Date => (typeof d === "string" ? (d.length === 10 ? parseDate(d) : new Date(d)) : d);

const dateFmt = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", { day: "numeric", month: "long", year: "numeric" });
const dateShortFmt = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", { day: "numeric", month: "short" });
const monthFmt = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", { month: "short" });
const monthYearFmt = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", { month: "long", year: "numeric" });
const weekdayFmt = new Intl.DateTimeFormat("ar-u-ca-gregory-nu-latn", { weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("ar-SA-u-ca-gregory-nu-latn", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  dayPeriod: "short",
});
const hijriFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "long", year: "numeric" });

/** `26 أكتوبر 2026` */
export const formatDate = (d: string | Date): string => dateFmt.format(toDate(d));
/** `26 أكتوبر` */
export const formatDateShort = (d: string | Date): string => dateShortFmt.format(toDate(d));
export const formatMonth = (d: string | Date): string => monthFmt.format(toDate(d));
export const formatMonthYear = (d: string | Date): string => monthYearFmt.format(toDate(d));
export const formatWeekday = (d: string | Date): string => weekdayFmt.format(toDate(d));
export const formatTime = (d: string | Date): string =>
  timeFmt.formatToParts(toDate(d))
    .map((part) => part.type === "dayPeriod" ? (part.value.startsWith("ص") ? "ص" : "م") : part.value)
    .join("");
/** `26 أكتوبر 2026، 6:49 م` */
export const formatDateTime = (d: string | Date): string => `${formatDate(d)}، ${formatTime(d)}`;
/** `15 جمادى الأولى 1448 هـ` */
export const formatHijri = (d: string | Date): string => hijriFmt.format(toDate(d));

/** نص نسبي: اليوم / غداً / بعد 3 أيام / منذ 4 أيام */
export function formatRelativeDay(target: ISODate, today: ISODate): string {
  const diff = daysBetween(today, target);
  if (diff === 0) return t("common.today");
  if (diff === 1) return t("common.tomorrow");
  if (diff === -1) return t("common.yesterday");
  if (diff === 2) return t("common.inTwoDays");
  if (diff > 0) return t("common.inDays", { n: diff });
  return t("common.daysAgo", { n: Math.abs(diff) });
}

/** `+966 55 123 4567` */
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const local = digits.startsWith("966") ? digits.slice(3) : digits.replace(/^0/, "");
  if (local.length !== 9) return phone;
  return `+966 ${local.slice(0, 2)} ${local.slice(2, 5)} ${local.slice(5)}`;
}

/** تحويل 05XXXXXXXX إلى +9665XXXXXXXX */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("966")) return `+${digits}`;
  return `+966${digits.replace(/^0/, "")}`;
}

/** رابط واتساب */
export const whatsappLink = (phone: string, text?: string): string =>
  `https://wa.me/${normalizePhone(phone).slice(1)}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

export const telLink = (phone: string): string => `tel:${normalizePhone(phone)}`;

/** `1•••••••45` */
export function maskNationalId(id: string): string {
  if (id.length < 4) return id;
  return `${id[0]}${"•".repeat(id.length - 3)}${id.slice(-2)}`;
}

/** `1234 567 890` لعرض الهوية كاملة */
export const formatNationalId = (id: string): string => id.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");

export const formatKm = (n: number): string => `${numberFmt.format(n)} ${t("common.km")}`;

/** الحرف الأول من الاسم للأفاتار (الحروف العربية المنفصلة لا تُقرأ جيداً كاختصار من حرفين) */
export const initials = (name: string): string => name.trim().charAt(0);
