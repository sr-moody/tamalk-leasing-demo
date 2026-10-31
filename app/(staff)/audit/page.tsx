"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Download, Search, ShieldCheck, ScrollText } from "lucide-react";
import type { AuditEntry, Severity } from "@/types/domain";
import { can } from "@/lib/permissions";
import { formatAuditDateTime } from "@/lib/audit";
import { ROLE_LABEL, useSession } from "@/lib/session";
import { Button, Card, Empty, Fade, Select, inputCls } from "@/components/ui/basics";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { auditActionLabel, AUDIT_ENTITY_LABEL, AUDIT_SEVERITY_LABEL, AUDIT_SEVERITY_STYLE } from "@/lib/audit-labels";

type SeverityFilter = "all" | Severity;
type EntityFilter = "all" | AuditEntry["entity"];
const SEVERITIES: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "كل المستويات" },
  { value: "critical", label: "حرج" },
  { value: "warning", label: "تحذير" },
  { value: "info", label: "معلومات" },
];
const ENTITIES: { value: EntityFilter; label: string }[] = [
  { value: "all", label: "كل السجلات" },
  { value: "contract", label: "العقود" },
  { value: "payment", label: "الدفعات" },
  { value: "vehicle", label: "السيارات" },
  { value: "customer", label: "العملاء" },
  { value: "user", label: "الحسابات" },
  { value: "settings", label: "الإعدادات" },
  { value: "notification", label: "التنبيهات" },
];
const PAGE_SIZE = 50;

