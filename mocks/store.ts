import type { Database } from "@/types/domain";
import { appConfig } from "@/lib/config";
import { todayISO } from "@/lib/domain/dates";
import { pruneAudit } from "@/lib/audit";
import { generateSeed, SEED_VERSION } from "./data/seed";

/**
 * قاعدة بيانات العرض داخل المتصفح. تُحفظ في localStorage وتُعاد توليدها
 * عند تغيّر اليوم حتى تبقى التواريخ النسبية والتنبيهات «حية».
 */
let db: Database | null = null;

const canPersist = (): boolean => typeof window !== "undefined" && typeof window.localStorage !== "undefined";

function readStored(): Database | null {
  if (!canPersist()) return null;
  try {
    const raw = window.localStorage.getItem(appConfig.storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Database;
    if (!Array.isArray(parsed.audit)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function getDb(): Database {
  if (db && db.seededFor === todayISO()) return db;
  const stored = readStored();
  const isCurrent = stored?.version === SEED_VERSION && stored.seededFor === todayISO();
  const shouldMigrateBrand = stored?.version === SEED_VERSION - 1 && stored.seededFor === todayISO();
  if (stored && (isCurrent || shouldMigrateBrand)) {
    db = stored;
    if (shouldMigrateBrand) {
      db.users = db.users.map((user) => ({
        ...user,
        email: user.email.replace(/@milk\.sa$/i, "@tamalk.sa"),
      }));
      const admin = db.users.find((user) => user.id === "u-admin");
      if (admin) {
        admin.name = "أ عبدالعزيز";
        admin.email = "admin@tamalk.sa";
      }
      db.settings.company.email = db.settings.company.email.replace(/@milk\.sa$/i, "@tamalk.sa");
      db.version = SEED_VERSION;
    }
    db.audit = pruneAudit(db.audit);
  } else {
    db = generateSeed(todayISO());
    if (stored) db.audit = pruneAudit(stored.audit);
  }
  persist();
  return db;
}

export function persist(): boolean {
  if (!db || !canPersist()) return false;
  try {
    window.localStorage.setItem(appConfig.storageKey, JSON.stringify(db));
    return true;
  } catch {
    return false;
  }
}

export function resetDb(): Database {
  db = generateSeed(todayISO());
  persist();
  return db;
}
