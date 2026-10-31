"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import { Bell, CreditCard, Home, LogOut, User } from "lucide-react";
import { appConfig } from "@/lib/config";
import { useSession } from "@/lib/session";

const NAV = [
  { href: "/portal#home", label: "الرئيسية", icon: Home },
  { href: "/portal#installments", label: "أقساطي", icon: CreditCard },
  { href: "/portal#payments", label: "مدفوعاتي", icon: Bell },
  { href: "/portal/account", label: "حسابي", icon: User },
];

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { role, ready, setRole } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (ready && role !== "customer") router.replace(role ? "/dashboard" : "/login");
  }, [ready, role, router]);
  if (!ready || role !== "customer") return null;
  return (
    <div className="min-h-screen bg-canvas">
      <header className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-sm font-bold text-white">ت</span><span className="font-bold">{appConfig.brandName}</span><span className="hidden border-s border-line ps-3 text-xs text-muted sm:inline">بوابة العميل</span></div>
          <button onClick={() => { setRole(null); router.push("/login"); }} className="flex items-center gap-2 rounded-xl p-2 text-sm text-muted transition hover:bg-neutral-soft hover:text-fg" aria-label="خروج"><LogOut size={18} /><span className="hidden sm:inline">تسجيل الخروج</span></button>
        </div>
      </header>
      <main className="px-4 pb-32 sm:px-6 lg:px-8 lg:pb-28">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto flex max-w-3xl border-t border-line bg-surface/95 pb-safe shadow-pop backdrop-blur lg:bottom-5 lg:rounded-2xl lg:border lg:shadow-lift">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium text-muted transition hover:text-brand sm:text-xs"><Icon size={20} />{label}</Link>
        ))}
      </nav>
    </div>
  );
}
