"use client";
import { Children, useId, type ChangeEvent, type ReactElement } from "react";
import { motion } from "framer-motion";
import { CarFront, Check, ChevronDown, ChevronUp, X } from "lucide-react";
import { Select as RadixSelect } from "radix-ui";
import Image from "next/image";
import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { ContractStatus, InstallmentStatus, VehicleStatus } from "@/types/domain";
import { formatAmount } from "@/lib/format";

export function Fade({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, delay }} className={className}>
      {children}
    </motion.div>
  );
}

export function Card({ children, className, dark }: { children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <div className={cn("rounded-2xl border p-5 shadow-soft", dark ? "border-shell-line bg-ink text-white" : "border-line bg-surface", className)}>
      {children}
    </div>
  );
}

type BtnVariant = "primary" | "dark" | "ghost" | "outline";
export function Button({
  children, className, variant = "primary", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant }) {
  const v: Record<BtnVariant, string> = {
    primary: "bg-brand text-white hover:bg-brand-hover",
    dark: "bg-ink text-white hover:bg-ink-2 dark:bg-white dark:text-ink",
    ghost: "bg-transparent text-fg hover:bg-neutral-soft",
    outline: "border border-line bg-surface text-fg hover:bg-neutral-soft",
  };
  return (
    <button
      className={cn("inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50", v[variant], className)}
      {...rest}
    >
      {children}
    </button>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "مسودة", cls: "bg-neutral-soft text-muted" },
  pending_approval: { label: "بانتظار الاعتماد", cls: "bg-warning-soft text-warning" },
  approved: { label: "معتمد", cls: "bg-success-soft text-success" },
  active: { label: "نشط", cls: "bg-success-soft text-success" },
  overdue: { label: "متأخر", cls: "bg-danger-soft text-danger" },
  paid_off: { label: "مسدد", cls: "bg-brand-soft text-brand" },
  owned: { label: "تم التمليك", cls: "bg-neutral-soft text-fg" },
  terminated: { label: "مفسوخ", cls: "bg-neutral-soft text-muted" },
  upcoming: { label: "قادم", cls: "bg-neutral-soft text-muted" },
  due: { label: "مستحق", cls: "bg-warning-soft text-warning" },
  partial: { label: "جزئي", cls: "bg-warning-soft text-warning" },
  paid: { label: "مدفوع", cls: "bg-success-soft text-success" },
  in_purchase: { label: "قيد الشراء", cls: "bg-neutral-soft text-muted" },
  preparing: { label: "قيد التجهيز", cls: "bg-warning-soft text-warning" },
  available: { label: "متاحة", cls: "bg-success-soft text-success" },
  reserved: { label: "محجوزة", cls: "bg-brand-soft text-brand" },
  contracted: { label: "متعاقد عليها", cls: "bg-neutral-soft text-fg" },
  returned: { label: "مستردة", cls: "bg-danger-soft text-danger" },
  sold: { label: "مباعة", cls: "bg-neutral-soft text-muted" },
};
export const statusLabel = (s: string): string => STATUS[s]?.label ?? s;

export function StatusBadge({ status, className }: { status: ContractStatus | InstallmentStatus | VehicleStatus; className?: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-neutral-soft" };
  return <span className={cn("inline-flex rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap", s.cls, className)}>{s.label}</span>;
}

export function PaymentRing({
  progress, remaining, size = 160, stroke = 12, dark, label = "المتبقي",
}: { progress: number; remaining: number; size?: number; stroke?: number; dark?: boolean; label?: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? "#2a2a2e" : "var(--neutral-soft)"} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#FF6B00" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p)} style={{ transition: "stroke-dashoffset 0.8s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className={cn("text-[10px]", dark ? "text-shell-muted" : "text-muted")}>{label}</span>
        <span className="num text-lg font-bold leading-tight">{formatAmount(remaining)}</span>
        <span className="num text-xs font-semibold text-brand">{Math.round(p * 100)}%</span>
      </div>
    </div>
  );
}

export function PlateBadge({ ar, en, className }: { ar: string; en: string; className?: string }) {
  return (
    <div className={cn("inline-flex overflow-hidden rounded-lg border-2 border-ink bg-white text-ink shadow-soft", className)} dir="ltr">
      <div className="flex w-7 flex-col items-center justify-center bg-[#1d4ed8] text-[8px] font-bold text-white">
        <span>KSA</span>
      </div>
      <div className="flex flex-col px-3 py-1 text-center">
        <span className="num text-sm font-bold tracking-widest">{en}</span>
        <span className="text-xs font-semibold tracking-wider">{ar}</span>
      </div>
    </div>
  );
}

export function VehiclePhoto({ src, alt, className, priority = false }: { src?: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <div className={cn("relative overflow-hidden bg-surface-2", className)}>
      {src ? (
        <Image src={src} alt={alt} fill sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 480px" loading={priority ? "eager" : "lazy"} className="object-cover" />
      ) : (
        <div className="grid h-full min-h-28 place-items-center text-sm text-muted">لا توجد صورة لهذه السيارة</div>
      )}
    </div>
  );
}

