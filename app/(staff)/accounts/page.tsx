"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, BadgeCheck, BriefcaseBusiness, Check, CircleUserRound, Clock3, CreditCard, FileText, Mail, Pencil, Phone, Plus, Shield, Trash2, UserRoundX, Users, X } from "lucide-react";
import { toast } from "sonner";
import type { StaffRole, User } from "@/types/domain";
import { can } from "@/lib/permissions";
import { ROLE_LABEL, useSession } from "@/lib/session";
import { Button, Card, Dialog, Fade, Field, inputCls, Select } from "@/components/ui/basics";
import { CITIES } from "@/mocks/data/catalog";
import { formatDateTime, formatPhone, maskNationalId } from "@/lib/format";
import { cn } from "@/lib/utils";
import { appendAudit } from "@/lib/audit";
import { auditActionLabel } from "@/lib/audit-labels";

type AccountTab = "all" | "staff" | "customers" | "review";
type EditingAccount = { kind: "staff"; id: string } | { kind: "customer"; id: string };
const STAFF_ROLES: StaffRole[] = ["admin", "sales", "accountant", "procurement"];
const TAB_LABELS: Record<AccountTab, string> = { all: "الكل", staff: "الفريق", customers: "العملاء", review: "بانتظار المراجعة" };

export default function AccountsPage() {
  const router = useRouter();
  const { db, role, update } = useSession();
  const [tab, setTab] = useState<AccountTab>("all");
  const [editing, setEditing] = useState<EditingAccount | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<StaffRole>("sales");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (db && role && !can(role, "users.manage")) router.replace("/dashboard");
  }, [db, role, router]);

  if (!db || !can(role, "users.manage")) return null;

  const pendingCount =
    db.users.filter((user) => user.reviewStatus === "pending").length +
    db.customers.filter((customer) => customer.reviewStatus === "pending").length;
  const visibleUsers = tab === "customers" ? [] : db.users.filter((user) => tab !== "review" || user.reviewStatus === "pending" || user.reviewStatus === "rejected");
  const visibleCustomers = tab === "staff" ? [] : db.customers.filter((customer) => tab !== "review" || customer.reviewStatus === "pending" || customer.reviewStatus === "rejected");
  const editedUser = editing?.kind === "staff" ? db.users.find((user) => user.id === editing.id) : undefined;
  const editedCustomer = editing?.kind === "customer" ? db.customers.find((customer) => customer.id === editing.id) : undefined;
  const viewedUser = profileId ? db.users.find((user) => user.id === profileId) : undefined;
  const viewedUserContracts = viewedUser ? db.contracts.filter((contract) => contract.createdBy === viewedUser.id) : [];
  const viewedUserPayments = viewedUser ? db.contracts.flatMap((contract) => contract.payments.filter((payment) => payment.createdBy === viewedUser.id)) : [];
  const viewedUserActivity = viewedUser ? db.audit.filter((entry) => entry.userId === viewedUser.id).slice(0, 5) : [];
  const viewedUserProtected = viewedUser ? viewedUser.id === "u-admin" || db.audit.some((item) => item.userId === viewedUser.id) ||
    db.contracts.some((item) => item.createdBy === viewedUser.id || item.approvedBy === viewedUser.id || item.payments.some((payment) => payment.createdBy === viewedUser.id)) ||
    db.vehicles.some((item) => item.statusHistory.some((event) => event.by === viewedUser.id)) : false;

  const recordAudit = (current: typeof db, entity: "customer" | "user", entityId: string, action: string, details: string) => {
    const severity = action.endsWith(".deleted") ? "critical" : "warning";
    appendAudit(current, { userId: "u-admin", actorRole: "admin", action, entity, entityId, details, severity }, "admin");
  };

  const createStaff = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (creating) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const phone = String(form.get("phone") ?? "").trim();
    if (name.length < 3 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\+?[0-9]{9,15}$/.test(phone)) {
      toast.error("تحقق من الاسم والبريد الإلكتروني ورقم الجوال");
      return;
    }
    if (db.users.some((user) => user.email.toLowerCase() === email)) {
      toast.error("البريد الإلكتروني مستخدم لحساب موظف آخر");
      return;
    }
    setCreating(true);
    const user: User = {
      id: `u-${crypto.randomUUID()}`,
      name,
      email,
      phone,
      role: newRole,
      active: false,
      reviewStatus: "pending",
    };
    update((current) => {
      current.users.unshift(user);
      recordAudit(current, "user", user.id, "user.created", `إضافة حساب موظف قيد المراجعة: ${name}`);
    });
    event.currentTarget.reset();
    setCreating(false);
    setTab("review");
    toast.success("تم إنشاء حساب الموظف وإرساله للمراجعة");
  };

  const saveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const phone = String(form.get("phone") ?? "").trim();
    if (name.length < 3 || !/^\+?[0-9]{9,15}$/.test(phone) || (editing.kind === "staff" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) {
      toast.error("تحقق من الاسم ورقم الجوال");
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("أدخل بريداً إلكترونياً صحيحاً");
      return;
    }
    let updated = false;
    update((current) => {
      if (editing.kind === "staff") {
        const user = current.users.find((item) => item.id === editing.id);
        const nextRole = user?.id === "u-admin" ? user.role : STAFF_ROLES.find((item) => item === form.get("role"));
        if (!user || !nextRole || (user.id === "u-admin" && nextRole !== "admin") || current.users.some((item) => item.id !== user.id && item.email.toLowerCase() === email)) return;
        user.name = name;
        user.email = email;
        user.phone = phone;
        user.role = nextRole;
        recordAudit(current, "user", user.id, "user.updated", `تم تحديث بيانات الموظف: ${name}`);
        updated = true;
      } else {
        const customer = current.customers.find((item) => item.id === editing.id);
        const customerPhone = phone.replace(/\s/g, "");
        const city = String(form.get("city") ?? "");
        const incomeValue = String(form.get("monthlyIncome") ?? "").trim();
        const income = incomeValue === "" ? undefined : Number(incomeValue);
        if (
          !customer ||
          !/^\+9665\d{8}$/.test(customerPhone) ||
          !CITIES.some((item) => item === city) ||
          (income !== undefined && (!Number.isFinite(income) || income < 0))
        ) return;
        if (current.customers.some((item) => item.id !== customer.id && (item.phone === customerPhone || (email && item.email?.toLowerCase() === email)))) return;
        customer.fullName = name;
        customer.phone = customerPhone;
        customer.email = email || undefined;
        customer.city = city;
        customer.employer = String(form.get("employer") ?? "").trim() || undefined;
        customer.monthlyIncome = income;
        recordAudit(current, "customer", customer.id, "customer.updated", `تم تحديث بيانات العميل: ${name}`);
        updated = true;
      }
    });
    if (!updated) {
      toast.error("تعذر حفظ التعديل. تحقق من البريد أو الجوال والبيانات المدخلة.");
      return;
    }
    setEditing(null);
    toast.success("تم تحديث بيانات الحساب");
  };

  const setAccountReview = (kind: "staff" | "customer", id: string, nextStatus: "pending" | "approved" | "rejected") => {
    update((current) => {
      if (kind === "staff") {
        const user = current.users.find((item) => item.id === id);
        if (!user || user.reviewStatus === "approved" || (user.id === "u-admin" && nextStatus !== "approved")) return;
        user.reviewStatus = nextStatus;
        user.active = nextStatus === "approved";
        const action = nextStatus === "approved" ? "user.approved" : nextStatus === "rejected" ? "user.rejected" : "user.review_requested";
        const label = nextStatus === "approved" ? "اعتماد" : nextStatus === "rejected" ? "رفض" : "إعادة للمراجعة";
        recordAudit(current, "user", id, action, `${label} حساب الموظف ${user.name}`);
      } else {
        const customer = current.customers.find((item) => item.id === id);
        if (!customer || customer.reviewStatus === "approved") return;
        customer.reviewStatus = nextStatus;
        customer.portalEnabled = nextStatus === "approved";
        const action = nextStatus === "approved" ? "customer.approved" : nextStatus === "rejected" ? "customer.rejected" : "customer.review_requested";
        const label = nextStatus === "approved" ? "اعتماد" : nextStatus === "rejected" ? "رفض" : "إعادة للمراجعة";
        recordAudit(current, "customer", id, action, `${label} حساب العميل ${customer.fullName}`);
      }
    });
    toast.success(nextStatus === "approved" ? "تم اعتماد الحساب وتفعيله" : nextStatus === "rejected" ? "تم رفض طلب الحساب" : "تمت إعادة الحساب إلى قائمة المراجعة");
  };

  const toggleAccess = (kind: "staff" | "customer", id: string) => {
    if (kind === "staff" && id === "u-admin") {
      toast.error("لا يمكن تعطيل حساب المدير الأساسي");
      return;
    }
    update((current) => {
      if (kind === "staff") {
        const user = current.users.find((item) => item.id === id);
        if (!user || user.reviewStatus === "pending" || user.reviewStatus === "rejected") return;
        user.active = !user.active;
        recordAudit(current, "user", id, user.active ? "user.enabled" : "user.disabled", `${user.active ? "تفعيل" : "تعطيل"} حساب الموظف ${user.name}`);
      } else {
        const customer = current.customers.find((item) => item.id === id);
        if (!customer || customer.reviewStatus === "pending" || customer.reviewStatus === "rejected") return;
        customer.portalEnabled = customer.portalEnabled === false;
        recordAudit(current, "customer", id, customer.portalEnabled ? "customer.enabled" : "customer.disabled", `${customer.portalEnabled ? "تفعيل" : "تعطيل"} حساب العميل ${customer.fullName}`);
      }
    });
    toast.success("تم تحديث حالة الدخول");
  };

  const removeAccount = (kind: "staff" | "customer", id: string): boolean => {
    if (kind === "staff") {
      const user = db.users.find((item) => item.id === id);
      const hasActivity = db.audit.some((item) => item.userId === id) ||
        db.contracts.some((item) => item.createdBy === id || item.approvedBy === id) ||
        db.contracts.some((item) => item.payments.some((payment) => payment.createdBy === id)) ||
        db.vehicles.some((item) => item.statusHistory.some((event) => event.by === id));
      if (!user || user.id === "u-admin" || hasActivity) {
        update((current) => recordAudit(current, "user", id, "user.delete_blocked", "تم منع محاولة حذف حساب أساسي أو مرتبط بسجل"));
        toast.error("لا يمكن حذف حساب له عمليات مسجلة أو حساب المدير الأساسي؛ يمكنك تعطيله بدلاً من ذلك");
        return false;
      }
      if (!window.confirm(`هل تريد حذف حساب الموظف ${user.name}؟`)) return false;
      update((current) => {
        current.users = current.users.filter((item) => item.id !== id);
        recordAudit(current, "user", id, "user.deleted", `حذف حساب الموظف ${user.name}`);
      });
    } else {
      const customer = db.customers.find((item) => item.id === id);
      const hasActivity = db.contracts.some((item) => item.customerId === id);
      if (!customer || hasActivity) {
        update((current) => recordAudit(current, "customer", id, "customer.delete_blocked", "تم منع محاولة حذف عميل مرتبط بعقد"));
        toast.error("لا يمكن حذف عميل مرتبط بعقد أو سجل عمليات؛ عطّل حساب البوابة بدلاً من ذلك");
        return false;
      }
      if (!window.confirm(`هل تريد حذف ملف العميل ${customer.fullName}؟`)) return false;
      update((current) => {
        current.customers = current.customers.filter((item) => item.id !== id);
        recordAudit(current, "customer", id, "customer.deleted", `حذف ملف العميل ${customer.fullName}`);
      });
    }
    toast.success("تم حذف الحساب");
    return true;
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Fade className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted"><Shield size={16} className="text-brand" /> إدارة وصلاحيات</div>
          <h1 className="mt-1 text-2xl font-bold">مركز الحسابات</h1>
          <p className="mt-1 text-sm text-muted">إدارة حسابات الفريق والعملاء ومراجعة طلبات الوصول.</p>
        </div>
        <Link href="/customers/new?accountReview=pending&returnTo=%2Faccounts"><Button><Plus size={16} /> طلب حساب عميل</Button></Link>
      </Fade>

      <div className="grid gap-3 sm:grid-cols-3">
        <Summary icon={<Users size={18} />} label="حسابات الفريق" value={String(db.users.length)} />
        <Summary icon={<CircleUserRound size={18} />} label="حسابات العملاء" value={String(db.customers.length)} />
        <Summary icon={<Clock3 size={18} />} label="قيد المراجعة" value={String(pendingCount)} accent />
      </div>

      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h2 className="font-bold">إضافة حساب موظف</h2><p className="mt-1 text-xs text-muted">الحساب الجديد يبقى غير نشط حتى اعتماده من الإدارة. لا تُنشأ كلمة مرور في هذا النموذج التجريبي.</p></div>
        </div>
        <form onSubmit={createStaff} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input required minLength={3} name="name" className={inputCls} placeholder="الاسم الكامل" aria-label="اسم الموظف" />
          <input required type="email" name="email" className={inputCls} placeholder="البريد الإلكتروني" aria-label="بريد الموظف" dir="ltr" />
          <input required type="tel" name="phone" className={cn(inputCls, "num")} placeholder="+9665xxxxxxxx" aria-label="جوال الموظف" dir="ltr" />
          <Select aria-label="دور الموظف" value={newRole} onChange={(event) => setNewRole(event.target.value as StaffRole)}>
            {STAFF_ROLES.map((staffRole) => <option key={staffRole} value={staffRole}>{ROLE_LABEL[staffRole]}</option>)}
          </Select>
          <Button type="submit" disabled={creating}><Plus size={16} /> إنشاء للمراجعة</Button>
        </form>
      </Card>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="تصفية الحسابات">
        {(Object.keys(TAB_LABELS) as AccountTab[]).map((key) => (
          <Button key={key} type="button" variant={tab === key ? "dark" : "outline"} className="px-3 py-2 text-xs" onClick={() => setTab(key)}>
            {TAB_LABELS[key]}{key === "review" && pendingCount > 0 ? ` (${pendingCount})` : ""}
          </Button>
        ))}
      </div>

      {visibleUsers.length === 0 && visibleCustomers.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted">لا توجد حسابات في هذا القسم.</Card>
      ) : (
        <div className="space-y-7">
          {visibleUsers.length > 0 && (
            <section className="space-y-3" aria-labelledby="staff-accounts">
              <div className="flex items-center justify-between gap-3">
                <h2 id="staff-accounts" className="font-bold">الفريق ({visibleUsers.length})</h2>
                <p className="text-xs text-muted">افتح ملف الموظف لمراجعة بياناته ونشاطه</p>
              </div>
              <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleUsers.map((user) => {
                const status = user.reviewStatus === "pending" ? "بانتظار المراجعة" : user.reviewStatus === "rejected" ? "مرفوض" : user.active ? "نشط" : "معطل";
                const pending = user.reviewStatus === "pending";
                const reviewable = pending || user.reviewStatus === "rejected";
                const protectedFromDelete = user.id === "u-admin" || db.audit.some((item) => item.userId === user.id) ||
                  db.contracts.some((item) => item.createdBy === user.id || item.approvedBy === user.id || item.payments.some((payment) => payment.createdBy === user.id)) ||
                  db.vehicles.some((item) => item.statusHistory.some((event) => event.by === user.id));
                return (
                  <AccountCard key={user.id} title={user.name} subtitle={`${ROLE_LABEL[user.role]} · ${user.email}`} contact={formatPhone(user.phone)} status={status} pending={pending}>
                    <button type="button" onClick={() => setProfileId(user.id)} className="text-xs font-semibold text-brand hover:underline">عرض ملف الموظف</button>
                    <AccountActions
                      onEdit={() => setEditing({ kind: "staff", id: user.id })}
                      onReview={(nextStatus) => setAccountReview("staff", user.id, nextStatus)}
                      onToggle={() => toggleAccess("staff", user.id)}
                      onDelete={() => removeAccount("staff", user.id)}
                      pending={pending}
                      rejected={user.reviewStatus === "rejected"}
                      reviewable={reviewable}
                      active={user.active}
                      protectedFromDelete={protectedFromDelete}
                    />
                  </AccountCard>
                );
              })}
              </div>
            </section>
          )}
          {visibleCustomers.length > 0 && (
            <section className="space-y-3" aria-labelledby="customer-accounts">
              <h2 id="customer-accounts" className="font-bold">العملاء ({visibleCustomers.length})</h2>
              <div className="grid items-stretch gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCustomers.map((customer) => {
                const pending = customer.reviewStatus === "pending";
                const reviewable = pending || customer.reviewStatus === "rejected";
                const status = pending ? "بانتظار المراجعة" : customer.reviewStatus === "rejected" ? "مرفوض" : customer.portalEnabled === false ? "معطل" : "نشط";
                const protectedFromDelete = db.contracts.some((item) => item.customerId === customer.id);
                return (
                  <AccountCard key={customer.id} title={customer.fullName} subtitle={`${customer.city} · ${maskNationalId(customer.nationalId)}`} contact={formatPhone(customer.phone)} status={status} pending={pending}>
                    <Link href={`/customers/${customer.id}`} className="text-xs font-semibold text-brand hover:underline">عرض ملف العميل</Link>
                    <AccountActions
                      onEdit={() => setEditing({ kind: "customer", id: customer.id })}
                      onReview={(nextStatus) => setAccountReview("customer", customer.id, nextStatus)}
                      onToggle={() => toggleAccess("customer", customer.id)}
                      onDelete={() => removeAccount("customer", customer.id)}
                      pending={pending}
                      rejected={customer.reviewStatus === "rejected"}
                      reviewable={reviewable}
                      active={customer.portalEnabled !== false}
                      protectedFromDelete={protectedFromDelete}
                    />
                  </AccountCard>
                );
              })}
              </div>
            </section>
          )}
        </div>
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editedUser ? "تعديل حساب الموظف" : "تعديل ملف العميل"}
      >
        {(editedUser || editedCustomer) && (
          <form onSubmit={saveEdit} className="max-h-[75vh] space-y-4 overflow-y-auto">
            <Field label="الاسم الكامل">
              <input required minLength={3} name="name" defaultValue={editedUser?.name ?? editedCustomer?.fullName ?? ""} className={inputCls} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="البريد الإلكتروني">
                <input type="email" name="email" defaultValue={editedUser?.email ?? editedCustomer?.email ?? ""} className={inputCls} dir="ltr" />
              </Field>
              <Field label="رقم الجوال">
                <input required type="tel" name="phone" defaultValue={editedUser?.phone ?? editedCustomer?.phone ?? ""} className={cn(inputCls, "num")} dir="ltr" />
              </Field>
            </div>
            {editedUser ? (
              <Field label="الدور الوظيفي">
                <Select name="role" defaultValue={editedUser.role} disabled={editedUser.id === "u-admin"}>
                  {STAFF_ROLES.map((staffRole) => <option key={staffRole} value={staffRole}>{ROLE_LABEL[staffRole]}</option>)}
                </Select>
              </Field>
            ) : editedCustomer ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="المدينة">
                    <Select name="city" defaultValue={editedCustomer.city}>
                      {CITIES.map((city) => <option key={city} value={city}>{city}</option>)}
                    </Select>
                  </Field>
                  <Field label="الدخل الشهري">
                    <input type="number" min="0" step="0.01" name="monthlyIncome" defaultValue={editedCustomer.monthlyIncome ?? ""} className={cn(inputCls, "num")} />
                  </Field>
                </div>
                <Field label="جهة العمل">
                  <input name="employer" defaultValue={editedCustomer.employer ?? ""} className={inputCls} />
                </Field>
                <p className="text-xs leading-5 text-muted">رقم الهوية لا يُعدّل من هذا النموذج لحماية مرجعية العقود والمستندات.</p>
              </>
            ) : null}
            <div className="flex justify-end gap-2 border-t border-line pt-3">
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
              <Button type="submit"><Pencil size={15} /> حفظ التغييرات</Button>
            </div>
          </form>
        )}
      </Dialog>
      <Dialog open={Boolean(viewedUser)} onClose={() => setProfileId(null)} title="الملف الوظيفي">
        {viewedUser && (
          <div className="max-h-[78vh] space-y-4 overflow-y-auto pe-1">
            <Card className="flex items-center gap-3 bg-neutral-soft/50 p-4 shadow-none">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-ink font-bold text-white">{viewedUser.name.charAt(0)}</span>
              <div className="min-w-0 flex-1">
                <h3 className="truncate font-bold">{viewedUser.name}</h3>
                <p className="mt-1 text-xs text-muted">{ROLE_LABEL[viewedUser.role]}</p>
              </div>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", viewedUser.active ? "bg-success-soft text-success" : "bg-neutral-soft text-muted")}>{viewedUser.active ? "نشط" : "غير نشط"}</span>
            </Card>
            <div className="grid grid-cols-2 gap-2">
              <ProfileMetric icon={<BriefcaseBusiness size={16} />} label="عقود أنشأها" value={String(viewedUserContracts.length)} />
              <ProfileMetric icon={<CreditCard size={16} />} label="دفعات سجلها" value={String(viewedUserPayments.length)} />
            </div>
            <div className="space-y-2 rounded-xl border border-line p-3">
              <ProfileInfo icon={<Mail size={15} />} label="البريد الإلكتروني" value={viewedUser.email} />
              <ProfileInfo icon={<Phone size={15} />} label="رقم الجوال" value={formatPhone(viewedUser.phone)} />
              <ProfileInfo icon={<BadgeCheck size={15} />} label="حالة المراجعة" value={viewedUser.reviewStatus === "pending" ? "بانتظار المراجعة" : viewedUser.reviewStatus === "rejected" ? "مرفوض" : "معتمد"} />
              <ProfileInfo icon={<Activity size={15} />} label="آخر دخول" value={viewedUser.lastLoginAt ? new Date(viewedUser.lastLoginAt).toLocaleString("ar-SA") : "غير مسجل"} />
            </div>
            <div className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold"><FileText size={15} className="text-brand" /> أحدث العمليات</h3>
              {viewedUserActivity.length ? viewedUserActivity.map((entry) => (
                <div key={entry.id} className="flex items-start justify-between gap-3 rounded-lg bg-neutral-soft/60 p-2.5">
                  <div className="min-w-0"><p className="text-xs font-semibold leading-5">{auditActionLabel(entry.action)}</p>{entry.details && <p className="mt-1 break-words text-xs leading-5 text-muted">{entry.details}</p>}</div>
                  <time className="num shrink-0 text-[11px] text-muted" dateTime={entry.at}>{formatDateTime(entry.at)}</time>
                </div>
              )) : <p className="rounded-lg bg-neutral-soft/60 p-3 text-xs text-muted">لا توجد عمليات مسجلة لهذا الموظف.</p>}
            </div>
            <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-3">
              <Button type="button" variant="outline" className="px-3 py-2 text-xs" onClick={() => { setProfileId(null); setEditing({ kind: "staff", id: viewedUser.id }); }}><Pencil size={14} /> تعديل البيانات</Button>
              {viewedUser.reviewStatus !== "pending" && viewedUser.reviewStatus !== "rejected" && (
                <Button type="button" variant="outline" className="px-3 py-2 text-xs" onClick={() => toggleAccess("staff", viewedUser.id)}><UserRoundX size={14} /> {viewedUser.active ? "تعطيل الدخول" : "تفعيل الدخول"}</Button>
              )}
              {(viewedUser.reviewStatus === "pending" || viewedUser.reviewStatus === "rejected") && (
                <>
                  <Button type="button" className="px-3 py-2 text-xs" onClick={() => setAccountReview("staff", viewedUser.id, "approved")}><Check size={14} /> اعتماد</Button>
                  {viewedUser.reviewStatus === "pending"
                    ? <Button type="button" variant="outline" className="px-3 py-2 text-xs text-danger" onClick={() => setAccountReview("staff", viewedUser.id, "rejected")}><X size={14} /> رفض</Button>
                    : <Button type="button" variant="outline" className="px-3 py-2 text-xs" onClick={() => setAccountReview("staff", viewedUser.id, "pending")}><Clock3 size={14} /> إعادة للمراجعة</Button>}
                </>
              )}
              {!viewedUserProtected && viewedUser.id !== "u-admin" && (
                <Button type="button" variant="ghost" className="px-2 py-2 text-xs text-danger" onClick={() => { if (removeAccount("staff", viewedUser.id)) setProfileId(null); }}><Trash2 size={14} /> حذف الحساب</Button>
              )}
              {viewedUserProtected && <span className="self-center text-[11px] text-muted">الحذف معطل لوجود سجل مرتبط</span>}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

function Summary({ icon, label, value, accent }: { icon: ReactNode; label: string; value: string; accent?: boolean }) {
  return <Card className="flex items-center gap-3"><span className={cn("grid h-10 w-10 place-items-center rounded-xl", accent ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand")}>{icon}</span><div><p className="text-xs text-muted">{label}</p><p className="num text-xl font-bold">{value}</p></div></Card>;
}

function ProfileMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="rounded-xl border border-line p-3"><span className="flex items-center gap-2 text-[11px] text-muted">{icon}{label}</span><p className="num mt-1 text-lg font-bold">{value}</p></div>;
}

function ProfileInfo({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return <div className="flex items-center gap-2 text-xs"><span className="text-muted">{icon}</span><span className="text-muted">{label}</span><span className="ms-auto max-w-[65%] truncate font-medium" title={value}>{value}</span></div>;
}

function AccountCard({
  title, subtitle, contact, status, pending, children,
}: { title: string; subtitle: string; contact: string; status: string; pending: boolean; children: ReactNode }) {
  return (
    <Card className="flex h-full flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink font-bold text-white">{title.charAt(0)}</span>
        <div className="min-w-0 flex-1"><h3 className="truncate font-bold">{title}</h3><p className="mt-1 truncate text-xs text-muted">{subtitle}</p><p className="num mt-1 text-xs text-muted" dir="ltr">{contact}</p></div>
        <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", pending ? "bg-warning-soft text-warning" : status === "نشط" ? "bg-success-soft text-success" : status === "مرفوض" ? "bg-danger-soft text-danger" : "bg-neutral-soft text-muted")}>{status}</span>
      </div>
      <div className="mt-auto space-y-3 pt-1">{children}</div>
    </Card>
  );
}

function AccountActions({
  onEdit, onReview, onToggle, onDelete, pending, rejected, reviewable, active, protectedFromDelete,
}: { onEdit: () => void; onReview: (status: "pending" | "approved" | "rejected") => void; onToggle: () => void; onDelete: () => void; pending: boolean; rejected: boolean; reviewable: boolean; active: boolean; protectedFromDelete: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line pt-3">
      {reviewable ? (
        <>
          <Button type="button" className="px-3 py-2 text-xs" onClick={() => onReview("approved")}><Check size={14} /> اعتماد</Button>
          {pending ? (
            <Button type="button" variant="outline" className="px-3 py-2 text-xs text-danger" onClick={() => onReview("rejected")}><X size={14} /> رفض</Button>
          ) : rejected ? (
            <Button type="button" variant="outline" className="px-3 py-2 text-xs" onClick={() => onReview("pending")}><Clock3 size={14} /> إعادة للمراجعة</Button>
          ) : null}
        </>
      ) : (
        <Button type="button" variant="outline" className="px-3 py-2 text-xs" onClick={onToggle}><UserRoundX size={14} /> {active ? "تعطيل الدخول" : "تفعيل الدخول"}</Button>
      )}
      <Button type="button" variant="ghost" className="px-3 py-2 text-xs" onClick={onEdit}><Pencil size={14} /> تعديل</Button>
      <Button type="button" variant="ghost" className="px-2 py-2 text-xs text-danger" onClick={onDelete} disabled={protectedFromDelete} aria-label="حذف الحساب">
        <Trash2 size={15} />{protectedFromDelete ? "محمي بسجل" : "حذف"}
      </Button>
    </div>
  );
}