export default function AuditPage() {
  const router = useRouter();
  const { db, role } = useSession();
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<SeverityFilter>("all");
  const [entity, setEntity] = useState<EntityFilter>("all");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (db && role && !can(role, "audit.view")) router.replace("/dashboard");
  }, [db, role, router]);

  const entries = useMemo(() => {
    if (!db) return [];
    const needle = query.trim().toLocaleLowerCase();
    return db.audit.filter((entry) => {
      if (severity !== "all" && (entry.severity ?? "info") !== severity) return false;
      if (entity !== "all" && entry.entity !== entity) return false;
      if (!needle) return true;
      return [entry.action, entry.details, entry.actorName, entry.userId, entry.entityId]
        .some((value) => value?.toLocaleLowerCase().includes(needle));
    });
  }, [db, entity, query, severity]);

  if (!db || !can(role, "audit.view")) return null;

  const warningCount = db.audit.filter((entry) => entry.severity === "warning" || entry.severity === "critical").length;
  const criticalCount = db.audit.filter((entry) => entry.severity === "critical").length;
  const pageEntries = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const maxPage = Math.max(0, Math.ceil(entries.length / PAGE_SIZE) - 1);
  const exportFilteredEvents = () => {
    const cell = (value: string) => {
      const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
      return `"${safe.replace(/"/g, '""')}"`;
    };
    const rows = [
      ["الوقت المحلي", "وقت UTC", "المنفذ", "الدور", "المستوى", "الإجراء", "نوع العنصر", "معرّف العنصر", "التفاصيل"],
      ...entries.map((entry) => [
        formatAuditDateTime(entry.at),
        entry.at,
        entry.actorName ?? entry.userId,
        entry.actorRole ? ROLE_LABEL[entry.actorRole] : "",
        AUDIT_SEVERITY_LABEL[entry.severity ?? "info"],
        auditActionLabel(entry.action),
        AUDIT_ENTITY_LABEL[entry.entity],
        entry.entityId,
        entry.details ?? "",
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(cell).join(",")).join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <Fade className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted"><ShieldCheck size={16} className="text-brand" /> مراقبة العمليات</div>
          <h1 className="mt-1 text-2xl font-bold">سجل التدقيق</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">تتبع تغييرات العقود والحسابات والعملاء والسيارات والدفعات. الوقت معروض بالتوقيت المحلي بصيغة 12 ساعة حتى الدقيقة.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs text-muted">احتفاظ 180 يوماً · حد أقصى 10,000 حدث</span>
          <Button type="button" variant="outline" onClick={exportFilteredEvents} disabled={entries.length === 0}><Download size={15} /> تصدير النتائج</Button>
        </div>
      </Fade>

      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryCard icon={<ScrollText size={18} />} label="الأحداث المحتفظ بها" value={String(db.audit.length)} />
        <SummaryCard icon={<AlertTriangle size={18} />} label="تحذيرات أمنية وإدارية" value={String(warningCount)} warning={warningCount > 0} />
        <SummaryCard icon={<ShieldCheck size={18} />} label="أحداث حرجة" value={String(criticalCount)} warning={criticalCount > 0} />
      </div>

      <Card className="grid gap-3 p-3 sm:grid-cols-[minmax(14rem,1fr)_11rem_11rem] sm:p-4">
        <label className="relative block">
          <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className={cn(inputCls, "ps-9")} value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="ابحث باسم المستخدم أو الإجراء أو المعرّف" aria-label="البحث في سجل التدقيق" />
        </label>
        <Select aria-label="تصفية حسب مستوى الخطورة" value={severity} onChange={(event) => { setSeverity(event.target.value as SeverityFilter); setPage(0); }}>
          {SEVERITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        <Select aria-label="تصفية حسب نوع السجل" value={entity} onChange={(event) => { setEntity(event.target.value as EntityFilter); setPage(0); }}>
          {ENTITIES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
      </Card>

      <div className="flex items-center justify-between gap-3 text-xs text-muted">
        <p>عرض {pageEntries.length ? page * PAGE_SIZE + 1 : 0}–{Math.min((page + 1) * PAGE_SIZE, entries.length)} من {entries.length} حدث مطابق</p>
        <span>الأحدث أولاً</span>
      </div>

      {pageEntries.length === 0 ? <Empty text="لا توجد أحداث مطابقة لعوامل البحث والتصفية." /> : (
        <div className="space-y-2">
          {pageEntries.map((entry) => {
            const level = entry.severity ?? "info";
            return (
              <Link key={entry.id} href={`/audit/${encodeURIComponent(entry.id)}`} className="block rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <Card className="p-4 transition hover:border-brand hover:shadow-lift sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", AUDIT_SEVERITY_STYLE[level])}>{AUDIT_SEVERITY_LABEL[level]}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-bold">{auditActionLabel(entry.action)}</p>
                      <span className="rounded-md bg-neutral-soft px-2 py-0.5 text-[11px] text-muted">{AUDIT_ENTITY_LABEL[entry.entity]}</span>
                    </div>
                    <p className="mt-1 break-words text-sm text-muted">{entry.details || `معرّف السجل: ${entry.entityId}`}</p>
                    <p className="mt-2 text-xs text-muted">
                      المنفذ: <span className="font-semibold text-fg">{entry.actorName ?? db.users.find((user) => user.id === entry.userId)?.name ?? db.customers.find((customer) => customer.id === entry.userId)?.fullName ?? entry.userId}</span>
                      {entry.actorRole && <span> · {ROLE_LABEL[entry.actorRole]}</span>}
                      <span> · معرّف العنصر: <span className="num" dir="ltr">{entry.entityId}</span></span>
                    </p>
                  </div>
                  <time className="num w-full shrink-0 text-start text-xs text-muted sm:w-auto sm:text-end" dateTime={entry.at} title={new Date(entry.at).toLocaleString()}>
                    {formatAuditDateTime(entry.at)}
                  </time>
                </div>
              </Card>
              </Link>
            );
          })}
        </div>
      )}

      {entries.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-3">
          <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>السابق</Button>
          <span className="num text-sm text-muted">{page + 1} / {maxPage + 1}</span>
          <Button type="button" variant="outline" disabled={page >= maxPage} onClick={() => setPage((current) => Math.min(maxPage, current + 1))}>التالي</Button>
        </div>
      )}

      <p className="rounded-xl border border-warning/30 bg-warning-soft/50 p-4 text-xs leading-6 text-muted">
        تنبيه: هذه نسخة عرض تحفظ السجل على هذا المتصفح فقط، ولا توفر حالياً سجلاً مركزياً غير قابل للتعديل أو توثيقاً موثوقاً لهوية المنفذ. يتطلب الاستخدام الأمني الفعلي خادماً وقاعدة بيانات وصلاحيات مصادقة وتخزيناً مركزياً للسجل.
      </p>
    </div>
  );
}

function SummaryCard({ icon, label, value, warning = false }: { icon: React.ReactNode; label: string; value: string; warning?: boolean }) {
  return (
    <Card className="flex items-center gap-3">
      <span className={cn("grid h-10 w-10 place-items-center rounded-xl", warning ? "bg-warning-soft text-warning" : "bg-brand-soft text-brand")}>{icon}</span>
      <div><p className="text-xs text-muted">{label}</p><p className={cn("num mt-1 text-xl font-bold", warning && "text-warning")}>{value}</p></div>
    </Card>
  );
}
