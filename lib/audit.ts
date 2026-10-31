import { appConfig } from "@/lib/config";
import { formatDateTime } from "@/lib/format";
import type { AuditEntry, Database, Role } from "@/types/domain";

type AuditEvent = Pick<AuditEntry, "userId" | "action" | "entity" | "entityId"> &
  Partial<Pick<AuditEntry, "details" | "severity" | "actorRole">>;

export function pruneAudit(entries: AuditEntry[], now = Date.now()): AuditEntry[] {
  const cutoff = now - appConfig.auditRetentionDays * 24 * 60 * 60 * 1000;
  return entries
    .filter((entry) => {
      if (!entry || typeof entry.at !== "string" || typeof entry.action !== "string" || typeof entry.entityId !== "string" || typeof entry.userId !== "string") return false;
      const timestamp = Date.parse(entry.at);
      return Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now + 5 * 60 * 1000;
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, appConfig.auditMaxEntries);
}

export function appendAudit(db: Database, event: AuditEvent, role?: Role): void {
  const actor = db.users.find((user) => user.id === event.userId);
  const customer = db.customers.find((item) => item.id === event.userId);
  const entry: AuditEntry = {
    id: `audit-${crypto.randomUUID()}`,
    at: new Date().toISOString(),
    userId: event.userId,
    actorName: actor?.name ?? customer?.fullName ?? "حساب غير معروف",
    actorRole: event.actorRole ?? role ?? actor?.role ?? (customer ? "customer" : undefined),
    action: event.action,
    entity: event.entity,
    entityId: event.entityId,
    severity: event.severity ?? "info",
    ...(event.details ? { details: event.details.slice(0, 240) } : {}),
  };
  db.audit = pruneAudit([entry, ...db.audit]);
}

export function formatAuditDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "وقت غير معروف" : formatDateTime(date);
}
