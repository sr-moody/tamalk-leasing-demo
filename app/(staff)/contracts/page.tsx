"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Plus } from "lucide-react";
import { getContractBalances } from "@/lib/domain/balances";
import { todayISO } from "@/lib/domain/dates";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { formatAmount, formatDateShort } from "@/lib/format";
import { Button, Card, Empty, Fade, StatusBadge } from "@/components/ui/basics";
import { cn } from "@/lib/utils";

type Filter = "all" | "active" | "overdue" | "ending" | "pending";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" }, { key: "active", label: "نشطة" }, { key: "overdue", label: "متأخرة" },
  { key: "ending", label: "تنتهي قريباً" }, { key: "pending", label: "بانتظار الاعتماد" },
];

function ContractsInner() {
  const { db, role } = useSession();
  const params = useSearchParams();
  const [filter, setFilter] = useState<Filter>((params.get("f") as Filter) || "all");
  if (!db || !role) return null;
  const today = todayISO();
  const rows = db.contracts
    .map((c) => ({ c, b: getContractBalances(c, today), customer: db.customers.find((x) => x.id === c.customerId), vehicle: db.vehicles.find((v) => v.id === c.vehicleId) }))
    .filter(({ c, b }) => {
      if (filter === "active") return c.status === "active";
      if (filter === "overdue") return c.status === "overdue";
      if (filter === "ending") return c.status !== "paid_off" && b.daysToEnd >= 0 && b.daysToEnd <= 3;
      if (filter === "pending") return c.status === "pending_approval";
      return true;
    });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">العقود</h1><p className="text-sm text-muted">{rows.length} عقد</p></div>
        {can(role, "contracts.create") && <Link href="/contracts/new"><Button><Plus size={16} /> عقد جديد</Button></Link>}
      </Fade>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)} className={cn("shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition", filter === f.key ? "border-ink bg-ink text-white dark:bg-white dark:text-ink" : "border-line bg-surface hover:bg-neutral-soft")}>{f.label}</button>
        ))}
      </div>
      {rows.length === 0 ? <Empty text="لا توجد عقود مطابقة" /> : (
        <>
          <Card className="hidden overflow-hidden p-0 md:block">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-muted"><tr>
                <th className="px-4 py-3 text-start font-medium">رقم العقد</th><th className="px-4 py-3 text-start font-medium">العميل</th><th className="px-4 py-3 text-start font-medium">السيارة</th>
                <th className="px-4 py-3 text-start font-medium">الحالة</th><th className="px-4 py-3 text-start font-medium">القسط القادم</th><th className="px-4 py-3 text-start font-medium">المتبقي</th>
              </tr></thead>
              <tbody>
                {rows.map(({ c, b, customer, vehicle }) => (
                  <tr key={c.id} className="border-t border-line hover:bg-surface-2">
                    <td className="px-4 py-3"><Link href={`/contracts/${c.id}`} className="num font-semibold text-brand">{c.number}</Link></td>
                    <td className="px-4 py-3">{customer?.fullName}</td>
                    <td className="px-4 py-3 text-muted">{vehicle?.make} {vehicle?.model} {vehicle?.year}</td>
                    <td className="px-4 py-3"><StatusBadge status={c.status} /></td>
                    <td className="num px-4 py-3">{b.nextInstallment ? `${formatDateShort(b.nextInstallment.dueDate)} · ${formatAmount(b.nextInstallment.amount)}` : "—"}</td>
                    <td className="num px-4 py-3 font-semibold">{formatAmount(b.remaining)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <div className="space-y-3 md:hidden">
            {rows.map(({ c, b, customer, vehicle }) => (
              <Link key={c.id} href={`/contracts/${c.id}`} className="block rounded-2xl border border-line bg-surface p-4 shadow-soft">
                <div className="flex items-center justify-between"><span className="num font-bold text-brand">{c.number}</span><StatusBadge status={c.status} /></div>
                <p className="mt-2 font-semibold">{customer?.fullName}</p>
                <p className="text-xs text-muted">{vehicle?.make} {vehicle?.model} {vehicle?.year}</p>
                <div className="mt-3 flex justify-between text-xs"><span className="text-muted">المتبقي</span><span className="num font-bold">{formatAmount(b.remaining)} ر.س</span></div>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function ContractsPage() {
  return <Suspense><ContractsInner /></Suspense>;
}
