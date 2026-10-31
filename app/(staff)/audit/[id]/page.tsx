"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight, Clock3, ExternalLink, Fingerprint, ShieldAlert, UserRound } from "lucide-react";
import { toast } from "sonner";
import { auditActionLabel, AUDIT_ENTITY_LABEL, AUDIT_SEVERITY_LABEL, AUDIT_SEVERITY_STYLE } from "@/lib/audit-labels";
import { can } from "@/lib/permissions";
import { ROLE_LABEL, useSession } from "@/lib/session";
import { Button, Card, Fade } from "@/components/ui/basics";
import { cn } from "@/lib/utils";
import type { AuditEntry } from "@/types/domain";
import { formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { statusLabel } from "@/components/ui/basics";

type AuditDatabase = NonNullable<ReturnType<typeof useSession>["db"]>;
type RelatedDetails = { href: string; label: string; values: { label: string; value: string }[] };

function relatedDetails(entry: AuditEntry, db: AuditDatabase): RelatedDetails | null {
  if (entry.entity === "contract") {
    const contract = db.contracts.find((item) => item.id === entry.entityId);
    if (!contract) return null;
    const customer = db.customers.find((item) => item.id === contract.customerId);
    const vehicle = db.vehicles.find((item) => item.id === contract.vehicleId);
    return {
      href: `/contracts/${encodeURIComponent(contract.id)}`,
      label: contract.number,
      values: [
        { label: "حالة العقد", value: statusLabel(contract.status) },
        { label: "العميل", value: customer?.fullName ?? contract.customerId },
        { label: "السيارة", value: vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year}` : contract.vehicleId },
        { label: "قيمة السيارة", value: formatMoney(contract.vehiclePrice) },
        { label: "القسط الشهري", value: formatMoney(contract.installmentAmount) },
        { label: "عدد الأقساط", value: String(contract.months) },
      ],
    };
  }
  if (entry.entity === "vehicle") {
    const vehicle = db.vehicles.find((item) => item.id === entry.entityId);
    if (!vehicle) return null;
    return {
      href: `/vehicles/${encodeURIComponent(vehicle.id)}`,
      label: `${vehicle.make} ${vehicle.model} ${vehicle.year}`,
      values: [
        { label: "الحالة", value: statusLabel(vehicle.status) },
        { label: "اللوحة", value: `${vehicle.plateAr} · ${vehicle.plateEn}` },
        { label: "اللون", value: vehicle.color },
        { label: "سعر البيع", value: formatMoney(vehicle.listPrice) },
        { label: "قراءة العداد", value: `${vehicle.mileage.toLocaleString("ar-SA")} كم` },
      ],
    };
  }
  if (entry.entity === "customer") {
    const customer = db.customers.find((item) => item.id === entry.entityId);
    if (!customer) return null;
    return {
      href: `/customers/${encodeURIComponent(customer.id)}`,
      label: customer.fullName,
      values: [
        { label: "المدينة", value: customer.city },
        { label: "رقم الجوال", value: formatPhone(customer.phone) },
        { label: "البريد الإلكتروني", value: customer.email ?? "غير مضاف" },
        { label: "حالة الحساب", value: customer.portalEnabled === false ? "موقوف" : "نشط" },
      ],
    };
  }
  if (entry.entity === "user") {
    const user = db.users.find((item) => item.id === entry.entityId);
    if (!user) return null;
    return {
      href: "/accounts",
      label: user.name,
      values: [
        { label: "الدور الوظيفي", value: ROLE_LABEL[user.role] },
        { label: "البريد الإلكتروني", value: user.email },
        { label: "حالة الدخول", value: user.active ? "نشط" : "معطل" },
      ],
    };
  }
  if (entry.entity === "payment") {
    for (const contract of db.contracts) {
      const payment = contract.payments.find((item) => item.id === entry.entityId);
      if (!payment) continue;
      return {
        href: `/contracts/${encodeURIComponent(contract.id)}`,
        label: payment.receiptNo,
        values: [
          { label: "رقم العقد", value: contract.number },
          { label: "نوع الدفعة", value: payment.type === "down" ? "دفعة مقدمة" : payment.type === "contract_fee" ? "مقدم توقيع" : payment.type === "settlement" ? "تسوية" : "قسط" },
          { label: "المبلغ", value: formatMoney(payment.amount) },
          { label: "طريقة الدفع", value: payment.method === "bank_transfer" ? "تحويل بنكي" : payment.method === "sadad" ? "سداد" : payment.method === "mada" ? "مدى" : "نقداً" },
          { label: "تاريخ الدفع", value: formatDateTime(payment.paidAt) },
        ],
      };
    }
    return null;
  }
  if (entry.entity === "notification") return { href: "/notifications", label: entry.entityId, values: [] };
  return null;
}

export default function AuditDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { db, role } = useSession();

  useEffect(() => {
    if (db && role && !can(role, "audit.view")) router.replace("/dashboard");
  }, [db, role, router]);

  if (!db || !can(role, "audit.view")) return null;

  const entry = db.audit.find((item) => item.id === id);
  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Link href="/audit" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><ArrowRight size={16} /> العودة لسجل التدقيق</Link>
        <Card className="space-y-3 text-center">
          <ShieldAlert className="mx-auto text-warning" size={28} />
          <h1 className="text-xl font-bold">تعذر العثور على الحدث</h1>
          <p className="text-sm text-muted">قد يكون السجل انتهت مدة الاحتفاظ به أو لم يعد موجوداً في مساحة العرض الحالية.</p>
        </Card>
      </div>
    );
  }

  const actor = db.users.find((user) => user.id === entry.userId);
  const customerActor = db.customers.find((customer) => customer.id === entry.userId);
  const actorName = entry.actorName ?? actor?.name ?? customerActor?.fullName ?? entry.userId;
  const level = entry.severity ?? "info";
  const related = relatedDetails(entry, db);

  const copyIdentifier = async () => {
    try {
      await navigator.clipboard.writeText(entry.id);
      toast.success("تم نسخ معرّف الحدث");
    } catch (error) {
      console.error("Could not copy audit event id", error);
      toast.error("تعذر نسخ المعرّف؛ يمكنك تحديده ونسخه يدوياً");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/audit" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand"><ArrowRight size={16} /> العودة لسجل التدقيق</Link>
          <h1 className="text-2xl font-bold">تفاصيل حدث التدقيق</h1>
          <p className="mt-1 text-sm text-muted">معلومات الحدث كما سُجلت في سجل النظام.</p>
        </div>
        <span className={cn("rounded-full px-3 py-1.5 text-xs font-bold", AUDIT_SEVERITY_STYLE[level])}>{AUDIT_SEVERITY_LABEL[level]}</span>
      </Fade>

      <Card className="space-y-5">
        <div className="flex items-start gap-3 border-b border-line pb-4">
          <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", AUDIT_SEVERITY_STYLE[level])}>
            {level === "critical" || level === "warning" ? <ShieldAlert size={20} /> : <Clock3 size={20} />}
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{auditActionLabel(entry.action)}</h2>
            <p className="mt-1 text-sm text-muted">{entry.details || "لم تُسجل تفاصيل إضافية لهذا الحدث."}</p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Detail icon={<Clock3 size={16} />} label="التاريخ والوقت" value={formatDateTime(entry.at)} />
          <Detail icon={<UserRound size={16} />} label="المنفذ" value={actorName} />
          <Detail icon={<ShieldAlert size={16} />} label="دور المنفذ" value={entry.actorRole ? ROLE_LABEL[entry.actorRole] : actor ? ROLE_LABEL[actor.role] : customerActor ? ROLE_LABEL.customer : "غير محدد"} />
          <Detail icon={<Fingerprint size={16} />} label="نوع السجل" value={AUDIT_ENTITY_LABEL[entry.entity]} />
          <Detail icon={<Fingerprint size={16} />} label="معرّف العنصر" value={entry.entityId} ltr />
          <Detail icon={<Fingerprint size={16} />} label="الإجراء" value={auditActionLabel(entry.action)} />
          <Detail icon={<Fingerprint size={16} />} label="معرّف الحدث" value={entry.id} ltr />
        </div>

        {related && (
          <section className="space-y-4 rounded-2xl border border-line bg-surface-2/60 p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h3 className="font-bold">بيانات العنصر المرتبط</h3><p className="mt-1 text-sm text-muted">{related.label}</p></div>
              <Link href={related.href} className="inline-flex items-center gap-2 rounded-xl border border-brand/30 bg-brand-soft/40 px-4 py-2.5 text-sm font-semibold text-brand transition hover:bg-brand-soft">
                <ExternalLink size={16} /> فتح {AUDIT_ENTITY_LABEL[entry.entity]} المرتبط
              </Link>
            </div>
            {related.values.length > 0 && <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {related.values.map((item) => <Detail key={item.label} label={item.label} value={item.value} />)}
            </div>}
          </section>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <p className="text-xs leading-5 text-muted">لا تتضمن بعض الأحداث تفاصيل القيم السابقة والجديدة؛ تُعرض هنا البيانات المسجلة للحدث ومعرّف العنصر المرتبط.</p>
          <Button type="button" variant="outline" onClick={copyIdentifier}><Fingerprint size={15} /> نسخ معرّف الحدث</Button>
        </div>
      </Card>
    </div>
  );
}

function Detail({ icon, label, value, ltr = false }: { icon?: React.ReactNode; label: string; value: string; ltr?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl bg-surface-2 p-3">
      <p className="flex items-center gap-2 text-xs text-muted">{icon}{label}</p>
      <p className={cn("mt-2 break-words text-sm font-semibold", ltr && "num text-start")} dir={ltr ? "ltr" : undefined}>{value}</p>
    </div>
  );
}
