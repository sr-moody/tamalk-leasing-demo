# PLAN — ديمو منصة «تملك»

> المرجع: `SPEC.md`. القرارات غير المذكورة في المواصفات: `DECISIONS.md`.
> ✅ تم · ⏳ متبقٍ · 🟧 جزئي

## المرحلة 1 — الأساس 🟧
- ✅ Next.js 15.5 + React 19 + TypeScript strict + Tailwind v4 + ESLint
- ✅ تثبيت المكتبات: TanStack Query/Table، RHF + Zod، Recharts، date-fns، react-pdf، Framer Motion، lucide، next-themes، sonner، cmdk، radix-ui، vaul، Vitest، Playwright، Prettier
- ✅ Design Tokens برتقالي/أسود Light + Dark في `app/globals.css`
- ✅ خطوط IBM Plex Sans Arabic بصيغة TTF في `public/fonts` (لملفات PDF)، وحزمة fontsource مثبتة للويب
- ✅ `lib/i18n/ar.json` (النصوص المشتركة، الأدوار، الحالات، التنبيهات، رسائل التحقق) + دالة `t()` بمفاتيح مُنمّطة
- ✅ `lib/format.ts` (المبالغ، التاريخ الميلادي والهجري، الجوال، الهوية المقنّعة، واتساب)، `lib/config.ts`، `lib/utils.ts`
- ✅ `app/layout.tsx`: `lang="ar" dir="rtl"`، خط IBM Plex، next-themes، sonner، SessionProvider
- ✅ مكونات بسيطة بالـ Tailwind في `components/ui/basics.tsx` (بدل shadcn — نسخة Lite)
- ⏳ قاعدة ESLint تمنع النصوص العربية داخل المكونات + إعداد Prettier

## المرحلة 2 — المنطق والبيانات 🟧
- ✅ `types/domain.ts` (كما في SPEC §6 + أنواع مساعدة)، `types/api.ts`
- ✅ `lib/domain/`: money، vat، dates، schedule، allocation، balances، alerts، portfolio، contractNumber، template
- ✅ `lib/permissions.ts`: المصفوفة كاملة، `can()`، `canAccessRoute()`، القوائم، الزر العائم (FAB)
- ✅ `mocks/data/seed.ts`: مولد ثابت (seeded) بتواريخ نسبية لليوم، مع القائمة والقالب
- ✅ `mocks/store.ts`: حفظ في localStorage + إعادة توليد عند تغيّر اليوم
- ✅ اختبارات Vitest: **258 اختباراً ناجحاً** (الجدول، التوزيع، العكس، التنبيهات، الصلاحيات كاملة، ضمانات البيانات الوهمية على 5 تواريخ منها نهايات أشهر، التنسيق)
- ⏳ `mocks/handlers.ts` (Mock API)
- ⏳ `services/` (`http.ts`، `errors.ts`، الخدمات، hooks الخاصة بـ TanStack Query)
- ✅ `lib/session.tsx` (الدور في localStorage + context) — بدون middleware (نسخة Lite)

## المرحلة 3 — الهيكل ✅ (Lite)
Layout الموظفين (Sidebar + Bottom Nav + FAB)، Topbar، جرس الإشعارات، Command Palette، Role Switcher، صفحة الدخول.

## المرحلة 4 — مكونات الهوية ✅ (Lite)
PaymentRing، ContractTimeline، PlateBadge، StatCard، TodayStrip، StatusBadge، EmptyState، Skeletons.

## المرحلة 5 — الصفحات الداخلية 🟧 (Lite)
✅ الداشبورد، العقود + صفحة العقد (دفعة + إيصال طباعة + اعتماد)، معالج إنشاء العقد (4 خطوات)، العملاء + صفحة إنشاء ملف العميل وحساب البوابة، السيارات، الإشعارات. ⏳ المدفوعات، التحصيل، التقارير، الإعدادات، PDF.

## المرحلة 6 — بوابة العميل ✅ (Lite)

## المرحلة 7 — PWA والتلميع ⏳

## المرحلة 8 — التحقق النهائي 🟧
✅ `npm run build` ناجح + README. ⏳ Playwright + لقطات الشاشة.

## المشاكل الحالية
- ✅ أُصلح خطأ TypeScript في `portfolio.ts` وتحذيرا ESLint.
- البيانات الوهمية مخفّضة (نسخة Lite): 10 عملاء، 12 سيارة، 10 عقود. اختبارات ضمانات البيانات القديمة قد تحتاج تحديثاً.
- `services/` وMock API لم تُبنَ؛ الصفحات تقرأ من `mocks/store` مباشرة.
