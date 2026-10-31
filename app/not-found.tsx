import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { appConfig } from "@/lib/config";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-16 text-center text-fg">
      <div className="w-full max-w-md">
        <p className="text-sm font-semibold text-brand">{appConfig.brandName}</p>
        <p className="mt-8 text-sm font-semibold tracking-normal text-muted">404</p>
        <h1 className="mt-3 text-2xl font-bold">الصفحة غير موجودة</h1>
        <p className="mt-3 leading-7 text-muted">قد يكون الرابط غير صحيح أو أن الصفحة نُقلت.</p>
        <Link
          href="/dashboard"
          className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-5 py-2.5 font-semibold text-brand-fg transition-colors hover:bg-brand-hover"
        >
          <ArrowRight aria-hidden="true" size={18} />
          العودة إلى لوحة التحكم
        </Link>
      </div>
    </main>
  );
}