const VEHICLE_BRAND_LOGOS: Record<string, string> = {
  "تويوتا": "/brands/toyota.svg",
  "هيونداي": "/brands/hyundai.svg",
  "نيسان": "/brands/nissan.svg",
  "كيا": "/brands/kia.svg",
  "إم جي": "/brands/mg.svg",
};
const VEHICLE_BRAND_COLORS: Record<string, string> = {
  "تويوتا": "bg-[#b3261e]",
  "هيونداي": "bg-[#153e69]",
  "نيسان": "bg-[#202124]",
  "كيا": "bg-[#171717]",
  "إم جي": "bg-[#284b39]",
};

export function VehicleBrandIcon({ make, className }: { make: string; className?: string }) {
  const brand = make.trim();
  const logo = VEHICLE_BRAND_LOGOS[brand];
  return (
    <span role="img" aria-label={brand} className={cn("grid place-items-center rounded-xl p-2.5 shadow-sm", logo ? VEHICLE_BRAND_COLORS[brand] : "border border-line bg-brand-soft/60", className)}>
      {logo
        ? <Image src={logo} alt="" width={32} height={32} className="h-full w-full object-contain brightness-0 invert" />
        : <CarFront size={24} className="text-brand" aria-hidden="true" />}
    </span>
  );
}

export function Dialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 print:hidden" onClick={onClose}>
      <div className="w-full max-w-lg rounded-t-3xl bg-surface p-5 shadow-pop sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-neutral-soft" aria-label="إغلاق"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-muted">{label}</span>
      {children}
    </label>
  );
}

export const inputCls = "w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none transition-colors placeholder:text-muted/70 focus:border-brand focus:ring-2 focus:ring-brand/15 disabled:cursor-not-allowed disabled:opacity-50";

export function Select({
  children,
  className,
  containerClassName,
  placeholder,
  value,
  defaultValue,
  onChange,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { containerClassName?: string; placeholder?: string }) {
  const listId = useId();
  const options = Children.toArray(children);

  return (
    <RadixSelect.Root
      value={value == null ? undefined : String(value)}
      defaultValue={defaultValue == null ? undefined : String(defaultValue)}
      onValueChange={(nextValue) => {
        onChange?.({ target: { value: nextValue }, currentTarget: { value: nextValue } } as ChangeEvent<HTMLSelectElement>);
      }}
      name={props.name}
      required={props.required}
      disabled={props.disabled}
      dir="rtl"
    >
      <span className={cn("relative block w-full", containerClassName)}>
        <RadixSelect.Trigger
          id={props.id}
          aria-label={props["aria-label"]}
          aria-labelledby={props["aria-labelledby"]}
          aria-describedby={props["aria-describedby"]}
          aria-controls={listId}
          className={cn(inputCls, "flex items-center justify-between gap-3 text-start transition focus:border-brand focus:ring-2 focus:ring-brand/15 data-[placeholder]:text-muted disabled:cursor-not-allowed disabled:opacity-50", className)}
        >
          <RadixSelect.Value placeholder={placeholder} />
          <RadixSelect.Icon asChild><ChevronDown size={16} aria-hidden="true" className="shrink-0 text-muted" /></RadixSelect.Icon>
        </RadixSelect.Trigger>
      </span>
      <RadixSelect.Portal>
        <RadixSelect.Content
          id={listId}
          position="popper"
          sideOffset={6}
          dir="rtl"
          className="z-[70] max-h-[min(20rem,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-line bg-surface p-1.5 text-fg shadow-pop data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1"
        >
          <RadixSelect.ScrollUpButton className="flex h-6 items-center justify-center text-muted"><ChevronUp size={14} /></RadixSelect.ScrollUpButton>
          <RadixSelect.Viewport>
            {options.map((child, index) => {
              if (!child || typeof child !== "object" || !("props" in child)) return null;
              const option = child as ReactElement<{ value?: string; disabled?: boolean; children?: ReactNode }>;
              if (typeof option.props.value !== "string") return null;
              return (
                <RadixSelect.Item
                  key={option.props.value || index}
                  value={option.props.value}
                  disabled={option.props.disabled}
                  className="relative flex cursor-pointer select-none items-center rounded-lg py-2.5 pe-9 ps-3 text-sm outline-none data-[highlighted]:bg-brand-soft data-[highlighted]:text-brand data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
                >
                  <RadixSelect.ItemText>{option.props.children}</RadixSelect.ItemText>
                  <RadixSelect.ItemIndicator className="absolute end-3 inline-flex items-center"><Check size={15} /></RadixSelect.ItemIndicator>
                </RadixSelect.Item>
              );
            })}
          </RadixSelect.Viewport>
          <RadixSelect.ScrollDownButton className="flex h-6 items-center justify-center text-muted"><ChevronDown size={14} /></RadixSelect.ScrollDownButton>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  );
}

export function Stat({ label, value, sub, className, accent }: { label: string; value: string; sub?: string; className?: string; accent?: boolean }) {
  return (
    <Card className={className}>
      <p className="text-xs text-muted">{label}</p>
      <p className={cn("num mt-1 text-2xl font-bold", accent && "text-brand")}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </Card>
  );
}

export function Empty({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-line p-10 text-center text-sm text-muted">{text}</div>;
}
