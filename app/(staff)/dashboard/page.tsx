"use client";
import Link from "next/link";
import { AlertTriangle, CalendarClock, Car, Clock, FileText, Wallet } from "lucide-react";
import { getAging, getDueItems, getFleetCounts, getPortfolioSummary } from "@/lib/domain/portfolio";
import { todayISO } from "@/lib/domain/dates";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { formatAmount, formatMoney } from "@/lib/format";
import { Card, Fade, statusLabel } from "@/components/ui/basics";
import type { LucideIcon } from "lucide-react";

export default function DashboardPage() {
  const { db, role } = useSession();
  if (!db || !role) return null;
  const today = todayISO();
  const s = getPortfolioSummary(db.contracts, today);
  const aging = getAging(db.contracts, today);
  const dueToday = getDueItems(db.contracts, today, 0, 0).length;
  const dueSoon = getDueItems(db.contracts, today, 0, 3).length;
  const fleet = getFleetCounts(db.vehicles);
  const money = can(role, "payments.view");
  const fleetVisible = can(role, "vehicles.view");

  const strip = [
    { icon: Clock, label: "مستحق اليوم", value: dueToday, href: "/contracts?f=active" },
    { icon: CalendarClock, label: "مستحق خلال 3 أيام", value: dueSoon, href: "/contracts?f=active" },
    { icon: AlertTriangle, label: "عقود تنتهي خلال 3 أيام", value: s.endingSoonCount, href: "/contracts?f=ending" },
  ];
  const bucketLabel = { b1_7: "1–7 أيام", b8_30: "8–30 يوماً", b30_plus: "+30 يوماً" } as const;
  const metrics = [
    ...(money ? [{ icon: Wallet, label: "المحصّل هذا الشهر", value: formatMoney(s.collectedThisMonth), sub: `نسبة التحصيل ${Math.round(s.collectionRate * 100)}%`, href: "/contracts?f=active", accent: true }] : []),
    { icon: FileText, label: "عقود نشطة", value: String(s.activeCount), sub: `${s.pendingApprovalCount} بانتظار الاعتماد`, href: "/contracts?f=active", accent: false },
    { icon: AlertTriangle, label: "عقود متأخرة", value: String(s.overdueCount), sub: `${s.ownedCount} مسددة`, href: "/contracts?f=active", accent: false },
    ...(fleetVisible ? [{ icon: Car, label: "سيارات متاحة", value: String(fleet.available), sub: `من إجمالي ${db.vehicles.length} سيارة`, href: "/vehicles", accent: true }] : []),
  ];
  const largestAgingAmount = Math.max(1, ...aging.map((item) => item.amount));

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Fade>
        <h1 className="text-2xl font-bold">لوحة اليوم</h1>
        <p className="text-sm text-muted">{new Date().toLocaleDateString("ar-SA", { weekday: "long", day: "numeric", month: "long" })}</p>
      </Fade>
      <Fade delay={0.05} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {strip.map(({ icon: Icon, label, value, href }) => (
          <Link key={label} href={href} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-brand hover:shadow-lift">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-soft text-brand"><Icon size={20} /></span>
            <span className="flex-1 text-sm font-medium">{label}</span>
            <span className="num text-2xl font-bold text-brand">{value}</span>
          </Link>
        ))}
      </Fade>
      <Fade delay={0.1} className="grid grid-cols-2 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {money && (
          <Card dark className="col-span-2 flex min-h-40 flex-col justify-between">
            <p className="text-sm text-shell-muted">إجمالي المتبقي للتحصيل</p>
            <p className="num text-3xl font-bold sm:text-4xl">{formatAmount(s.totalRemaining)} <span className="text-base font-medium text-shell-muted">ر.س</span></p>
            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <span><span className="text-shell-muted">متأخر: </span><span className="num font-bold text-brand">{formatMoney(s.overdueTotal)}</span></span>
              <span><span className="text-shell-muted">مستحق الشهر: </span><span className="num font-bold">{formatMoney(s.dueThisMonth)}</span></span>
            </div>
          </Card>
        )}
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} warning={metric.label === "عقود متأخرة" && s.overdueCount > 0} />
        ))}
        {money && (
          <Card className="col-span-2">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">أعمار المتأخرات</p>
              <span className="text-[11px] text-muted">{s.overdueCount} عقد متأخر</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {aging.map((a) => (
                <div key={a.bucket} className="min-w-0 rounded-xl bg-neutral-soft p-3">
                  <p className="text-[11px] text-muted">{bucketLabel[a.bucket]}</p>
                  <p className="num mt-1 text-lg font-bold">{a.count}</p>
                  <div className="my-2 h-1.5 overflow-hidden rounded-full bg-surface">
                    <span className="block h-full rounded-full bg-danger" style={{ width: `${Math.max(a.count > 0 ? 8 : 0, (a.amount / largestAgingAmount) * 100)}%` }} />
                  </div>
                  <p className="num truncate text-xs text-danger">{formatAmount(a.amount)}</p>
                </div>
              ))}
            </div>
          </Card>
        )}
        {fleetVisible && (
          <Card className="col-span-2 xl:col-span-4">
            <div className="mb-3 flex items-center gap-2 text-xs text-muted"><Car size={14} /> حالة الأسطول</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(fleet).filter(([, n]) => n > 0).map(([k, n]) => (
                <Link key={k} href="/vehicles" className="rounded-full border border-line px-3 py-1 text-xs"><span className="num font-bold">{n}</span> {statusLabel(k)}</Link>
              ))}
            </div>
          </Card>
        )}
      </Fade>
    </div>
  );
}

function MetricCard({
  icon: Icon, label, value, sub, href, accent, warning,
}: { icon: LucideIcon; label: string; value: string; sub: string; href: string; accent: boolean; warning: boolean }) {
  return (
    <Link href={href} className={`rounded-2xl border bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift ${warning ? "border-danger/40" : "border-line"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-muted">{label}</p>
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${warning ? "bg-danger-soft text-danger" : accent ? "bg-brand-soft text-brand" : "bg-neutral-soft text-muted"}`}><Icon size={17} /></span>
      </div>
      <p className={`num mt-2 text-xl font-bold sm:text-2xl ${warning ? "text-danger" : accent ? "text-brand" : ""}`}>{value}</p>
      <p className="mt-1 text-xs text-muted">{sub}</p>
    </Link>
  );
}
