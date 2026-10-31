"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ExpenseType } from "@/types/domain";
import { getVehicleEconomics } from "@/lib/domain/balances";
import { currentContractFor } from "@/lib/domain/portfolio";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { formatAmount, formatDateShort, formatKm, formatMoney } from "@/lib/format";
import { Card, Fade, PlateBadge, Stat, StatusBadge, VehiclePhoto } from "@/components/ui/basics";

const EXP: Record<ExpenseType, string> = { maintenance: "صيانة", insurance: "تأمين", registration: "استمارة", preparation: "تجهيز", other: "أخرى" };

export default function VehiclePage() {
  const { id } = useParams<{ id: string }>();
  const { db, role } = useSession();
  if (!db || !role) return null;
  const v = db.vehicles.find((x) => x.id === id);
  if (!v) return <p className="text-muted">السيارة غير موجودة</p>;
  const eco = getVehicleEconomics(v, currentContractFor(v.id, db.contracts));
  const history = db.contracts.filter((c) => c.vehicleId === v.id);
  const showCost = can(role, "vehicles.viewCost");

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-2"><h1 className="text-2xl font-bold">{v.make} {v.model}</h1><StatusBadge status={v.status} /></div>
            <p className="text-sm text-muted">{v.year} · {v.color} · {formatKm(v.mileage)}</p>
          </div>
        </div>
        <PlateBadge ar={v.plateAr} en={v.plateEn} className="scale-125" />
      </Fade>
      <VehiclePhoto src={v.images.find((image) => image.startsWith("/vehicles/"))} alt={`${v.make} ${v.model} ${v.year}`} className="aspect-[16/7] w-full rounded-2xl sm:aspect-[16/6]" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="سعر البيع" value={formatMoney(v.listPrice)} accent />
        <Stat label="رقم الهيكل" value={v.vin.slice(-8)} sub="آخر 8 أرقام" />
        <Stat label="تاريخ الشراء" value={formatDateShort(v.purchaseDate)} />
        <Stat label="العقود" value={String(history.length)} />
      </div>
      {showCost && (
        <Card dark>
          <p className="text-sm text-shell-muted">التكلفة الفعلية (شراء + مصروفات)</p>
          <p className="num mt-1 text-3xl font-bold">{formatMoney(eco.actualCost)}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
            <span><span className="text-shell-muted">الشراء: </span><span className="num">{formatAmount(eco.purchasePrice)}</span></span>
            <span><span className="text-shell-muted">المصروفات: </span><span className="num">{formatAmount(eco.expensesTotal)}</span></span>
            <span><span className="text-shell-muted">ربح تقديري: </span><span className="num font-bold text-brand">{formatAmount(eco.estimatedProfit)}</span></span>
          </div>
          {v.expenses.length > 0 && (
            <div className="mt-4 divide-y divide-shell-line border-t border-shell-line text-sm">
              {v.expenses.map((e) => (
                <div key={e.id} className="flex items-center gap-3 py-2"><span className="w-20 text-shell-muted">{EXP[e.type]}</span><span className="flex-1 truncate">{e.note ?? "—"}</span><span className="num text-shell-muted">{formatDateShort(e.date)}</span><span className="num font-semibold">{formatAmount(e.amount)}</span></div>
              ))}
            </div>
          )}
        </Card>
      )}
      <h2 className="text-lg font-bold">سجل العقود</h2>
      {history.length === 0 ? <p className="text-sm text-muted">لا توجد عقود على هذه السيارة</p> : (
        <Card className="divide-y divide-line p-0">
          {history.map((c) => (
            <Link key={c.id} href={`/contracts/${c.id}`} className="flex items-center gap-3 px-5 py-3 text-sm hover:bg-surface-2">
              <span className="num font-bold text-brand">{c.number}</span>
              <span className="flex-1">{db.customers.find((x) => x.id === c.customerId)?.fullName}</span>
              <span className="num hidden text-muted sm:block">{formatDateShort(c.createdAt)}</span>
              <StatusBadge status={c.status} />
            </Link>
          ))}
        </Card>
      )}
    </div>
  );
}
