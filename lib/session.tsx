"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Database, Role } from "@/types/domain";
import { appConfig } from "@/lib/config";
import { getDb, persist } from "@/mocks/store";
import { DEMO_CUSTOMER_PHONE } from "@/mocks/data/seed";
import { toast } from "sonner";

interface Session {
  role: Role | null;
  ready: boolean;
  db: Database | null;
  customerId: string | null;
  setRole: (r: Role | null) => void;
  setCustomerId: (id: string) => void;
  update: (fn: (db: Database) => void) => void;
}

const Ctx = createContext<Session | null>(null);
const CUSTOMER_ACCOUNT_KEY = `${appConfig.sessionKey}-customer`;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role | null>(null);
  const [db, setDb] = useState<Database | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const storageWarningShown = useRef(false);

  useEffect(() => {
    try {
      const r = window.localStorage.getItem(appConfig.sessionKey) as Role | null;
      setRoleState(r);
      setSelectedCustomerId(window.localStorage.getItem(CUSTOMER_ACCOUNT_KEY));
    } catch {}
    const currentDb = getDb();
    setDb(currentDb);
    setSelectedCustomerId((current) => current && currentDb.customers.some((c) => c.id === current)
      ? current
      : currentDb.customers.find((c) => c.phone === DEMO_CUSTOMER_PHONE)?.id ?? null);
    setReady(true);
  }, []);

  const setRole = useCallback((r: Role | null) => {
    setRoleState(r);
    try {
      if (r) window.localStorage.setItem(appConfig.sessionKey, r);
      else window.localStorage.removeItem(appConfig.sessionKey);
    } catch {}
  }, []);

  const setCustomerId = useCallback((id: string) => {
    setSelectedCustomerId(id);
    try {
      window.localStorage.setItem(CUSTOMER_ACCOUNT_KEY, id);
    } catch {}
  }, []);

  const update = useCallback((fn: (d: Database) => void) => {
    const d = getDb();
    fn(d);
    if (!persist()) {
      if (!storageWarningShown.current) {
        toast.error("تعذر حفظ التغييرات وسجل التدقيق في هذا المتصفح؛ تحقق من مساحة التخزين أو إعدادات الخصوصية.");
        storageWarningShown.current = true;
      }
    } else {
      storageWarningShown.current = false;
    }
    setDb({ ...d });
  }, []);

  const customerId = db?.customers.some((c) => c.id === selectedCustomerId)
    ? selectedCustomerId
    : db?.customers.find((c) => c.phone === DEMO_CUSTOMER_PHONE)?.id ?? null;
  return <Ctx.Provider value={{ role, ready, db, customerId, setRole, setCustomerId, update }}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const s = useContext(Ctx);
  if (!s) throw new Error("SessionProvider missing");
  return s;
}

export const ROLE_LABEL: Record<Role, string> = {
  admin: "المدير",
  sales: "المبيعات",
  accountant: "المحاسب",
  procurement: "المشتريات",
  customer: "العميل",
};
