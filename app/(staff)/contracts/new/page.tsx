"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarDays, CarFront, Check, ChevronLeft, ChevronRight, FileText, Search, UserRoundPlus } from "lucide-react";
import type { Contract, Customer, Vehicle } from "@/types/domain";
import { formatContractNumber, nextSequence } from "@/lib/domain/contractNumber";
import { addMonthsISO, todayISO } from "@/lib/domain/dates";
import { calcContractTerms, generateSchedule, validateTerms } from "@/lib/domain/schedule";
import { buildTemplateVars, renderTemplate } from "@/lib/domain/template";
import { appConfig } from "@/lib/config";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { formatAmount, formatDateShort, formatMoney, formatPhone } from "@/lib/format";
import { Button, Card, Fade, Field, inputCls, PlateBadge, VehiclePhoto } from "@/components/ui/basics";
import { cn } from "@/lib/utils";
import { appendAudit } from "@/lib/audit";

const STEPS = [
  { title: "اختيار العميل", icon: UserRoundPlus },
  { title: "اختيار السيارة", icon: CarFront },
  { title: "الشروط والجدول", icon: CalendarDays },
  { title: "مراجعة العقد", icon: FileText },
];

export default function NewContractPage() {
  const router = useRouter();
  const { db, role, update } = useSession();
  const [step, setStep] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [down, setDown] = useState("");
  const [installment, setInstallment] = useState("");
  const [months, setMonths] = useState<number>(appConfig.defaultMonths);
  const [customDuration, setCustomDuration] = useState(false);
  const [firstDue, setFirstDue] = useState(addMonthsISO(todayISO(), 1));
  const [saving, setSaving] = useState(false);

  const vehicle = db?.vehicles.find((v) => v.id === vehicleId && v.status === "available");
  const customer = db?.customers.find((c) => c.id === customerId);
  const price = vehicle?.listPrice ?? 0;
  const downPayment = down === "" ? 0 : Number(down);
  const upfrontFee = appConfig.contractUpfrontFee;
  const manualInstallment = installment === "" ? undefined : Number(installment);
  const invalidManualInstallment = installment !== "" && (!Number.isFinite(manualInstallment) || (manualInstallment ?? 0) <= 0);
  const termErrors = useMemo(
    () => validateTerms({
      vehiclePrice: price,
      downPayment,
      upfrontFee,
      months,
      vehicleStatus: vehicle?.status,
      ...(manualInstallment !== undefined && Number.isFinite(manualInstallment) && manualInstallment > 0
        ? { installmentOverride: manualInstallment }
        : {}),
    }, { minMonths: appConfig.minMonths, maxMonths: appConfig.maxMonths }),
    [price, downPayment, upfrontFee, months, vehicle?.status, manualInstallment],
  );
  const terms = price > 0 && termErrors.length === 0 && !invalidManualInstallment
    ? calcContractTerms({
        vehiclePrice: price,
        downPayment,
        upfrontFee,
        months,
        vatRate: db?.settings.vatRate,
        ...(manualInstallment !== undefined ? { installmentOverride: manualInstallment } : {}),
      })
    : null;
  const schedule = terms && firstDue
    ? generateSchedule({ terms, firstDueDate: firstDue })
    : [];
  const endDate = schedule.at(-1)?.dueDate ?? "";
  const available = db?.vehicles.filter((v) => v.status === "available") ?? [];

  useEffect(() => {
    if (!db || !role || !can(role, "contracts.create")) router.replace("/contracts");
  }, [db, role, router]);

  useEffect(() => {
    const createdCustomerId = new URLSearchParams(window.location.search).get("customerId");
    if (createdCustomerId && db?.customers.some((item) => item.id === createdCustomerId)) {
      setCustomerId(createdCustomerId);
    }
  }, [db]);

  if (!db || !role || !can(role, "contracts.create")) return null;

  const stepIsValid = (): boolean => {
    if (step === 0 && !customer) {
      toast.error("اختر عميلاً للمتابعة");
      return false;
    }
    if (step === 1 && !vehicle) {
      toast.error("اختر سيارة متاحة للمتابعة");
      return false;
    }
    if (step === 2) {
      if (invalidManualInstallment) {
        toast.error("أدخل قسطاً موجباً أو اترك الحقل فارغاً للحساب التلقائي");
        return false;
      }
      if (!terms) {
        toast.error(termErrors.includes("downPaymentTooHigh")
          ? "يجب أن تكون الدفعة المقدمة أقل من سعر السيارة"
          : "راجع بيانات الدفعة والمدة والقسط");
        return false;
      }
      if (!firstDue || firstDue < todayISO()) {
        toast.error("اختر تاريخاً صحيحاً لأول قسط");
        return false;
      }
    }
    return true;
  };

  const selectVehicle = (selected: Vehicle) => {
    setVehicleId(selected.id);
    setDown(String(Math.round(selected.listPrice * appConfig.defaultDownPaymentRatio)));
    setInstallment("");
  };

  const save = () => {
    if (saving || !customer || !vehicle || !terms || !stepIsValid()) return;
    setSaving(true);
    let newId = "";
    let saveError = "";

    update((current) => {
      const currentCustomer = current.customers.find((c) => c.id === customer.id);
      const currentVehicle = current.vehicles.find((v) => v.id === vehicle.id);
      if (!currentCustomer) {
        saveError = "لم يعد العميل المحدد موجوداً";
        return;
      }
      if (!currentVehicle || currentVehicle.status !== "available") {
        saveError = "السيارة لم تعد متاحة؛ حدّث الاختيار وحاول مجدداً";
        return;
      }

      const currentTermsErrors = validateTerms({
        vehiclePrice: currentVehicle.listPrice,
        downPayment,
        upfrontFee,
        months,
        vehicleStatus: currentVehicle.status,
        ...(manualInstallment !== undefined ? { installmentOverride: manualInstallment } : {}),
      }, { minMonths: appConfig.minMonths, maxMonths: appConfig.maxMonths });
      if (currentTermsErrors.length > 0 || !firstDue || firstDue < todayISO()) {
        saveError = "تغيرت بيانات العقد أو أصبحت غير صالحة؛ راجع الشروط";
        return;
      }

      const now = new Date();
      const year = now.getFullYear();
      const sequence = Math.max(current.counters.contract + 1, nextSequence(
        current.contracts.map((c) => c.number),
        year,
        appConfig.contractPrefix,
      ));
      current.counters.contract = sequence;
      newId = `ct-${crypto.randomUUID()}`;
      const contractNumber = formatContractNumber(year, sequence);
      const currentTerms = calcContractTerms({
        vehiclePrice: currentVehicle.listPrice,
        downPayment,
        upfrontFee,
        months,
        vatRate: current.settings.vatRate,
        ...(manualInstallment !== undefined ? { installmentOverride: manualInstallment } : {}),
      });
      const installments = generateSchedule({ terms: currentTerms, firstDueDate: firstDue, idPrefix: newId });
      const contract: Contract = {
        id: newId,
        number: contractNumber,
        customerId: currentCustomer.id,
        vehicleId: currentVehicle.id,
        vehiclePrice: currentVehicle.listPrice,
        downPayment,
        upfrontFee,
        months,
        installmentAmount: currentTerms.installment,
        vatRate: currentTerms.vatRate,
        firstDueDate: firstDue,
        endDate: installments[installments.length - 1].dueDate,
        dueDay: Number(firstDue.slice(8, 10)),
        status: "pending_approval",
        createdAt: now.toISOString(),
        createdBy: role === "admin" ? "u-admin" : "u-sales1",
        termsSnapshot: renderTemplate(current.settings.contractTemplate, buildTemplateVars({
          company: current.settings.company,
          customer: currentCustomer,
          vehicle: currentVehicle,
          terms: currentTerms,
          number: contractNumber,
          createdAt: now.toISOString(),
          firstDueDate: firstDue,
          endDate: installments[installments.length - 1].dueDate,
        })),
        installments,
        payments: [],
      };
      current.contracts.unshift(contract);
      currentVehicle.status = "reserved";
      appendAudit(current, {
        userId: role === "admin" ? "u-admin" : "u-sales1",
        actorRole: role,
        action: "contract.created",
        entity: "contract",
        entityId: contract.id,
        details: `إنشاء العقد ${contract.number} للعميل ${currentCustomer.fullName} على ${currentVehicle.make} ${currentVehicle.model} لمدة ${months} شهراً`,
      }, role);
      appendAudit(current, {
        userId: role === "admin" ? "u-admin" : "u-sales1",
        actorRole: role,
        action: "vehicle.reserved",
        entity: "vehicle",
        entityId: currentVehicle.id,
        details: `حجز السيارة للعقد ${contract.number}`,
      }, role);
    });

    if (saveError) {
      setSaving(false);
      toast.error(saveError);
      return;
    }
    toast.success("تم إنشاء العقد وإرساله للاعتماد");
    router.push(`/contracts/${newId}`);
  };

  const projectedNumber = formatContractNumber(
    new Date().getFullYear(),
    nextSequence(db.contracts.map((c) => c.number), new Date().getFullYear(), appConfig.contractPrefix),
  );
  const previewContract = customer && vehicle && terms && endDate
    ? renderTemplate(db.settings.contractTemplate, buildTemplateVars({
        company: db.settings.company,
        customer,
        vehicle,
        terms,
        number: projectedNumber,
        createdAt: new Date().toISOString(),
        firstDueDate: firstDue,
        endDate,
      }))
    : "";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade>
        <div className="mb-5">
          <h1 className="text-2xl font-bold">إنشاء عقد جديد</h1>
          <p className="mt-1 text-sm text-muted">أكمل الخطوات لمراجعة الشروط وجدول الأقساط قبل الإرسال للاعتماد.</p>
        </div>
        <Card className="mb-5 p-4 sm:p-5">
          <ol dir="rtl" className="grid grid-cols-4 gap-2" aria-label="خطوات إنشاء العقد">
            {STEPS.map(({ title, icon: Icon }, index) => (
              <li key={title} className="min-w-0">
                <button
                  type="button"
                  onClick={() => index < step && setStep(index)}
                  disabled={index > step}
                  aria-current={index === step ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl p-2 text-start text-xs transition sm:p-3 sm:text-sm",
                    index === step ? "bg-brand-soft font-bold text-brand" : index < step ? "text-success hover:bg-success-soft" : "text-muted",
                  )}
                >
                  <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full", index === step ? "bg-brand text-white" : index < step ? "bg-success text-white" : "bg-neutral-soft")}>
                    {index < step ? <Check size={16} /> : <Icon size={16} />}
                  </span>
                  <span className="hidden truncate sm:block">{title}</span>
                  <span className="sm:hidden">{index + 1}</span>
                </button>
              </li>
            ))}
          </ol>
        </Card>
      </Fade>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {step === 0 && (
            <Fade>
              <Card className="space-y-5">
                <div>
                  <h2 className="text-lg font-bold">بيانات العميل</h2>
                  <p className="mt-1 text-sm text-muted">اختر عميلاً مسجلاً أو أنشئ ملفاً جديداً من قسم العملاء.</p>
                </div>
                <CustomerPicker customers={db.customers} value={customerId} onChange={setCustomerId} />
                {customer && (
                  <div className="grid gap-3 rounded-xl bg-surface-2 p-4 text-sm sm:grid-cols-3">
                    <div><p className="text-xs text-muted">الاسم</p><p className="mt-1 font-semibold">{customer.fullName}</p></div>
                    <div><p className="text-xs text-muted">الجوال</p><p className="num mt-1 font-semibold" dir="ltr">{formatPhone(customer.phone)}</p></div>
                    <div><p className="text-xs text-muted">المدينة</p><p className="mt-1 font-semibold">{customer.city}</p></div>
                  </div>
                )}
              </Card>
            </Fade>
          )}

          {step === 1 && (
            <Fade>
              <Card>
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div><h2 className="text-lg font-bold">السيارات المتاحة</h2><p className="mt-1 text-sm text-muted">{available.length} سيارة متاحة للاختيار</p></div>
                  <CarFront className="text-brand" size={22} />
                </div>
                {available.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-line p-8 text-center">
                    <p className="font-semibold">لا توجد سيارات متاحة حالياً</p>
                    <p className="mt-1 text-sm text-muted">ستظهر هنا السيارات التي أصبحت جاهزة للتعاقد.</p>
                  </div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {available.map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        aria-pressed={vehicleId === v.id}
                        onClick={() => selectVehicle(v)}
                        className={cn(
                          "overflow-hidden rounded-2xl border text-start transition hover:-translate-y-0.5 hover:shadow-lift",
                          vehicleId === v.id ? "border-brand bg-brand-soft ring-1 ring-brand" : "border-line bg-surface hover:border-ink",
                        )}
                      >
                        <VehiclePhoto src={v.images.find((image) => image.startsWith("/vehicles/"))} alt={`${v.make} ${v.model} ${v.year}`} className="aspect-[16/9] w-full" />
                        <div className="p-4">
                        <div className="flex items-start justify-between gap-2">
                          <div><p className="font-bold">{v.make} {v.model}</p><p className="text-xs text-muted">{v.year} · {v.color}</p></div>
                          <span className="h-5 w-5 rounded-full border border-line" style={{ background: v.colorHex }} aria-label={`لون ${v.color}`} />
                        </div>
                        <div className="mt-4 flex items-center justify-between gap-2">
                          <PlateBadge ar={v.plateAr} en={v.plateEn} />
                          <span className="num text-sm font-bold text-brand">{formatAmount(v.listPrice)} ر.س</span>
                        </div>
                        <p className="mt-3 text-xs text-muted">رقم الهيكل: <span className="num" dir="ltr">{v.vin}</span></p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </Card>
            </Fade>
          )}

          {step === 2 && (
            <Fade>
              <Card className="space-y-5">
                <div><h2 className="text-lg font-bold">الشروط المالية وجدول الأقساط</h2><p className="mt-1 text-sm text-muted">مقدم التوقيع ٢٬٠٠٠ ريال يُحصّل منفصلاً ويضاف إلى الإجمالي. اختر مدة مناسبة من ١٢ إلى ٦٠ شهراً.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="دفعة السيارة (ريال)">
                    <input className={cn(inputCls, "num")} type="number" inputMode="decimal" min="0" max={Math.max(0, price - 0.01)} step="0.01" value={down} onChange={(e) => setDown(e.target.value)} aria-label="الدفعة المقدمة بالريال" />
                  </Field>
                  <Field label="تاريخ أول قسط">
                    <input className={cn(inputCls, "num")} type="date" min={todayISO()} value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
                  </Field>
                </div>
                {price > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs text-muted"><span>نسبة الدفعة</span><span className="num font-semibold">{Math.round((downPayment / price) * 100)}%</span></div>
                    <input
                      className="w-full accent-brand"
                      type="range"
                      min="0"
                      max={Math.max(1, Math.floor(price * 0.8))}
                      step="500"
                      value={Math.min(Math.max(0, downPayment), Math.floor(price * 0.8))}
                      onChange={(e) => setDown(e.target.value)}
                      aria-label="تحديد دفعة السيارة"
                    />
                    <div className="mt-1 flex justify-between text-[11px] text-muted"><span>0%</span><span>80%</span></div>
                  </div>
                )}
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted">مدة التمويل</p>
                  <div className="flex flex-wrap gap-2">
                    {appConfig.monthOptions.map((m) => (
                      <button key={m} type="button" onClick={() => { setCustomDuration(false); setMonths(m); }} aria-pressed={!customDuration && months === m} className={cn("num rounded-full border px-4 py-2 text-sm font-semibold transition", !customDuration && months === m ? "border-ink bg-ink text-white dark:bg-white dark:text-ink" : "border-line hover:bg-neutral-soft")}>{m} شهر</button>
                    ))}
                    <button type="button" onClick={() => setCustomDuration(true)} aria-pressed={customDuration} className={cn("rounded-full border px-4 py-2 text-sm font-semibold transition", customDuration ? "border-ink bg-ink text-white dark:bg-white dark:text-ink" : "border-line hover:bg-neutral-soft")}>مدة مخصصة</button>
                  </div>
                  {customDuration && (
                    <Field label={`مدة التمويل بالأشهر (${appConfig.minMonths}–${appConfig.maxMonths})`}>
                      <input className={cn(inputCls, "num max-w-40")} type="number" inputMode="numeric" min={appConfig.minMonths} max={appConfig.maxMonths} step="1" value={months} onChange={(event) => setMonths(Number(event.target.value))} aria-label="مدة التمويل المخصصة بالأشهر" />
                    </Field>
                  )}
                </div>
                <Field label="القسط الشهري (اتركه فارغاً للحساب التلقائي)">
                  <div className="relative">
                    <input className={cn(inputCls, "num pe-14")} type="number" inputMode="decimal" min="0.01" step="0.01" value={installment} onChange={(e) => setInstallment(e.target.value)} placeholder={terms ? formatAmount(terms.suggestedInstallment) : "يُحسب تلقائياً"} />
                    <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted">ريال</span>
                  </div>
                </Field>
                {terms?.isManual && (
                  <p className={cn("rounded-xl px-4 py-3 text-sm", terms.lastInstallment <= 0 ? "bg-danger-soft text-danger" : "bg-warning-soft text-warning")}>
                    {terms.lastInstallment <= 0
                      ? "القسط المحدد مرتفع؛ سيصبح القسط الأخير صفراً أو أقل."
                      : `سيكون القسط الأخير ${formatAmount(terms.lastInstallment)} ريال بدلاً من ${formatAmount(terms.installment)} ريال لموازنة إجمالي التمويل.`}
                  </p>
                )}
                {termErrors.includes("downPaymentTooHigh") && <p className="text-sm text-danger">يجب أن تكون الدفعة المقدمة أقل من سعر السيارة.</p>}
                {termErrors.includes("installmentTooHigh") && <p className="text-sm text-danger">القسط المحدد كبير جداً؛ خفّض قيمته ليبقى القسط الأخير أكبر من صفر.</p>}
                {invalidManualInstallment && <p className="text-sm text-danger">أدخل قسطاً موجباً، أو اترك الحقل فارغاً ليُحسب تلقائياً.</p>}
                <div className="rounded-xl bg-surface-2 p-4">
                  <p className="mb-3 text-sm font-semibold">معاينة أول الأقساط</p>
                  {schedule.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-3">
                      {schedule.slice(0, 3).map((item) => <SchedulePreview key={item.id} date={item.dueDate} amount={item.amount} seq={item.seq} />)}
                      {schedule.length > 3 && <p className="self-center text-center text-xs text-muted">… {schedule.length - 3} أقساط أخرى · القسط الأخير {formatAmount(schedule[schedule.length - 1].amount)} ريال</p>}
                    </div>
                  ) : <p className="text-sm text-muted">اختر سيارة وأدخل دفعة صالحة لعرض جدول الأقساط.</p>}
                </div>
              </Card>
            </Fade>
          )}

          {step === 3 && (
            <Fade>
              <div className="space-y-5">
                <Card>
                  <div className="mb-4 flex items-center justify-between">
                    <div><h2 className="text-lg font-bold">مراجعة بيانات العقد</h2><p className="mt-1 text-sm text-muted">تأكد من بيانات العميل والسيارة والشروط قبل الإرسال.</p></div>
                    <span className="num rounded-full bg-brand-soft px-3 py-1 text-xs font-bold text-brand">{projectedNumber}</span>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ReviewBlock title="العميل" onEdit={() => setStep(0)}>
                      <p className="font-bold">{customer?.fullName ?? "—"}</p>
                      <p className="num mt-1 text-sm text-muted" dir="ltr">{customer ? formatPhone(customer.phone) : ""}</p>
                      <p className="mt-1 text-sm text-muted">{customer?.city}</p>
                    </ReviewBlock>
                    <ReviewBlock title="السيارة" onEdit={() => setStep(1)}>
                      <p className="font-bold">{vehicle ? `${vehicle.make} ${vehicle.model} ${vehicle.year}` : "—"}</p>
                      {vehicle && <div className="mt-2"><PlateBadge ar={vehicle.plateAr} en={vehicle.plateEn} /></div>}
                      <p className="num mt-2 text-sm text-muted">{vehicle ? formatMoney(vehicle.listPrice) : ""}</p>
                    </ReviewBlock>
                    <ReviewBlock title="الشروط المالية" onEdit={() => setStep(2)}>
                      <p className="text-sm">دفعة السيارة: <span className="num font-semibold">{formatMoney(downPayment)}</span></p>
                      <p className="mt-1 text-sm">مقدم غير مسترد عند التوقيع: <span className="num font-semibold">{formatMoney(upfrontFee)}</span></p>
                      <p className="mt-1 text-sm">المدة: <span className="num font-semibold">{months} شهر</span></p>
                      <p className="mt-1 text-sm">القسط: <span className="num font-semibold">{terms ? formatMoney(terms.installment) : "—"}</span></p>
                      <p className="mt-1 text-sm">أول استحقاق: <span className="num font-semibold">{formatDateShort(firstDue)}</span></p>
                    </ReviewBlock>
                    <ReviewBlock title="الإجماليات" onEdit={() => setStep(2)}>
                      <p className="text-sm">الضريبة: <span className="num font-semibold">{terms ? formatMoney(terms.vat) : "—"}</span></p>
                      <p className="mt-1 text-sm">إجمالي العقد: <span className="num font-semibold">{terms ? formatMoney(terms.contractTotal) : "—"}</span></p>
                      <p className="mt-1 text-sm">آخر قسط: <span className="num font-semibold">{terms ? formatMoney(terms.lastInstallment) : "—"}</span></p>
                      <p className="mt-1 text-sm">نهاية الجدول: <span className="num font-semibold">{endDate ? formatDateShort(endDate) : "—"}</span></p>
                    </ReviewBlock>
                  </div>
                </Card>

                <Card className="overflow-hidden p-0">
                  <div className="border-b border-line p-5">
                    <h3 className="font-bold">جدول الأقساط الكامل ({schedule.length})</h3>
                    <p className="mt-1 text-sm text-muted">تم ضبط مواعيد الأقساط شهرياً دون تجاوز نهاية الشهر.</p>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-surface-2 text-xs text-muted"><tr><th className="px-4 py-3 text-start">القسط</th><th className="px-4 py-3 text-start">تاريخ الاستحقاق</th><th className="px-4 py-3 text-end">المبلغ</th></tr></thead>
                      <tbody>{schedule.map((item) => (
                        <tr key={item.id} className="border-t border-line">
                          <td className="num px-4 py-2.5">{item.seq}{item.seq === schedule.length ? " · أخير" : ""}</td>
                          <td className="num px-4 py-2.5">{formatDateShort(item.dueDate)}</td>
                          <td className="num px-4 py-2.5 text-end font-semibold">{formatMoney(item.amount)}</td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </Card>

                <Card>
                  <h3 className="mb-3 font-bold">معاينة نص العقد</h3>
                  <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-surface-2 p-4 text-sm leading-7">{previewContract || "اختر العميل والسيارة لاستعراض نص العقد."}</pre>
                </Card>
              </div>
            </Fade>
          )}

          <div dir="rtl" className="flex items-center justify-between gap-3">
            <Button type="button" variant="outline" onClick={() => step === 0 ? router.push("/contracts") : setStep((current) => current - 1)}>
              {step === 0 ? "إلغاء" : <><ChevronRight size={16} /> السابق</>}
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => { if (stepIsValid()) setStep((current) => current + 1); }}>
                التالي <ChevronLeft size={16} />
              </Button>
            ) : (
              <Button type="button" onClick={save} disabled={saving || !terms || !customer || !vehicle}>
                <Check size={16} /> {saving ? "جارٍ إنشاء العقد…" : "إنشاء العقد وإرساله للاعتماد"}
              </Button>
            )}
          </div>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <Card dark className="space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div><p className="text-sm text-shell-muted">القسط الشهري</p><p className="num mt-1 text-3xl font-bold text-brand">{terms ? formatAmount(terms.installment) : "—"} <span className="text-sm text-shell-muted">ر.س</span></p></div>
              <span className="rounded-full bg-shell-line px-3 py-1 text-xs text-shell-muted">{terms ? `${months} شهر` : "بانتظار الشروط"}</span>
            </div>
            <div className="space-y-2 border-t border-shell-line pt-4 text-sm">
              <SummaryRow label="العميل" value={customer?.fullName ?? "لم يتم الاختيار"} />
              <SummaryRow label="السيارة" value={vehicle ? `${vehicle.make} ${vehicle.model}` : "لم يتم الاختيار"} />
              <SummaryRow label="سعر السيارة" value={price ? formatMoney(price) : "—"} />
              <SummaryRow label="دفعة السيارة" value={formatMoney(downPayment)} />
              <SummaryRow label="مقدم غير مسترد عند التوقيع" value={formatMoney(upfrontFee)} />
              <SummaryRow label="المبلغ الممول" value={terms ? formatMoney(terms.financedAmount) : "—"} />
              <SummaryRow label={`الضريبة (${Math.round((db.settings.vatRate) * 100)}%)`} value={terms ? formatMoney(terms.vat) : "—"} />
              <SummaryRow label="إجمالي العقد" value={terms ? formatMoney(terms.contractTotal) : "—"} bold />
              <SummaryRow label="إجمالي الأقساط" value={terms ? formatMoney(terms.totalPayable) : "—"} />
              <SummaryRow label="فترة السداد" value={terms && endDate ? `${months} شهراً · ${formatDateShort(firstDue)} — ${formatDateShort(endDate)}` : "—"} />
            </div>
            {terms?.isManual && terms.lastInstallment > 0 && (
              <p className="rounded-lg bg-shell-line p-3 text-xs leading-5 text-shell-muted">القسط الأخير {formatAmount(terms.lastInstallment)} ريال لموازنة إجمالي العقد.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function CustomerPicker({ customers, value, onChange }: { customers: Customer[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = customers.find((customer) => customer.id === value);
  const digits = query.replace(/\D/g, "");
  const filtered = customers.filter((item) => (
    item.fullName.includes(query.trim())
    || item.nationalId.includes(query.trim())
    || item.phone.includes(query.trim())
    || (digits.length > 0 && item.phone.replace(/\D/g, "").includes(digits))
  ));

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <span className="mb-1.5 block text-xs font-semibold text-muted">العميل</span>
      <button type="button" role="combobox" aria-expanded={open} aria-controls="customer-picker-options" aria-haspopup="listbox" onClick={() => setOpen((value) => !value)} className={cn(inputCls, "flex items-center justify-between text-start")}>
        <span className={selected ? "font-semibold" : "text-muted"}>{selected ? `${selected.fullName} — ${selected.city}` : "ابحث واختر عميلاً"}</span>
        <Search size={16} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
          <div className="border-b border-line p-3">
            <label className="relative block">
              <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
              <input autoFocus className={cn(inputCls, "ps-9")} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="الاسم أو الهوية أو الجوال" aria-label="ابحث عن عميل" />
            </label>
          </div>
          <div id="customer-picker-options" role="listbox" aria-label="العملاء" className="max-h-64 overflow-y-auto p-1.5">
            {filtered.length > 0 ? filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={item.id === value}
                onClick={() => { onChange(item.id); setQuery(""); setOpen(false); }}
                className={cn("flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-start hover:bg-surface-2", item.id === value && "bg-brand-soft")}
              >
                <span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.fullName}</span><span className="mt-0.5 block text-xs text-muted">{item.city} · <span className="num" dir="ltr">{formatPhone(item.phone)}</span></span></span>
                {item.id === value && <Check size={16} className="shrink-0 text-brand" />}
              </button>
            )) : <p className="p-5 text-center text-sm text-muted">لا توجد نتائج مطابقة</p>}
          </div>
          <Link
            href={`/customers/new?returnTo=${encodeURIComponent("/contracts/new")}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 border-t border-line px-4 py-3 text-sm font-semibold text-brand transition hover:bg-brand-soft"
          >
            <UserRoundPlus size={17} /> إضافة عميل جديد
          </Link>
        </div>
      )}
    </div>
  );
}

function SchedulePreview({ date, amount, seq }: { date: string; amount: number; seq: number }) {
  return <div className="rounded-lg border border-line bg-surface px-3 py-2"><p className="text-[11px] text-muted">القسط {seq}</p><p className="num mt-1 text-sm font-semibold">{formatDateShort(date)}</p><p className="num text-xs text-brand">{formatMoney(amount)}</p></div>;
}

function ReviewBlock({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line p-4">
      <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold">{title}</h3><button type="button" onClick={onEdit} className="text-xs font-semibold text-brand">تعديل</button></div>
      {children}
    </section>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className="flex justify-between gap-3"><span className="text-shell-muted">{label}</span><span className={cn("num text-end", bold && "font-bold text-white")}>{value}</span></div>;
}
