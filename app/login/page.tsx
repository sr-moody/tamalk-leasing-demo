"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Car, ShieldCheck, Truck, User } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@/types/domain";
import { appConfig } from "@/lib/config";
import { homeFor } from "@/lib/permissions";
import { ROLE_LABEL, useSession } from "@/lib/session";
import { Button, Fade, Field, Select } from "@/components/ui/basics";

const ROLES: { role: Role; icon: typeof User; desc: string }[] = [
  { role: "admin", icon: ShieldCheck, desc: "كل الصلاحيات واعتماد العقود" },
  { role: "sales", icon: Car, desc: "إنشاء العقود ومتابعة العملاء" },
  { role: "accountant", icon: Calculator, desc: "تسجيل الدفعات والتحصيل" },
  { role: "procurement", icon: Truck, desc: "الأسطول والمصروفات" },
  { role: "customer", icon: User, desc: "بوابة العميل — أقساطي وسيارتي" },
];

export default function LoginPage() {
  const router = useRouter();
  const { db, customerId, setCustomerId, setRole } = useSession();
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(customerId ?? "");
  useEffect(() => {
    if (customerId) setSelectedCustomer(customerId);
  }, [customerId]);
  const login = (role: Role) => {
    if (role === "customer") {
      setCustomerPickerOpen(true);
      return;
    }
    setRole(role);
    toast.success(`مرحباً، تم الدخول بصفة ${ROLE_LABEL[role]}`);
    router.push(homeFor(role));
  };
  const loginCustomer = () => {
    if (!db?.customers.some((customer) =>
      customer.id === selectedCustomer &&
      customer.portalEnabled !== false &&
      customer.reviewStatus !== "pending" &&
      customer.reviewStatus !== "rejected",
    )) {
      toast.error("اختر حساب عميل مفعلاً للمتابعة");
      return;
    }
    setCustomerId(selectedCustomer);
    setRole("customer");
    toast.success("تم الدخول إلى بوابة العميل");
    router.push(homeFor("customer"));
  };
  return (
    <main className="flex min-h-screen flex-col lg:flex-row">
      <section className="flex flex-col justify-between bg-ink p-8 text-white lg:w-1/2 lg:p-14">
        <div className="flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand text-lg font-bold">ت</span>
          <span className="text-xl font-bold">{appConfig.brandName}</span>
        </div>
        <Fade className="py-10">
          <h1 className="text-3xl font-bold leading-snug lg:text-5xl">سيارتك… تملكها قسطاً بقسط.</h1>
          <p className="mt-4 max-w-md text-shell-muted lg:text-lg">منصة واحدة لإدارة التأجير المنتهي بالتمليك: العقود، التحصيل، الأسطول، وبوابة العميل.</p>
        </Fade>
        <p className="hidden text-xs text-shell-muted lg:block">نسخة عرض تجريبية — البيانات وهمية وتُولَّد يومياً</p>
      </section>
      <section className="flex flex-1 items-center justify-center bg-surface p-6 lg:p-14">
        <div className="w-full max-w-md">
          <h2 className="text-2xl font-bold">دخول سريع</h2>
          <p className="mb-6 text-sm text-muted">اختر الدور الذي تريد استعراض المنصة به</p>
          <div className="space-y-3">
            {ROLES.map(({ role, icon: Icon, desc }, i) => (
              <Fade key={role} delay={i * 0.06}>
                <button
                  onClick={() => login(role)}
                  className="group flex w-full items-center gap-4 rounded-2xl border border-line bg-surface p-4 text-start transition hover:border-brand hover:shadow-lift"
                >
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-ink text-white transition group-hover:bg-brand">
                    <Icon size={22} />
                  </span>
                  <span>
                    <span className="block text-base font-bold">{ROLE_LABEL[role]}</span>
                    <span className="block text-xs text-muted">{desc}</span>
                  </span>
                </button>
              </Fade>
            ))}
          </div>
          {customerPickerOpen && (
            <Fade className="mt-4 rounded-2xl border border-brand/30 bg-brand-soft p-4">
              <h3 className="font-bold">الدخول إلى بوابة العميل</h3>
              <p className="mb-4 mt-1 text-xs leading-5 text-muted">اختر حساباً تجريبياً مسجلاً. في بيئة الإنتاج يلزم تفعيل تسجيل الدخول الآمن.</p>
              <Field label="حساب العميل">
                <Select value={selectedCustomer} onChange={(event) => setSelectedCustomer(event.target.value)}>
                  <option value="">اختر العميل</option>
                  {db?.customers.filter((customer) =>
                    customer.portalEnabled !== false &&
                    customer.reviewStatus !== "pending" &&
                    customer.reviewStatus !== "rejected",
                  ).map((customer) => (
                    <option key={customer.id} value={customer.id}>{customer.fullName} — {customer.city}</option>
                  ))}
                </Select>
              </Field>
              <div className="mt-3 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setCustomerPickerOpen(false)}>إلغاء</Button>
                <Button type="button" onClick={loginCustomer}>دخول البوابة</Button>
              </div>
            </Fade>
          )}
        </div>
      </section>
    </main>
  );
}
