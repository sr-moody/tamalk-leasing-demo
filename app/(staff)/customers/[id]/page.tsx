"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileText } from "lucide-react";
import type { DocumentType } from "@/types/domain";
import { getContractBalances, getCustomerSummary } from "@/lib/domain/balances";
import { daysBetween, todayISO } from "@/lib/domain/dates";
import { useSession } from "@/lib/session";
import { formatAmount, formatDateShort, formatMoney, formatPhone, maskNationalId } from "@/lib/format";
import { Card, Fade, PaymentRing, Stat, StatusBadge } from "@/components/ui/basics";
import { cn } from "@/lib/utils";

const DOC: Record<DocumentType, string> = { national_id: "الهوية الوطنية", license: "رخصة القيادة", salary_certificate: "تعريف بالراتب", bank_statement: "كشف حساب" };

export default function CustomerPage() {
  const { id } = useParams<{ id: string }>();
  const { db } = useSession();
  if (!db) return null;
  const c = db.customers.find((x) => x.id === id);
  if (!c) return <p className="text-muted">العميل غير موجود</p>;
  const today = todayISO();
  const contracts = db.contracts.filter((x) => x.customerId === c.id);
  const s = getCustomerSummary(contracts, today);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade className="flex items-center gap-4">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-ink text-2xl font-bold text-white">{c.fullName.charAt(0)}</span>
        <div>
          <h1 className="text-2xl font-bold">{c.fullName}</h1>
          <p className="text-sm text-muted">{c.city} · {c.idType === "citizen" ? "مواطن" : "مقيم"} · <span className="num" dir="ltr">{formatPhone(c.phone)}</span></p>
        </div>
      </Fade>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="رقم الهوية" value={maskNationalId(c.nationalId)} />
        <Stat label="جهة العمل" value={c.employer ?? "—"} sub={c.monthlyIncome ? `دخل ${formatAmount(c.monthlyIncome)} ر.س` : undefined} />
        <Stat label="المدفوع" value={formatMoney(s.paid)} />
        <Stat label="المتبقي" value={formatMoney(s.remaining)} accent />
      </div>
      <h2 className="text-lg font-bold">العقود ({contracts.length})</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {contracts.map((ct) => {
          const b = getContractBalances(ct, today);
          const v = db.vehicles.find((x) => x.id === ct.vehicleId);
          return (
            <Link key={ct.id} href={`/contracts/${ct.id}`} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:border-brand">
              <PaymentRing progress={b.progress} remaining={b.remaining} size={110} stroke={9} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><span className="num font-bold text-brand">{ct.number}</span><StatusBadge status={ct.status} /></div>
                <p className="mt-1 text-sm">{v?.make} {v?.model} {v?.year}</p>
                <p className="num text-xs text-muted">مدفوع {formatAmount(b.paid)} · {ct.months} شهر</p>
              </div>
            </Link>
          );
        })}
      </div>
      <h2 className="text-lg font-bold">المستندات</h2>
      <Card className="divide-y divide-line p-0">
        {c.documents.map((d) => {
          const days = d.expiresAt ? daysBetween(today, d.expiresAt) : null;
          const cls = days === null ? "bg-neutral-soft text-muted" : days < 0 ? "bg-danger-soft text-danger" : days <= 30 ? "bg-warning-soft text-warning" : "bg-success-soft text-success";
          const txt = days === null ? "بدون انتهاء" : days < 0 ? `منتهٍ منذ ${-days} يوم` : days <= 30 ? `ينتهي خلال ${days} يوم` : `ساري حتى ${formatDateShort(d.expiresAt!)}`;
          return (
            <div key={d.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <FileText size={18} className="text-muted" />
              <span className="flex-1 font-medium">{DOC[d.type]}</span>
              <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", cls)}>{txt}</span>
            </div>
          );
        })}
      </Card>
    </div>
  );
}
