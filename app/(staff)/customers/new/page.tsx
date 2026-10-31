"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import type { Customer } from "@/types/domain";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { CITIES } from "@/mocks/data/catalog";
import { Button, Card, Fade, Field, inputCls, Select } from "@/components/ui/basics";
import { cn } from "@/lib/utils";
import { appendAudit } from "@/lib/audit";

export default function NewCustomerPage() {
  const router = useRouter();
  const { db, role, update } = useSession();
  const [fullName, setFullName] = useState("");
  const [idType, setIdType] = useState<Customer["idType"]>("citizen");
  const [nationalId, setNationalId] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [city, setCity] = useState<string>(CITIES[0]);
  const [employer, setEmployer] = useState("");
  const [monthlyIncome, setMonthlyIncome] = useState("");
  const [returnTo, setReturnTo] = useState("/customers");
  const [reviewMode, setReviewMode] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedReturn = params.get("returnTo");
    if (requestedReturn === "/contracts/new" || requestedReturn === "/accounts") setReturnTo(requestedReturn);
    setReviewMode(role === "admin" && params.get("accountReview") === "pending");
  }, [role]);

  useEffect(() => {
    if (db && role && !can(role, "customers.create")) router.replace("/customers");
  }, [db, role, router]);

  if (!db || !role || !can(role, "customers.create")) return null;

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const cleanName = fullName.trim().replace(/\s+/g, " ");
    const cleanId = nationalId.replace(/\D/g, "");
    const cleanPhoneDigits = phone.replace(/\D/g, "");
    const normalizedPhone = cleanPhoneDigits.startsWith("966")
      ? `+${cleanPhoneDigits}`
      : cleanPhoneDigits.startsWith("05")
        ? `+966${cleanPhoneDigits.slice(1)}`
        : cleanPhoneDigits.startsWith("5")
          ? `+966${cleanPhoneDigits}`
          : "";
    const income = monthlyIncome === "" ? undefined : Number(monthlyIncome);

    if (cleanName.length < 3) {
      toast.error("أدخل الاسم الكامل للعميل");
      return;
    }
    if (!new RegExp(`^${idType === "citizen" ? "1" : "2"}\\d{9}$`).test(cleanId)) {
      toast.error(idType === "citizen" ? "رقم الهوية الوطنية يجب أن يبدأ بـ 1 ويتكون من 10 أرقام" : "رقم الإقامة يجب أن يبدأ بـ 2 ويتكون من 10 أرقام");
      return;
    }
    if (!/^\+9665\d{8}$/.test(normalizedPhone)) {
      toast.error("أدخل رقم جوال سعودي صحيح يبدأ بـ 05");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast.error("أدخل بريداً إلكترونياً صحيحاً");
      return;
    }
    if (income !== undefined && (!Number.isFinite(income) || income < 0)) {
      toast.error("أدخل دخلاً شهرياً صحيحاً");
      return;
    }

    setSaving(true);
    const customer: Customer = {
      id: `cu-${crypto.randomUUID()}`,
      fullName: cleanName,
      nationalId: cleanId,
      idType,
      phone: normalizedPhone,
      ...(email.trim() ? { email: email.trim() } : {}),
      city,
      ...(employer.trim() ? { employer: employer.trim() } : {}),
      ...(income !== undefined ? { monthlyIncome: income } : {}),
      riskLevel: "low",
      portalEnabled: !reviewMode,
      reviewStatus: reviewMode ? "pending" : "approved",
      documents: [],
      communications: [],
      createdAt: new Date().toISOString(),
    };
    let duplicate = false;
    update((current) => {
      const phoneDigits = (value: string) => value.replace(/\D/g, "").replace(/^0/, "966");
      if (current.customers.some((existing) =>
        existing.nationalId === customer.nationalId || phoneDigits(existing.phone) === phoneDigits(customer.phone),
      )) {
        duplicate = true;
        return;
      }
      current.customers.unshift(customer);
      appendAudit(current, {
        userId: role === "admin" ? "u-admin" : "u-sales1",
        actorRole: role,
        action: "customer.created",
        entity: "customer",
        entityId: customer.id,
        details: `إنشاء حساب بوابة للعميل ${customer.fullName}`,
        severity: "warning",
      }, role);
    });

    if (duplicate) {
      setSaving(false);
      toast.error("يوجد عميل مسجل بنفس رقم الهوية أو الجوال");
      return;
    }

    toast.success(reviewMode ? "تم إنشاء ملف العميل وإرساله للمراجعة" : "تم إنشاء ملف العميل وتفعيل حسابه في بوابة العميل");
    if (reviewMode) {
      router.push("/accounts");
      return;
    }
    if (returnTo.startsWith("/contracts/new")) {
      router.push(`/contracts/new?customerId=${encodeURIComponent(customer.id)}`);
    } else {
      router.push(`/customers/${customer.id}`);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade>
        <Link href="/customers" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-brand">
          <ArrowRight size={16} /> العودة إلى العملاء
        </Link>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><UserRoundPlus size={22} /></span>
          <div><h1 className="text-2xl font-bold">إنشاء عميل جديد</h1><p className="mt-1 text-sm text-muted">أدخل بيانات العميل لإنشاء ملفه وتفعيل حسابه في بوابة العميل.</p></div>
        </div>
      </Fade>

      <form onSubmit={save} className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="space-y-5 lg:col-span-2">
          <div><h2 className="font-bold">البيانات الأساسية</h2><p className="mt-1 text-xs text-muted">الحقول المميزة بنجمة مطلوبة لإتمام التسجيل.</p></div>
          <Field label="الاسم الكامل *">
            <input required minLength={3} autoComplete="name" className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="الاسم كما يظهر في الهوية" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="نوع الهوية *">
              <Select value={idType} onChange={(e) => { setIdType(e.target.value as Customer["idType"]); setNationalId(""); }}>
                <option value="citizen">هوية وطنية</option>
                <option value="resident">إقامة</option>
              </Select>
            </Field>
            <Field label={idType === "citizen" ? "رقم الهوية الوطنية *" : "رقم الإقامة *"}>
              <input required className={cn(inputCls, "num")} value={nationalId} onChange={(e) => setNationalId(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="numeric" pattern={idType === "citizen" ? "1\\d{9}" : "2\\d{9}"} placeholder={idType === "citizen" ? "1xxxxxxxxx" : "2xxxxxxxxx"} dir="ltr" />
            </Field>
            <Field label="رقم الجوال *">
              <input required className={cn(inputCls, "num")} value={phone} onChange={(e) => setPhone(e.target.value.replace(/[^\d+]/g, "").slice(0, 14))} inputMode="tel" autoComplete="tel" pattern="(05\\d{8}|5\\d{8}|9665\\d{8}|\\+9665\\d{8})" placeholder="05xxxxxxxx" dir="ltr" />
            </Field>
            <Field label="البريد الإلكتروني">
              <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="name@example.com" dir="ltr" />
            </Field>
            <Field label="المدينة *">
              <Select required value={city} onChange={(e) => setCity(e.target.value)}>{CITIES.map((item) => <option key={item} value={item}>{item}</option>)}</Select>
            </Field>
            <Field label="جهة العمل">
              <input className={inputCls} value={employer} onChange={(e) => setEmployer(e.target.value)} autoComplete="organization" />
            </Field>
            <Field label="الدخل الشهري (ريال)">
              <input className={cn(inputCls, "num")} type="number" min="0" step="0.01" inputMode="decimal" value={monthlyIncome} onChange={(e) => setMonthlyIncome(e.target.value)} />
            </Field>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className={cn("space-y-3", reviewMode ? "border-warning/30 bg-warning-soft" : "border-success/30 bg-success-soft")}>
            <ShieldCheck size={22} className="text-success" />
            <div>
            <p className={cn("font-semibold", reviewMode ? "text-warning" : "text-success")}>{reviewMode ? "طلب حساب قيد المراجعة" : "حساب بوابة العميل"}</p>
            <p className="mt-1 text-xs leading-5 text-muted">{reviewMode ? "سيُحفظ ملف العميل دون دخول للبوابة حتى تعتمد الإدارة الطلب من مركز الحسابات." : "سيُربط الحساب بملف العميل ورقم جواله، ويصبح متاحاً في تسجيل الدخول التجريبي. يلزم ربط خدمة مصادقة لإعداد كلمات مرور وتحقق فعلي."}</p>
            </div>
          </Card>
          <Card className="space-y-3 bg-surface-2">
            <h2 className="font-bold">قبل الحفظ</h2>
            <p className="text-sm leading-6 text-muted">تأكد من مطابقة الاسم ورقم الهوية ورقم الجوال للوثائق الرسمية.</p>
            <p className="border-t border-line pt-3 text-xs leading-5 text-muted">سيتم منع تكرار العميل عند استخدام رقم هوية أو جوال مسجل مسبقاً.</p>
          </Card>
        </div>

        <div className="flex justify-end gap-2 lg:col-span-3">
          <Button type="button" variant="outline" onClick={() => router.push("/customers")}>إلغاء</Button>
          <Button type="submit" disabled={saving}><UserRoundPlus size={16} /> {saving ? "جارٍ إنشاء الحساب…" : "إنشاء العميل والحساب"}</Button>
        </div>
      </form>
    </div>
  );
}
