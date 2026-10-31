"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { Bell, Car, ChevronsRight, FileText, LayoutDashboard, LogOut, Moon, Sun, UserRound, Users, UserRoundCog, ScrollText } from "lucide-react";
import { appConfig } from "@/lib/config";
import type { Role, StaffRole } from "@/types/domain";
import { mobileNavForRole, navForRole, type NavIcon } from "@/lib/permissions";
import { ROLE_LABEL, useSession } from "@/lib/session";
import { useAlerts } from "@/lib/useAlerts";
import { Select } from "@/components/ui/basics";
import { cn } from "@/lib/utils";
import { can } from "@/lib/permissions";

const NAV_LABEL: Partial<Record<NavIcon, string>> = {
  dashboard: "الرئيسية", contracts: "العقود", customers: "العملاء", vehicles: "السيارات", notifications: "التنبيهات", accounts: "الحسابات", audit: "سجل التدقيق",
};
const NAV_ICON: Partial<Record<NavIcon, typeof Car>> = {
  dashboard: LayoutDashboard, contracts: FileText, customers: Users, vehicles: Car, notifications: Bell, accounts: UserRoundCog, audit: ScrollText,
};
const STAFF: Role[] = ["admin", "sales", "accountant", "procurement", "customer"];

export function StaffShell({ children }: { children: ReactNode }) {
  const { role, ready, setRole, db } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const { unread } = useAlerts();
  const { theme, setTheme } = useTheme();
  const [collapsed, setCollapsed] = useState(false);
  const latestAuditId = useRef<string | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!role) router.replace("/login");
    else if (role === "customer") router.replace("/portal");
  }, [ready, role, router]);

  useEffect(() => {
    if (!ready || !db?.audit.length) return;
    const newestId = db.audit[0].id;
    if (latestAuditId.current === null) {
      latestAuditId.current = newestId;
      return;
    }
    if (latestAuditId.current === newestId) return;
    const previousIndex = db.audit.findIndex((entry) => entry.id === latestAuditId.current);
    const freshEntries = previousIndex < 0 ? db.audit.slice(0, 1) : db.audit.slice(0, previousIndex);
    latestAuditId.current = newestId;
    if (!can(role, "audit.view")) return;
    const securityEvent = freshEntries.find((entry) => entry.severity === "warning" || entry.severity === "critical");
    if (!securityEvent) return;
    const message = (securityEvent.details ?? securityEvent.action).slice(0, 140);
    if (securityEvent.severity === "critical") toast.error(`حدث حرج في سجل التدقيق: ${message}`);
    else toast.warning(`تنبيه في سجل التدقيق: ${message}`);
  }, [db, ready, role]);

  if (!ready || !role || role === "customer") return null;
  const items = navForRole(role).filter((n) => NAV_LABEL[n.key]);
  const mobile = mobileNavForRole(role as StaffRole).filter((n) => NAV_LABEL[n.key]);
  const mobileItems = [...mobile, ...items.filter((n) => !mobile.includes(n))].slice(0, 5);
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  return (
    <div className="min-h-screen">
      <aside className={cn("fixed inset-y-0 right-0 z-40 hidden h-dvh flex-col overflow-y-auto overscroll-contain border-l border-shell-line bg-shell text-shell-fg [isolation:isolate] transition-[width] duration-200 ease-out lg:flex print:hidden", collapsed ? "w-20" : "w-64")}>
        <div className="flex items-center gap-2 px-5 py-6">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand font-bold text-white">ت</span>
          {!collapsed && <span className="text-lg font-bold">{appConfig.brandName}</span>}
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {items.map((n) => {
            const Icon = NAV_ICON[n.key] ?? Car;
            return (
              <Link key={n.key} href={n.href} className={cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition", active(n.href) ? "bg-brand text-white" : "text-shell-muted hover:bg-shell-line hover:text-white")}>
                <Icon size={20} className="shrink-0" />
                {!collapsed && <span className="flex-1">{NAV_LABEL[n.key]}</span>}
                {!collapsed && n.key === "notifications" && unread > 0 && <span className="num rounded-full bg-white/20 px-2 text-xs">{unread}</span>}
              </Link>
            );
          })}
        </nav>
        <button onClick={() => setCollapsed((c) => !c)} className="m-3 flex items-center justify-center gap-2 rounded-xl p-2 text-shell-muted hover:bg-shell-line hover:text-white">
          <ChevronsRight size={18} className={cn("transition", collapsed ? "" : "rotate-180")} />
          {!collapsed && <span className="text-xs">طي القائمة</span>}
        </button>
      </aside>

      <div className={cn("flex min-h-screen min-w-0 flex-col transition-[margin-inline-start] duration-200 ease-out", collapsed ? "lg:ms-20" : "lg:ms-64")}>
        <header className="sticky top-0 z-30 flex min-h-16 items-center justify-between gap-2 border-b border-line bg-surface px-3 py-2 sm:gap-3 sm:px-6 sm:py-0 print:hidden">
          <div className="flex items-center gap-2 lg:hidden">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">ت</span>
            <span className="font-bold">{appConfig.brandName}</span>
          </div>
          <div className="hidden text-sm text-muted lg:block">مرحباً، {ROLE_LABEL[role]}</div>
          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <label className="hidden h-10 min-w-0 items-center gap-1 rounded-xl border border-brand/25 bg-brand-soft/50 px-1.5 text-xs shadow-sm transition hover:border-brand/50 sm:gap-2 sm:px-2.5 lg:flex">
              <Select
                containerClassName="w-[8.5rem] min-w-0 shrink-0"
                className="h-8 w-full border-0 bg-transparent px-1 py-1 text-sm font-bold text-brand focus:border-transparent focus:ring-0 pe-7"
                aria-label="تغيير وضع العرض"
                value={role}
                onChange={(e) => { const r = e.target.value as Role; setRole(r); router.push(r === "customer" ? "/portal" : "/dashboard"); }}
              >
                {STAFF.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </Select>
            </label>
            <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface transition-colors hover:bg-neutral-soft sm:h-10 sm:w-10" aria-label="الوضع الليلي">
              <Sun size={18} className="hidden dark:block" /><Moon size={18} className="dark:hidden" />
            </button>
            <Link href="/notifications" className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface transition-colors hover:bg-neutral-soft sm:h-10 sm:w-10" aria-label="التنبيهات">
              <Bell size={18} />
              {unread > 0 && <span className="num absolute -top-1.5 -start-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread}</span>}
            </Link>
            <Link href="/account" className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface transition-colors hover:bg-neutral-soft sm:h-10 sm:w-10" aria-label="حسابي"><UserRound size={18} /></Link>
            <button onClick={() => { setRole(null); router.push("/login"); }} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-line bg-surface transition-colors hover:bg-neutral-soft sm:h-10 sm:w-10" aria-label="خروج"><LogOut size={18} /></button>
          </div>
        </header>
        <main className="flex-1 px-4 py-5 pb-28 sm:px-6 lg:px-8 lg:pb-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface pb-safe lg:hidden print:hidden">
        {mobileItems.map((n) => {
          const Icon = NAV_ICON[n.key] ?? Car;
          return (
            <Link key={n.key} href={n.href} className={cn("flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium", active(n.href) ? "text-brand" : "text-muted")}>
              <Icon size={20} />
              {NAV_LABEL[n.key]}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
