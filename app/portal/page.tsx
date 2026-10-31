"use client";
import { useState } from "react";
import { Bell, CreditCard, User } from "lucide-react";
import { appConfig } from "@/lib/config";
import { getContractBalances } from "@/lib/domain/balances";
import { todayISO } from "@/lib/domain/dates";
import { useSession } from "@/lib/session";
import { useAlerts } from "@/lib/useAlerts";
import { formatAmount, formatDate, formatDateShort, formatKm, formatMoney, formatPhone, maskNationalId } from "@/lib/format";
import { Card, Fade, PaymentRing, PlateBadge, Select, StatusBadge, VehiclePhoto } from "@/components/ui/basics";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS: Record<string, string> = {
  cash: "نقداً",
  bank_transfer: "تحويل بنكي",
  mada: "مدى",
  sadad: "سداد",
};

export default function PortalPage() {
  const { db, customerId } = useSession();
  const { alerts } = useAlerts();
  const [selectedContractId, setSelectedContractId] = useState("");
  if (!db || !customerId) return null;
  const customer = db.customers.find((item) => item.id === customerId);
  if (!customer) return null;

  const customerContracts = db.contracts.filter((item) => item.customerId === customerId);
  const initialContract = customerContracts.find((item) => ["active", "overdue"].includes(item.status)) ?? customerContracts[0];
  const contract = customerContracts.find((item) => item.id === selectedContractId) ?? initialContract;
  const today = todayISO();

  if (!contract) {
    return (
      <div id="home" className="mx-auto grid max-w-7xl gap-5 pt-3 lg:grid-cols-3">
        <Fade className="lg:col-span-3">
          <p className="text-sm text-muted">أهلاً بك</p>
          <h1 className="mt-1 text-2xl font-bold">{customer.fullName.split(" ")[0]} 👋</h1>
          <p className="mt-1 text-sm text-muted">حسابك الشخصي في {appConfig.brandName}</p>
        </Fade>
        <Card className="space-y-4 lg:col-span-2">
          <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-soft text-brand"><User size={22} /></span>
          <div><h2 className="font-bold">حسابك جاهز</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-muted">لا توجد عقود مرتبطة بحسابك حتى الآن. ستظهر تفاصيل العقد والأقساط والمدفوعات هنا بعد إنشاء عقدك.</p></div>
          <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
            <Row label="رقم الجوال" value={formatPhone(customer.phone)} />
            <Row label="المدينة" value={customer.city} />
          </div>
        </Card>
        <Card className="flex items-start gap-3 bg-surface-2">
          <CreditCard size={20} className="mt-0.5 shrink-0 text-brand" />
          <div><h3 className="font-semibold">سداد آمن وواضح</h3><p className="mt-1 text-sm leading-6 text-muted">عند إصدار عقدك، ستجد مواعيد الأقساط وتعليمات السداد في هذه الصفحة.</p></div>
        </Card>
      </div>
    );
  }

  const balances = getContractBalances(contract, today);
  const vehicle = db.vehicles.find((item) => item.id === contract.vehicleId);
  const progress = Math.round(balances.progress * 100);
  const payments = [...contract.payments].sort((a, b) => b.paidAt.localeCompare(a.paidAt));
  const customerAlerts = alerts.filter((alert) => alert.customerId === customerId || alert.contractId === contract.id);

  return (
    <div id="home" className="mx-auto grid max-w-7xl gap-5 pt-3 lg:grid-cols-3">
      <Fade className="flex flex-wrap items-end justify-between gap-3 lg:col-span-3">
        <div><p className="text-sm text-muted">أهلاً بك</p><h1 className="mt-1 text-2xl font-bold">{customer.fullName.split(" ")[0]} 👋</h1><p className="mt-1 text-sm text-muted">ملخص حسابك وعقدك في {appConfig.brandName}</p></div>
        {customerContracts.length > 1 && (
          <div className="w-full sm:w-80">
            <Select value={contract.id} onChange={(event) => setSelectedContractId(event.target.value)} aria-label="اختر العقد">
              {customerContracts.map((item) => <option key={item.id} value={item.id}>{item.number}</option>)}
            </Select>
          </div>
        )}
      </Fade>

      <Fade delay={0.05} className="lg:col-span-2">
        <Card dark className="flex min-h-52 flex-wrap items-center justify-between gap-5 sm:p-7">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-shell-muted">ملخص العقد <span className="num ms-1">{contract.number}</span></p>
            <p className="mt-3 text-lg font-bold">سددت <span className="num text-brand">{progress}%</span> من عقدك</p>
            <p className="mt-1 text-sm text-shell-muted">{balances.paidCount} من {contract.installments.length} قسط</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Row label="إجمالي العقد" value={formatMoney(balances.contractTotal)} dark />
              <Row label="المبلغ المدفوع" value={formatMoney(balances.paid + balances.upfrontFeePaid)} dark />
            </div>
          </div>
          <PaymentRing progress={balances.progress} remaining={balances.remaining} size={146} stroke={11} dark />
        </Card>
      </Fade>

      <Fade delay={0.1}>
        <Card className="h-full border-brand/20 bg-brand-soft/50">
          <p className="text-sm font-semibold text-muted">{balances.overdueAmount > 0 ? "مبلغ متأخر" : "القسط القادم"}</p>
          {balances.nextInstallment ? (
            <>
              <p className="num mt-2 text-3xl font-bold text-brand">{formatAmount(balances.nextInstallment.amount - balances.nextInstallment.paidAmount)} <span className="text-sm">ر.س</span></p>
              <p className="mt-2 text-sm">{balances.daysToNext === 0 ? "مستحق اليوم" : balances.daysToNext !== null && balances.daysToNext > 0 ? `بعد ${balances.daysToNext} يوم` : `متأخر ${balances.daysOverdue} يوم`}</p>
              <p className="num mt-1 text-xs text-muted">{formatDate(balances.nextInstallment.dueDate)}</p>
            </>
          ) : <p className="mt-4 text-sm text-muted">لا توجد أقساط متبقية على العقد.</p>}
          <p className="num mt-4 rounded-xl bg-brand/10 px-3 py-2 text-xs leading-5">سداد: رمز المفوتر 301 · رقم العقد {contract.number}</p>
        </Card>
      </Fade>

      {vehicle && (
        <Fade delay={0.15} className="lg:col-span-2">
          <Card className="flex h-full min-h-40 overflow-hidden p-0">
            <VehiclePhoto src={vehicle.images.find((image) => image.startsWith("/vehicles/"))} alt={`${vehicle.make} ${vehicle.model} ${vehicle.year}`} className="min-h-40 w-1/2 shrink-0 lg:w-1/3" />
            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <p className="truncate font-bold">{vehicle.make} {vehicle.model}</p>
                <p className="mt-1 text-xs text-muted">{vehicle.year} · {vehicle.color} · {formatKm(vehicle.mileage)}</p>
              </div>
              <div className="grid min-w-32 flex-1 grid-cols-2 gap-x-3 gap-y-2 text-xs sm:flex sm:items-center sm:justify-end">
                <div><p className="text-muted">سعر السيارة</p><p className="num mt-1 font-semibold">{formatMoney(contract.vehiclePrice)}</p></div>
                <div><p className="text-muted">مدة العقد</p><p className="num mt-1 font-semibold">{contract.months} شهر</p></div>
                <div><p className="text-muted">القسط الشهري</p><p className="num mt-1 font-semibold">{formatMoney(contract.installmentAmount)}</p></div>
              </div>
              <PlateBadge ar={vehicle.plateAr} en={vehicle.plateEn} className="w-fit" />
            </div>
          </Card>
        </Fade>
      )}

      <Card className="h-full space-y-3 lg:col-start-3 lg:row-start-3">
        <div className="flex items-center gap-2"><User size={17} className="text-brand" /><h2 className="font-bold">بيانات الحساب</h2></div>
        <Row label="الاسم" value={customer.fullName} />
        <Row label="رقم الهوية" value={maskNationalId(customer.nationalId)} />
        <Row label="الجوال" value={formatPhone(customer.phone)} />
        <Row label="المتبقي" value={formatMoney(balances.remaining)} />
      </Card>

      {customerAlerts.length > 0 && (
        <section className="space-y-3 lg:col-span-3" aria-labelledby="portal-alerts">
          <h2 id="portal-alerts" className="text-lg font-bold">تنبيهات حسابك</h2>
          <div className="grid gap-3 md:grid-cols-2">
            {customerAlerts.map((alert) => (
              <Card key={alert.id} className={cn("flex items-start gap-3", alert.severity === "critical" && "border-danger/30 bg-danger-soft")}>
                <Bell size={18} className="mt-0.5 shrink-0 text-brand" />
                <div><p className="font-semibold">{alert.customerTitle ?? alert.title}</p><p className="mt-1 text-sm leading-5 text-muted">{alert.customerBody ?? alert.body}</p></div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section id="installments" className="scroll-mt-24 space-y-3 lg:col-span-2 lg:row-span-2" aria-labelledby="installments-heading">
        <div className="flex items-center justify-between gap-3"><h2 id="installments-heading" className="text-lg font-bold">جدول الأقساط</h2><span className="text-xs text-muted">{contract.installments.length} قسط</span></div>
        <Card className="divide-y divide-line p-0">
          {contract.installments.map((installment) => (
            <div key={installment.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 text-sm sm:px-5">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", installment.status === "paid" ? "bg-success" : installment.status === "overdue" ? "bg-danger" : installment.status === "due" || installment.status === "partial" ? "bg-brand" : "bg-line")} />
              <span className="num w-9 shrink-0 text-muted">#{installment.seq}</span>
              <span className="num min-w-28 flex-1">{formatDate(installment.dueDate)}</span>
              <span className="num font-semibold">{formatAmount(installment.amount)} ر.س</span>
              <StatusBadge status={installment.status} />
            </div>
          ))}
        </Card>
      </section>

      <section id="payments" className="scroll-mt-24 space-y-3 lg:col-span-1" aria-labelledby="payments-heading">
        <h2 id="payments-heading" className="text-lg font-bold">المدفوعات</h2>
        {payments.length === 0 ? <Card className="text-sm text-muted">لم تسجل دفعات على هذا العقد بعد.</Card> : (
          <Card className="divide-y divide-line p-0">
            {payments.map((payment) => (
              <div key={payment.id} className="space-y-1.5 px-4 py-3 text-sm">
                <div className="flex items-center justify-between gap-2"><span className="num font-semibold">{formatMoney(payment.amount)}</span><span className="num text-xs text-muted">{formatDateShort(payment.paidAt.slice(0, 10))}</span></div>
                <div className="flex items-center justify-between gap-2 text-xs text-muted"><span>{PAYMENT_METHODS[payment.method]}</span><span className="num">{payment.receiptNo}</span></div>
                {payment.reversed && <span className="text-xs text-danger">تم عكس الدفعة</span>}
              </div>
            ))}
          </Card>
        )}
      </section>

      <section className="scroll-mt-24 lg:col-span-3" aria-label="معلومات العقد">
        <Card className="grid gap-3 sm:grid-cols-3">
          <Row label="رقم العقد" value={contract.number} />
          <Row label="إجمالي العقد" value={formatMoney(balances.contractTotal)} />
          <Row label="المتبقي" value={formatMoney(balances.remaining)} />
        </Card>
      </section>
    </div>
  );
}

function Row({ label, value, dark }: { label: string; value: string; dark?: boolean }) {
  return <div className="flex min-w-0 items-center justify-between gap-3 text-sm"><span className={dark ? "text-shell-muted" : "text-muted"}>{label}</span><span className={cn("num text-end font-semibold", dark && "text-white")} dir="auto">{value}</span></div>;
}
