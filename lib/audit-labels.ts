import type { AuditEntry, Severity } from "@/types/domain";

export const AUDIT_SEVERITY_STYLE: Record<Severity, string> = {
  info: "bg-neutral-soft text-muted",
  warning: "bg-warning-soft text-warning",
  critical: "bg-danger-soft text-danger",
};

export const AUDIT_SEVERITY_LABEL: Record<Severity, string> = {
  info: "معلومة",
  warning: "تحذير",
  critical: "حرج",
};

export const AUDIT_ENTITY_LABEL: Record<AuditEntry["entity"], string> = {
  contract: "عقد",
  payment: "دفعة",
  vehicle: "سيارة",
  customer: "عميل",
  user: "حساب",
  settings: "إعدادات",
  notification: "تنبيه",
};

export const AUDIT_ACTION_LABEL: Record<string, string> = {
  "contract.created": "إنشاء عقد",
  "contract.approved": "اعتماد عقد",
  "contract.handover": "تسليم العقد",
  "contract.owned": "تمليك السيارة",
  "contract.terminated": "إنهاء العقد",
  "vehicle.reserved": "حجز سيارة",
  "vehicle.contracted": "ربط سيارة بعقد",
  "vehicle.created": "إضافة سيارة",
  "vehicle.ready": "إتاحة سيارة",
  "customer.created": "إنشاء ملف عميل",
  "customer.updated": "تحديث بيانات عميل",
  "customer.profile_updated": "تحديث الملف الشخصي",
  "customer.approved": "اعتماد حساب عميل",
  "customer.rejected": "رفض حساب عميل",
  "customer.review_requested": "إرسال حساب عميل للمراجعة",
  "customer.enabled": "تفعيل حساب عميل",
  "customer.disabled": "تعطيل حساب عميل",
  "customer.deleted": "حذف ملف عميل",
  "user.created": "إنشاء حساب موظف",
  "user.updated": "تحديث حساب موظف",
  "user.profile_updated": "تحديث الملف الشخصي",
  "user.approved": "اعتماد حساب موظف",
  "user.rejected": "رفض حساب موظف",
  "user.review_requested": "إرسال حساب موظف للمراجعة",
  "user.enabled": "تفعيل حساب موظف",
  "user.disabled": "تعطيل حساب موظف",
  "user.deleted": "حذف حساب موظف",
  "user.delete_blocked": "منع حذف حساب موظف",
  "customer.delete_blocked": "منع حذف ملف عميل",
  "payment.recorded": "تسجيل دفعة",
  "notification.read": "تمييز تنبيه كمقروء",
  "notification.read_all": "تحديد التنبيهات كمقروءة",
  "settings.alerts": "تحديث إعدادات التنبيهات",
};

export function auditActionLabel(action: string): string {
  return AUDIT_ACTION_LABEL[action] ?? "عملية مسجلة";
}
