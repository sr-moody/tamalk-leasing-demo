"use client";

import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { BriefcaseBusiness, CreditCard, FileText, Pencil, ShieldCheck, UserRound } from "lucide-react";
import { Button, Card, Dialog, Fade, Field, inputCls } from "@/components/ui/basics";
import { formatDateShort, formatDateTime, formatPhone, formatMoney } from "@/lib/format";
import { ROLE_LABEL, useSession } from "@/lib/session";
import type { StaffRole } from "@/types/domain";
import { appendAudit } from "@/lib/audit";
import { auditActionLabel, AUDIT_ENTITY_LABEL } from "@/lib/audit-labels";

export default function StaffAccountPage() {
  const { db, role, update } = useSession();
  const [editing, setEditing] = useState(false);
  if (!db || !role || role === "customer") return null;

  const profile = db.users.find((user) => user.role === role && user.active) ??
    db.users.find((user) => user.role === role);
  if (!profile) {
    return <Card className="mx-auto max-w-3xl text-sm text-muted">لا يوجد ملف موظف مرتبط بهذا الدور بعد. يمكن للإدارة إنشاء حساب ومراجعته من مركز الحسابات.</Card>;
  }
  const contracts = db.contracts.filter((contract) => contract.createdBy === profile.id);
  const payments = db.contracts.flatMap((contract) => contract.payments.filter((payment) => payment.createdBy === profile.id));
  const recentActivity = db.audit.filter((entry) => entry.userId === profile.id).slice(0, 8);

  const saveProfile = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const phone = String(form.get("phone") ?? "").trim();
    if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[0-9]{9,15}$/.test(phone)) {
      toast.error("تحقق من الاسم والبريد الإلكتروني ورقم الجوال");
      return;
    }
    let updated = false;
    update((current) => {
      const user = current.users.find((item) => item.id === profile.id);
      if (!user || current.users.some((item) => item.id !== user.id && item.email.toLowerCase() === email)) return;
      user.name = name;
      user.email = email;
      user.phone = phone;
      appendAudit(current, {
        userId: profile.id,
        actorRole: role,
        action: "user.profile_updated",
        entity: "user",
        entityId: profile.id,
        details: "تحديث بيانات الملف الشخصي للموظف",
        severity: "warning",
      }, role);
      updated = true;
    });
    if (!updated) {
      toast.error("البريد الإلكتروني مستخدم أو تعذر حفظ البيانات");
      return;
    }
    setEditing(false);
    toast.success("تم تحديث ملفك الشخصي");
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Fade className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-sm text-muted">الملف الوظيفي</p><h1 className="mt-1 text-2xl font-bold">حسابي</h1><p className="mt-1 text-sm text-muted">بيانات الحساب والعمليات المسجلة في مساحة العرض الحالية.</p></div>
        <Button type="button" variant="outline" onClick={() => setEditing(true)}><Pencil size={16} /> تعديل بياناتي</Button>
      </Fade>

      <Card className="flex flex-wrap items-center gap-4 sm:p-7">
        <span className="grid h-16 w-16 place-items-center rounded-2xl bg-ink text-2xl font-bold text-white">{profile.name.charAt(0)}</span>
        <div className="min-w-0 flex-1"><h2 className="text-xl font-bold">{profile.name}</h2><p className="mt-1 text-sm text-muted">{ROLE_LABEL[profile.role]} · {profile.email}</p><p className="num mt-1 text-end text-sm text-muted" dir="ltr">{formatPhone(profile.phone)}</p></div>
        <span className={profile.active ? "inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1.5 text-xs font-semibold text-success" : "inline-flex items-center gap-1.5 rounded-full bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger"}><ShieldCheck size={14} /> {profile.active ? "حساب نشط" : "حساب معطل"}</span>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Metric icon={<BriefcaseBusiness size={18} />} label="العقود التي أنشأتها" value={String(contracts.length)} />
        <Metric icon={<CreditCard size={18} />} label="الدفعات المسجلة" value={String(payments.length)} />
        <Metric icon={<FileText size={18} />} label="قيمة الدفعات" value={formatMoney(payments.reduce((sum, payment) => sum + (payment.reversed ? 0 : payment.amount), 0))} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="space-y-4">
          <div className="flex items-center gap-2"><UserRound size={18} className="text-brand" /><h2 className="font-bold">بيانات الموظف</h2></div>
          <Info label="الاسم" value={profile.name} />
          <Info label="البريد الإلكتروني" value={profile.email} />
          <Info label="الجوال" value={formatPhone(profile.phone)} ltr />
          <Info label="الدور" value={ROLE_LABEL[profile.role as StaffRole]} />
          <Info label="آخر دخول تجريبي" value={profile.lastLoginAt ? formatDateShort(profile.lastLoginAt.slice(0, 10)) : "غير مسجل"} />
          <p className="border-t border-line pt-3 text-xs leading-5 text-muted">تسجيل الدخول في هذه النسخة تجريبي حسب الدور، ولا يثبت هوية موظف بعينه. يلزم ربط مزود مصادقة قبل استخدام هذه البيانات كحسابات إنتاجية.</p>
        </Card>
        <Card className="space-y-3">
          <h2 className="font-bold">آخر العمليات المسجلة</h2>
          {recentActivity.length ? recentActivity.map((entry) => (
            <div key={entry.id} className="flex items-start justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
              <div><p className="text-sm font-medium">{auditActionLabel(entry.action)}</p><p className="mt-1 text-xs text-muted">{entry.details ?? AUDIT_ENTITY_LABEL[entry.entity]}</p></div>
              <time className="num shrink-0 text-xs text-muted" dateTime={entry.at}>{formatDateTime(entry.at)}</time>
            </div>
          )) : <p className="py-4 text-sm text-muted">لا توجد عمليات مسجلة مرتبطة بهذا الملف بعد.</p>}
        </Card>
      </div>

      <Dialog open={editing} onClose={() => setEditing(false)} title="تعديل بياناتي">
        <form onSubmit={saveProfile} className="space-y-4">
          <Field label="الاسم الكامل">
            <input required minLength={3} name="name" defaultValue={profile.name} className={inputCls} />
          </Field>
          <Field label="البريد الإلكتروني">
            <input required type="email" name="email" defaultValue={profile.email} className={inputCls} dir="ltr" />
          </Field>
          <Field label="رقم الجوال">
            <input required type="tel" name="phone" defaultValue={profile.phone} className={`${inputCls} num`} dir="ltr" />
          </Field>
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

function Info({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return <div className="flex items-center justify-between gap-3 border-b border-line pb-3 text-sm last:border-0 last:pb-0"><span className="text-muted">{label}</span><span className="min-w-0 break-all text-end font-semibold" dir={ltr ? "ltr" : undefined}>{value}</span></div>;
}
