"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import type { VehicleStatus } from "@/types/domain";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { formatAmount, formatKm } from "@/lib/format";
import { Button, Card, Empty, Fade, PlateBadge, Stat, StatusBadge, VehicleBrandIcon, VehiclePhoto, inputCls } from "@/components/ui/basics";
import { cn } from "@/lib/utils";

type VehicleFilter = "all" | VehicleStatus;
const STATUS_FILTERS: { key: VehicleStatus; label: string }[] = [
  { key: "available", label: "متاحة" },
  { key: "in_purchase", label: "قيد الشراء" },
  { key: "preparing", label: "قيد التجهيز" },
  { key: "reserved", label: "محجوزة" },
  { key: "contracted", label: "متعاقد عليها" },
  { key: "returned", label: "مستردة" },
  { key: "sold", label: "مباعة" },
];

export default function VehiclesPage() {
  const { db, role } = useSession();
  const [filter, setFilter] = useState<VehicleFilter>("all");
  const [query, setQuery] = useState("");
  const canManage = can(role, "vehicles.manage");
  const vehicles = useMemo(() => {
    if (!db) return [];
    return can(role, "vehicles.viewAll")
      ? db.vehicles
      : db.vehicles.filter((vehicle) => vehicle.status === "available");
  }, [db, role]);
  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return vehicles.filter((vehicle) => {
      if (filter !== "all" && vehicle.status !== filter) return false;
      if (!normalizedQuery) return true;
      return [vehicle.make, vehicle.model, vehicle.year, vehicle.plateAr, vehicle.plateEn, vehicle.vin]
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [vehicles, filter, query]);
  if (!db || !role) return null;

  const counts = vehicles.reduce<Record<VehicleStatus, number>>((result, vehicle) => {
    result[vehicle.status] += 1;
    return result;
  }, { in_purchase: 0, preparing: 0, available: 0, reserved: 0, contracted: 0, returned: 0, sold: 0 });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الأسطول والسيارات</h1>
          <p className="mt-1 text-sm text-muted">{vehicles.length} سيارة ضمن صلاحيات العرض</p>
        </div>
        {canManage && <Link href="/vehicles/new"><Button><Plus size={16} /> إضافة سيارة</Button></Link>}
      </Fade>

      {canManage && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="إجمالي السيارات" value={String(vehicles.length)} />
          <Stat label="متاحة للتعاقد" value={String(counts.available)} accent />
          <Stat label="قيد الشراء والتجهيز" value={String(counts.in_purchase + counts.preparing)} />
          <Stat label="محجوزة أو متعاقد عليها" value={String(counts.reserved + counts.contracted)} />
        </div>
      )}

      <Card className="space-y-4 p-4">
        <label className="relative block">
          <Search size={17} className="absolute start-3 top-1/2 -translate-y-1/2 text-muted" />
          <input className={cn(inputCls, "ps-10")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالمركبة أو اللوحة أو رقم الهيكل" aria-label="البحث في السيارات" />
        </label>
        {canManage && (
          <div className="flex gap-2 overflow-x-auto pb-1" aria-label="تصفية السيارات حسب الحالة">
            <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>الكل <span className="num">{vehicles.length}</span></FilterButton>
            {STATUS_FILTERS.map(({ key, label }) => (
              <FilterButton key={key} active={filter === key} onClick={() => setFilter(key)}>
                {label} <span className="num">{counts[key]}</span>
              </FilterButton>
            ))}
          </div>
        )}
      </Card>

      {filtered.length === 0 ? (
        <Empty text={vehicles.length === 0 ? "لا توجد سيارات متاحة للعرض حالياً" : "لا توجد سيارات مطابقة للبحث"} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((vehicle, index) => (
            <Fade key={vehicle.id}>
              <Link href={`/vehicles/${vehicle.id}`} className="group block h-full overflow-hidden rounded-2xl border border-line bg-surface shadow-soft transition hover:-translate-y-0.5 hover:border-brand hover:shadow-lift">
                <VehiclePhoto src={vehicle.images.find((image) => image.startsWith("/vehicles/"))} alt={`${vehicle.make} ${vehicle.model} ${vehicle.year}`} className="aspect-[16/9] w-full" priority={index === 0} />
                <div className="p-4">
                <div className="flex items-start gap-3">
                  <VehicleBrandIcon make={vehicle.make} className="h-12 w-12 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><p className="truncate font-bold">{vehicle.make} {vehicle.model}</p><p className="mt-1 text-xs text-muted">{vehicle.year} · {vehicle.color} · {formatKm(vehicle.mileage)}</p></div>
                      <StatusBadge status={vehicle.status} />
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
                  <PlateBadge ar={vehicle.plateAr} en={vehicle.plateEn} />
                  <span className="text-end"><span className="block text-[11px] text-muted">سعر البيع</span><span className="num font-bold text-brand">{formatAmount(vehicle.listPrice)} ر.س</span></span>
                </div>
                </div>
              </Link>
            </Fade>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition", active ? "border-ink bg-ink text-white dark:bg-white dark:text-ink" : "border-line hover:bg-neutral-soft")}>
      {children}
    </button>
  );
}
