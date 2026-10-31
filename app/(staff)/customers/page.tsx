"use client";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getCustomerSummary } from "@/lib/domain/balances";
import { todayISO } from "@/lib/domain/dates";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { formatAmount, formatPhone } from "@/lib/format";
import { Button, Fade } from "@/components/ui/basics";

export default function CustomersPage() {
  const { db, role } = useSession();
  if (!db) return null;
  const today = todayISO();
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade className="flex items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">العملاء</h1><p className="text-sm text-muted">{db.customers.length} عميل</p></div>
        {can(role, "customers.create") && <Link href="/customers/new"><Button><Plus size={16} /> عميل جديد</Button></Link>}
      </Fade>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {db.customers.map((c, i) => {
          const contracts = db.contracts.filter((x) => x.customerId === c.id);
          const s = getCustomerSummary(contracts, today);
          return (
            <Fade key={c.id} delay={i * 0.03}>
              <Link href={`/customers/${c.id}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-soft transition hover:border-brand hover:shadow-lift">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink text-lg font-bold text-white">{c.fullName.charAt(0)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{c.fullName}</span>
                  <span className="num block text-xs text-muted" dir="ltr">{formatPhone(c.phone)}</span>
                </span>
                <span className="text-end text-xs text-muted">{contracts.length} عقد<br /><span className="num font-bold text-fg">{formatAmount(s.remaining)}</span></span>
              </Link>
            </Fade>
          );
        })}
      </div>
    </div>
  );
}
