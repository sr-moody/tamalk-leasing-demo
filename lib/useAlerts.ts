"use client";
import { useMemo } from "react";
import type { AppNotification } from "@/types/domain";
import { alertsForViewer, computeAlerts } from "@/lib/domain/alerts";
import { todayISO } from "@/lib/domain/dates";
import { useSession } from "@/lib/session";

export function useAlerts(): { alerts: AppNotification[]; unread: number; today: string } {
  const { db, role, customerId } = useSession();
  const today = todayISO();
  return useMemo(() => {
    if (!db || !role) return { alerts: [], unread: 0, today };
    const all = computeAlerts({ contracts: db.contracts, customers: db.customers, vehicles: db.vehicles, settings: db.settings.alerts, today });
    const alerts = alertsForViewer(all, role, customerId ?? undefined);
    const read = new Set(db.reads[role] ?? []);
    return { alerts, unread: alerts.filter((a) => !read.has(a.id)).length, today };
  }, [db, role, customerId, today]);
}
