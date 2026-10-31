"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Bell, CheckCheck, Info } from "lucide-react";
import type { Severity } from "@/types/domain";
import { useSession } from "@/lib/session";
import { useAlerts } from "@/lib/useAlerts";
import { formatRelativeDay } from "@/lib/format";
import { Button, Card, Empty, Fade } from "@/components/ui/basics";
import { cn } from "@/lib/utils";
import { appendAudit } from "@/lib/audit";

const SEV: { key: Severity; label: string; icon: typeof Bell; cls: string }[] = [
  { key: "critical", label: "عاجل", icon: AlertTriangle, cls: "bg-danger-soft text-danger" },
  { key: "warning", label: "تنبيه", icon: Bell, cls: "bg-warning-soft text-warning" },
  { key: "info", label: "معلومة", icon: Info, cls: "bg-neutral-soft text-muted" },
];

type Filter = "all" | "unread" | Severity;
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "unread", label: "غير مقروءة" },
  { key: "critical", label: "عاجل" },
  { key: "warning", label: "تنبيهات" },
  { key: "info", label: "معلومات" },
];

export default function NotificationsPage() {
  const { role, db, update } = useSession();
  const { alerts, unread, today } = useAlerts();
  const [filter, setFilter] = useState<Filter>("all");
  const readIds = useMemo(() => new Set(role ? db?.reads[role] ?? [] : []), [db?.reads, role]);
  const visible = alerts.filter((alert) => (
    filter === "all" || (filter === "unread" ? !readIds.has(alert.id) : alert.severity === filter)
  ));

  const markRead = (id: string) => {
    if (!role || readIds.has(id)) return;
    update((current) => {
      current.reads[role] = [...new Set([...(current.reads[role] ?? []), id])];
      appendAudit(current, {
        userId: role === "customer" ? "customer" : role === "admin" ? "u-admin" : role === "sales" ? "u-sales1" : role === "accountant" ? "u-acc1" : "u-proc",
        actorRole: role,
        action: "notification.read",
        entity: "notification",
        entityId: id,
        details: "تمييز تنبيه كمقروء",
      }, role);
    });
  };

  const markAllRead = () => {
    if (!role || unread === 0) return;
    update((current) => {
      current.reads[role] = [...new Set([...(current.reads[role] ?? []), ...alerts.map((alert) => alert.id)])];
      appendAudit(current, {
        userId: role === "customer" ? "customer" : role === "admin" ? "u-admin" : role === "sales" ? "u-sales1" : role === "accountant" ? "u-acc1" : "u-proc",
        actorRole: role,
        action: "notification.read_all",
        entity: "notification",
        entityId: "all",
        details: `تحديد ${unread} تنبيهاً كمقروء`,
      }, role);
    });
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold">صندوق التنبيهات</h1><p className="mt-1 text-sm text-muted">{alerts.length} تنبيه · {unread} غير مقروء</p></div>
        <Button type="button" variant="outline" onClick={markAllRead} disabled={unread === 0}><CheckCheck size={16} /> تحديد الكل كمقروء</Button>
      </Fade>
      <div className="flex gap-2 overflow-x-auto pb-1" aria-label="تصفية التنبيهات">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            type="button"
            aria-pressed={filter === item.key}
            onClick={() => setFilter(item.key)}
            className={cn("shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition", filter === item.key ? "border-ink bg-ink text-white dark:bg-white dark:text-ink" : "border-line bg-surface hover:bg-neutral-soft")}
          >
            {item.label}
            {item.key === "unread" && unread > 0 && <span className="num ms-2 rounded-full bg-brand px-1.5 py-0.5 text-[10px] text-white">{unread}</span>}
          </button>
        ))}
      </div>
      {alerts.length === 0 && <Empty text="لا توجد تنبيهات حالياً" />}
      {alerts.length > 0 && visible.length === 0 && <Empty text="لا توجد تنبيهات ضمن هذا التصنيف" />}
      {SEV.map(({ key, label, icon: Icon, cls }) => {
        const list = visible.filter((a) => a.severity === key);
        if (list.length === 0) return null;
        return (
          <section key={key} className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-bold"><span className={`rounded-full px-2.5 py-0.5 text-xs ${cls}`}>{label}</span><span className="num text-muted">{list.length}</span></h2>
            <Card className="grid gap-3 border-0 bg-transparent p-0 shadow-none sm:gap-2">
              {list.map((a) => (
                <Card key={a.id} className={cn("p-0 transition hover:border-brand hover:shadow-lift", !readIds.has(a.id) && "border-brand/30 bg-brand-soft/30")}>
                  <div className="flex items-start gap-3 p-4 sm:items-center sm:px-5">
                    <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl ${cls}`}><Icon size={18} /></span>
                    <Link href={a.link} onClick={() => markRead(a.id)} className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{a.title}</span>
                        {!readIds.has(a.id) && <span className="h-2 w-2 rounded-full bg-brand" aria-label="غير مقروء" />}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-muted">{a.body}</span>
                    </Link>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span className="num text-xs text-muted">{formatRelativeDay(a.createdAt.slice(0, 10), today)}</span>
                      {!readIds.has(a.id) && (
                        <button type="button" onClick={() => markRead(a.id)} className="text-[11px] font-semibold text-brand hover:underline">تمييز كمقروء</button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </Card>
          </section>
        );
      })}
    </div>
  );
}
