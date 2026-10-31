"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BriefcaseBusiness, CreditCard, FileText, Pencil, UserRound } from "lucide-react";
import { Button, Card, Dialog, Fade, Field, inputCls, Select } from "@/components/ui/basics";
import { formatAmount, formatDateShort, formatMoney, formatPhone, maskNationalId } from "@/lib/format";
import { getCustomerSummary } from "@/lib/domain/balances";
import { todayISO } from "@/lib/domain/dates";
import { useSession } from "@/lib/session";
import { CITIES } from "@/mocks/data/catalog";
import { cn } from "@/lib/utils";
import { appendAudit } from "@/lib/audit";

const DOCUMENT_LABELS: Record<string, string> = {
  national_id: "الهوية الوطنية",
  license: "رخصة القيادة",
  salary_certificate: "تعريف بالراتب",
  bank_statement: "كشف حساب بنكي",
};

const CHANNEL_LABELS: Record<string, string> = {
  call: "مكالمة",
  whatsapp: "واتساب",
  visit: "زيارة",
  sms: "رسالة نصية",
  note: "ملاحظة",
};

export default function PortalAccountPage() {
  const { db, customerId, update } = useSession();
  const [editing, setEditing] = useState(false);
  if (!db || !customerId) return null;
  const customer = db.customers.find((item) => item.id === customerId);
  if (!customer) return null;

  const contracts = db.contracts.filter((contract) => contract.customerId === customer.id);
  const summary = getCustomerSummary(contracts, todayISO());
  const payments = contracts.flatMap((contract) => contract.payments.map((payment) => ({ ...payment, contractNumber: contract.number })))
    .sort((a, b) => b.paidAt.localeCompare(a.paidAt));

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fullName = String(form.get("fullName") ?? "").trim().replace(/\s+/g, " ");
    const phone = String(form.get("phone") ?? "").replace(/\s/g, "");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const city = String(form.get("city") ?? "");
    if (fullName.length < 3 || !/^\+9665\d{8}$/.test(phone) || !CITIES.some((item) => item === city)) {
      toast.error("تحقق من الاسم ورقم الجوال والمدينة");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("أدخل بريداً إلكترونياً صحيحاً");
      return;
    }
    let saved = false;
    update((current) => {
      const record = current.customers.find((item) => item.id === customer.id);
      if (!record || current.customers.some((item) => item.id !== record.id && (item.phone === phone || (email && item.email?.toLowerCase() === email)))) return;
      record.fullName = fullName;
      record.phone = phone;
      record.email = email || undefined;
      record.city = city;
      record.employer = String(form.get("employer") ?? "").trim() || undefined;
      appendAudit(current, {
        userId: customer.id,
        actorRole: "customer",
        action: "customer.profile_updated",
        entity: "customer",
        entityId: customer.id,
        details: "تحديث بيانات الحساب من بوابة العميل",
        severity: "warning",
      }, "customer");
      saved = true;
    });
    if (!saved) {
      toast.error("رقم الجوال أو البريد الإلكتروني مستخدم في حساب آخر");
      return;
    }
    setEditing(false);
    toast.success("تم تحديث بيانات حسابك");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm text-muted">ملفك الشخصي</p><h1 className="mt-1 text-2xl font-bold">حسابي</h1><p className="mt-1 text-sm text-muted">بياناتك وعقودك والمدفوعات المسجلة على حسابك.</p></div>
        <Button type="button" variant="outline" onClick={() => setEditing(true)}><Pencil size={16} /> تعديل بياناتي</Button>
      </Fade>

      <Card className="flex flex-wrap items-center gap-4 sm:p-7">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-ink text-2xl font-bold text-white">{customer.fullName.charAt(0)}</span>
        <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">{customer.fullName}</h2><p className="mt-1 text-sm text-muted">{customer.city} · <span className="num" dir="ltr">{formatPhone(customer.phone)}</span></p></div>
        <span className={cn("rounded-full px-3 py-1.5 text-xs font-semibold", customer.portalEnabled === false ? "bg-danger-soft text-danger" : "bg-success-soft text-success")}>{customer.portalEnabled === false ? "الوصول موقوف" : "حساب العميل"}</span>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<BriefcaseBusiness size={18} />} label="العقود" value={String(contracts.length)} />
        <Metric icon={<CreditCard size={18} />} label="إجمالي المدفوع" value={formatMoney(summary.paid)} />
        <Metric icon={<FileText size={18} />} label="المتبقي" value={formatMoney(summary.remaining)} />
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center gap-2"><UserRound size={18} className="text-brand" /><h2 className="font-bold">البيانات الشخصية</h2></div>
          <Info label="الاسم الكامل" value={customer.fullName} />
          <Info label="رقم الهوية" value={maskNationalId(customer.nationalId)} />
          <Info label="الجوال" value={formatPhone(customer.phone)} />
          <Info label="البريد الإلكتروني" value={customer.email || "غير مضاف"} />
          <Info label="المدينة" value={customer.city} />
          <Info label="جهة العمل" value={customer.employer || "غير مضافة"} />
          <Info label="الدخل الشهري" value={customer.monthlyIncome ? `${formatAmount(customer.monthlyIncome)} ر.س` : "غير مضاف"} />
          <p className="border-t border-line pt-3 text-xs leading-5 text-muted">تعديل رقم الهوية أو المستندات يتطلب مراجعة الإدارة للحفاظ على تطابقها مع العقود.</p>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-bold">آخر المدفوعات</h2>
          {payments.length ? payments.slice(0, 8).map((payment) => (
            <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
              <div><p className="num font-semibold">{formatMoney(payment.amount)}</p><p className="mt-1 text-xs text-muted">عقد {payment.contractNumber} · {payment.receiptNo}</p></div>
              <div className="text-end"><p className="num text-xs text-muted">{formatDateShort(payment.paidAt.slice(0, 10))}</p>{payment.reversed && <p className="mt-1 text-xs text-danger">معكوسة</p>}</div>
            </div>
          )) : <p className="py-4 text-sm text-muted">لا توجد دفعات مسجلة.</p>}
        </Card>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-2">
        <Card className="space-y-3">
          <div className="flex items-center gap-2"><FileText size={18} className="text-brand" /><h2 className="font-bold">المستندات المسجلة</h2></div>
          {customer.documents.length ? customer.documents.map((document) => (
            <div key={document.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3 last:border-0 last:pb-0">
              <div><p className="text-sm font-medium">{DOCUMENT_LABELS[document.type] ?? "مستند"}</p><p className="mt-1 text-xs text-muted">أضيف في {formatDateShort(document.uploadedAt.slice(0, 10))}</p></div>
              <span className="text-xs text-muted">{document.expiresAt ? `ينتهي ${formatDateShort(document.expiresAt)}` : "لا يوجد تاريخ انتهاء"}</span>
            </div>
          )) : <p className="py-3 text-sm text-muted">لا توجد مستندات مسجلة.</p>}
          <p className="border-t border-line pt-3 text-xs leading-5 text-muted">المستندات المعروضة بياناتها فقط؛ رفع الملفات وتعديلها يتطلب مراجعة الإدارة.</p>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-bold">آخر التواصلات</h2>
          {customer.communications.length ? [...customer.communications].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5).map((entry) => (
            <div key={entry.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
              <div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-brand">{CHANNEL_LABELS[entry.channel] ?? "تواصل"}</span><span className="num text-xs text-muted">{formatDateShort(entry.at.slice(0, 10))}</span></div>
              <p className="mt-1 text-sm leading-5">{entry.text}</p>
            </div>
          )) : <p className="py-3 text-sm text-muted">لا توجد تواصلات مسجلة.</p>}
        </Card>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="تعديل بيانات الحساب">
        <form onSubmit={saveProfile} className="max-h-[75vh] space-y-4 overflow-y-auto">
          <Field label="الاسم الكامل">
            <input required minLength={3} name="fullName" defaultValue={customer.fullName} className={inputCls} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="رقم الجوال">
              <input required type="tel" name="phone" defaultValue={customer.phone} className={cn(inputCls, "num")} dir="ltr" />
            </Field>
            <Field label="البريد الإلكتروني">
              <input type="email" name="email" defaultValue={customer.email ?? ""} className={inputCls} dir="ltr" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="المدينة">
              <Select name="city" defaultValue={customer.city}>{CITIES.map((city) => <option key={city} value={city}>{city}</option>)}</Select>
            </Field>
            <Field label="جهة العمل">
              <input name="employer" defaultValue={customer.employer ?? ""} className={inputCls} />
            </Field>
          </div>
          <div className="flex justify-end gap-2 border-t border-line pt-3">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>إلغاء</Button>
            <Button type="submit"><Pencil size={15} /> حفظ التغييرات</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand">{icon}</span><div><p className="text-xs text-muted">{label}</p><p className="num mt-1 font-bold">{value}</p></div></Card>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3 border-b border-line pb-3 text-sm last:border-0 last:pb-0"><span className="text-muted">{label}</span><span className="min-w-0 break-all text-end font-semibold">{value}</span></div>;
}
