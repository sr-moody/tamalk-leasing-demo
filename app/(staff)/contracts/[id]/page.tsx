"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Printer, Wallet } from "lucide-react";
import { toast } from "sonner";
import type { Payment, PaymentMethod } from "@/types/domain";
import { applyPayment } from "@/lib/domain/allocation";
import { getContractBalances } from "@/lib/domain/balances";
import { formatReceiptNumber } from "@/lib/domain/contractNumber";
import { todayISO } from "@/lib/domain/dates";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { formatAmount, formatDate, formatDateShort, formatMoney } from "@/lib/format";
import { Button, Card, Dialog, Fade, Field, inputCls, PaymentRing, Select, Stat, StatusBadge } from "@/components/ui/basics";
import { cn } from "@/lib/utils";
import { appendAudit } from "@/lib/audit";

const METHODS: Record<PaymentMethod, string> = { cash: "نقداً", bank_transfer: "تحويل بنكي", mada: "مدى", sadad: "سداد" };

export default function ContractPage() {
  const { id } = useParams<{ id: string }>();
  const { db, role, update } = useSession();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("bank_transfer");
  const [paymentType, setPaymentType] = useState<"installment" | "contract_fee">("installment");
  const [receipt, setReceipt] = useState<Payment | null>(null);
  if (!db || !role) return null;
  const c = db.contracts.find((x) => x.id === id);
  if (!c) return <p className="text-muted">العقد غير موجود</p>;
  const today = todayISO();
  const b = getContractBalances(c, today);
  const customer = db.customers.find((x) => x.id === c.customerId);
  const vehicle = db.vehicles.find((v) => v.id === c.vehicleId);
  const canPay = can(role, "payments.record") && (
    ["active", "overdue", "approved"].includes(c.status) ||
    (c.status === "pending_approval" && b.upfrontFeeRemaining > 0)
  );
  const canApprove = can(role, "contracts.approve") && c.status === "pending_approval";

  const approve = () => {
    update((d) => {
      const x = d.contracts.find((y) => y.id === c.id)!;
      x.status = "active"; x.approvedAt = new Date().toISOString(); x.approvedBy = "u-admin";
      const v = d.vehicles.find((y) => y.id === x.vehicleId); if (v) v.status = "contracted";
      appendAudit(d, {
        userId: "u-admin",
        actorRole: role,
        action: "contract.approved",
        entity: "contract",
        entityId: x.id,
        details: `اعتماد العقد ${x.number}`,
        severity: "warning",
      }, role);
      if (v) appendAudit(d, {
        userId: "u-admin",
        actorRole: role,
        action: "vehicle.contracted",
        entity: "vehicle",
        entityId: v.id,
        details: `ربط السيارة بالعقد ${x.number}`,
      }, role);
    });
    toast.success("تم اعتماد العقد");
  };

  const pay = () => {
    const n = Number(amount);
    if (!n || n <= 0) return toast.error("أدخل مبلغاً صحيحاً");
    update((d) => {
      const idx = d.contracts.findIndex((y) => y.id === c.id);
      const seq = ++d.counters.receipt;
      const res = applyPayment(d.contracts[idx], {
        id: `p-${Date.now()}`, receiptNo: formatReceiptNumber(new Date().getFullYear(), seq), type: paymentType,
        amount: n, method, paidAt: new Date().toISOString(), createdBy: role === "admin" ? "u-admin" : "u-acc1",
      }, today);
      if (!res.ok) { toast.error("تعذر تسجيل الدفعة: " + res.error); return; }
      d.contracts[idx] = res.contract;
      setReceipt(res.payment);
      appendAudit(d, {
        userId: role === "admin" ? "u-admin" : "u-acc1",
        actorRole: role,
        action: "payment.recorded",
        entity: "payment",
        entityId: res.payment.id,
        details: `تسجيل ${paymentType === "contract_fee" ? "مقدم توقيع" : "دفعة"} بقيمة ${formatMoney(n)} للعقد ${d.contracts[idx].number} · الإيصال ${res.payment.receiptNo}`,
      }, role);
      toast.success(`تم تسجيل دفعة ${formatMoney(n)}`);
    });
    setOpen(false); setAmount("");
  };

  const timeline = [
    { label: "إنشاء العقد", at: c.createdAt, done: true },
    { label: "الاعتماد", at: c.approvedAt, done: Boolean(c.approvedAt) },
    { label: "تسليم السيارة", at: c.handover?.at, done: Boolean(c.handover) },
    { label: "آخر قسط", at: c.endDate, done: c.status === "paid_off" || c.status === "owned" },
    { label: "التمليك", at: c.ownedAt, done: Boolean(c.ownedAt) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <div className="flex items-center gap-3"><h1 className="num text-2xl font-bold">{c.number}</h1><StatusBadge status={c.status} /></div>
          <p className="mt-1 text-sm text-muted">
            <Link href={`/customers/${c.customerId}`} className="font-semibold text-fg hover:text-brand">{customer?.fullName}</Link> · <Link href={`/vehicles/${c.vehicleId}`} className="hover:text-brand">{vehicle?.make} {vehicle?.model} {vehicle?.year}</Link>
          </p>
        </div>
        <div className="flex gap-2">
          {canApprove && <Button onClick={approve}><CheckCircle2 size={16} /> اعتماد العقد</Button>}
          {canPay && <Button onClick={() => { setPaymentType(b.upfrontFeeRemaining > 0 && c.status === "pending_approval" ? "contract_fee" : "installment"); setAmount(""); setOpen(true); }}><Wallet size={16} /> {b.upfrontFeeRemaining > 0 && c.status === "pending_approval" ? "تحصيل مقدم التوقيع" : "تسجيل دفعة"}</Button>}
        </div>
      </Fade>

      <div className="grid gap-4 lg:grid-cols-3 print:hidden">
        <Card className="flex flex-col items-center justify-center gap-3">
          <PaymentRing progress={b.progress} remaining={b.remaining} size={180} />
          <p className="text-xs text-muted">{b.paidCount} من {c.installments.length} قسط مدفوع</p>
        </Card>
        <div className="grid grid-cols-2 gap-3 lg:col-span-2">
          <Stat label="إجمالي العقد" value={formatMoney(b.contractTotal)} sub={`مقدم ${formatAmount(b.downPayment)}`} />
          <Stat label="المدفوع" value={formatMoney(b.paid + b.upfrontFeePaid)} sub={`الأقساط ${formatMoney(b.paid)} · مقدم التوقيع ${formatMoney(b.upfrontFeePaid)}`} />
          <Stat label="المتبقي" value={formatMoney(b.remaining)} accent />
          <Stat label="متأخر" value={formatMoney(b.overdueAmount)} sub={b.daysOverdue ? `${b.daysOverdue} يوم تأخير` : undefined} className={b.overdueAmount ? "border-danger/40" : ""} />
        </div>
      </div>

      <Card className="print:hidden">
        <p className="mb-4 text-xs text-muted">مسار العقد</p>
        <ol className="flex flex-wrap gap-y-3">
          {timeline.map((t, i) => (
            <li key={t.label} className="flex min-w-[140px] flex-1 items-start gap-2">
              <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-full", t.done ? "bg-brand" : "bg-line")} />
              <div><p className="text-sm font-semibold">{t.label}</p><p className="num text-xs text-muted">{t.at ? formatDateShort(t.at) : "—"}</p></div>
              {i < timeline.length - 1 && <span className="mx-2 mt-2.5 hidden h-px flex-1 bg-line lg:block" />}
            </li>
          ))}
        </ol>
      </Card>

      <Card className="overflow-hidden p-0 print:hidden">
        <div className="px-5 py-4 text-sm font-bold">الأقساط</div>
        <div className="divide-y divide-line">
          {c.installments.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <span className="num w-8 text-muted">#{i.seq}</span>
              <span className="num flex-1">{formatDate(i.dueDate)}</span>
              <span className="num hidden text-muted sm:block">{i.paidAmount > 0 && i.paidAmount < i.amount ? `${formatAmount(i.paidAmount)} / ` : ""}{formatAmount(i.amount)}</span>
              <StatusBadge status={i.status} />
            </div>
          ))}
        </div>
      </Card>

      {b.upfrontFee > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div><h2 className="font-bold">مقدم التوقيع غير المسترد</h2><p className="mt-1 text-sm text-muted">يُحصّل منفصلاً عند توقيع العقد ولا يدخل ضمن أقساط قيمة السيارة.</p></div>
          <div className="text-end"><p className="num font-bold">{formatMoney(b.upfrontFee)}</p><p className={cn("mt-1 text-xs font-semibold", b.upfrontFeeRemaining > 0 ? "text-warning" : "text-success")}>{b.upfrontFeeRemaining > 0 ? `مستحق ${formatMoney(b.upfrontFeeRemaining)}` : `تم تحصيل ${formatMoney(b.upfrontFeePaid)}`}</p></div>
        </Card>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} title="تسجيل دفعة">
        <div className="space-y-4">
          {b.upfrontFeeRemaining > 0 && (
            <Field label="نوع الدفعة">
              <div className="grid grid-cols-2 gap-2">
                <Button type="button" variant={paymentType === "installment" ? "dark" : "outline"} onClick={() => { setPaymentType("installment"); setAmount(""); }}>قسط سيارة</Button>
                <Button type="button" variant={paymentType === "contract_fee" ? "dark" : "outline"} onClick={() => { setPaymentType("contract_fee"); setAmount(""); }}>مقدم التوقيع</Button>
              </div>
            </Field>
          )}
          <Field label={`المبلغ (${paymentType === "contract_fee" ? "مقدم التوقيع" : "القسط"} · ر.س)`}><input className={inputCls + " num"} type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(paymentType === "contract_fee" ? b.upfrontFeeRemaining : c.installmentAmount)} /></Field>
          <div className="flex flex-wrap gap-2">
            {(paymentType === "contract_fee" ? [b.upfrontFeeRemaining] : [c.installmentAmount, b.overdueAmount, b.remaining - b.upfrontFeeRemaining]).filter((v, i, a) => v > 0 && a.indexOf(v) === i).map((v) => (
              <button key={v} onClick={() => setAmount(String(v))} className="num rounded-full border border-line px-3 py-1 text-xs hover:border-brand">{formatAmount(v)}</button>
            ))}
          </div>
          <Field label="طريقة الدفع">
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Button className="w-full" onClick={pay}>تأكيد الدفعة</Button>
        </div>
      </Dialog>

      {receipt && (
        <>
          <Dialog open onClose={() => setReceipt(null)} title="تم تسجيل الدفعة">
            <p className="num text-sm text-muted">إيصال رقم {receipt.receiptNo}</p>
            <p className="num my-3 text-3xl font-bold text-brand">{formatMoney(receipt.amount)}</p>
            <p className="text-sm">{METHODS[receipt.method]} · {customer?.fullName}</p>
            <Button className="mt-4 w-full" variant="dark" onClick={() => window.print()}><Printer size={16} /> طباعة الإيصال</Button>
          </Dialog>
          <div className="hidden print:block">
            <div className="mx-auto max-w-md border p-8 text-black">
              <h2 className="text-xl font-bold">{db.settings.company.name} — إيصال سداد</h2>
              <p className="num mt-1 text-sm">رقم الإيصال: {receipt.receiptNo} · {formatDate(receipt.paidAt)}</p>
              <hr className="my-4" />
              <p>العميل: {customer?.fullName}</p>
              <p className="num">العقد: {c.number}</p>
              <p>السيارة: {vehicle?.make} {vehicle?.model} {vehicle?.year} — {vehicle?.plateAr}</p>
              <p>طريقة الدفع: {METHODS[receipt.method]}</p>
              <p className="num mt-4 text-2xl font-bold">المبلغ: {formatMoney(receipt.amount)}</p>
              <p className="num mt-2 text-sm">المتبقي بعد الدفعة: {formatMoney(getContractBalances(db.contracts.find((x) => x.id === c.id)!, today).remaining)}</p>
              <p className="mt-6 text-xs">الرقم الضريبي: {db.settings.company.vatNumber}</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
