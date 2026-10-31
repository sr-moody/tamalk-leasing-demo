"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CarFront, Plus } from "lucide-react";
import { toast } from "sonner";
import type { Vehicle } from "@/types/domain";
import { can } from "@/lib/permissions";
import { useSession } from "@/lib/session";
import { todayISO } from "@/lib/domain/dates";
import { appConfig } from "@/lib/config";
import { CAR_MODELS, COLORS, PLATE_LETTERS } from "@/mocks/data/catalog";
import { Button, Card, Fade, Field, inputCls, Select, VehiclePhoto } from "@/components/ui/basics";
import { cn } from "@/lib/utils";
import { appendAudit } from "@/lib/audit";

const CURRENT_YEAR = new Date().getFullYear();

export default function NewVehiclePage() {
  const router = useRouter();
  const { db, role, update } = useSession();
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState(String(CURRENT_YEAR));
  const [colorName, setColorName] = useState(COLORS[0].name);
  const [plateAr, setPlateAr] = useState("");
  const [plateEn, setPlateEn] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("0");
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [purchasePrice, setPurchasePrice] = useState("");
  const [listPrice, setListPrice] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const priceRange = appConfig.vehiclePriceRange;

  const readPhoto = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("اختر ملف صورة صالحاً");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("حجم الصورة أكبر من 10 ميجابايت");
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1200 / bitmap.width, 900 / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("تعذر تجهيز الصورة");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => result ? resolve(result) : reject(new Error("تعذر ضغط الصورة")), "image/jpeg", 0.78);
      });
      setPhoto(await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("تعذر قراءة الصورة"));
        reader.onerror = () => reject(new Error("تعذر قراءة الصورة"));
        reader.readAsDataURL(blob);
      }));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذر تجهيز صورة السيارة");
    }
  };

  useEffect(() => {
    if (db && role && !can(role, "vehicles.manage")) router.replace("/vehicles");
  }, [db, role, router]);

  if (!db || !role || !can(role, "vehicles.manage")) return null;

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;

    const cleanMake = make.trim();
    const cleanModel = model.trim();
    const cleanVin = vin.trim().toUpperCase();
    const cleanPlateAr = plateAr.trim();
    const cleanPlateEn = plateEn.trim().toUpperCase();
    const parsedYear = Number(year);
    const parsedMileage = Number(mileage);
    const parsedPurchase = Number(purchasePrice);
    const parsedListPrice = Number(listPrice);
    const color = COLORS.find((item) => item.name === colorName);
    const modelPhoto = CAR_MODELS.find((item) =>
      item.make === cleanMake && item.model.toLocaleLowerCase() === cleanModel.toLocaleLowerCase(),
    )?.image;

    if (!cleanMake || !cleanModel || !color) {
      toast.error("أدخل الشركة والطراز واللون");
      return;
    }
    if (!Number.isInteger(parsedYear) || parsedYear < 1980 || parsedYear > CURRENT_YEAR + 1) {
      toast.error("أدخل سنة صنع صحيحة");
      return;
    }
    const arabicLetters = PLATE_LETTERS.map(([letter]) => letter.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const arabicPlatePattern = new RegExp(`^(?:${arabicLetters}){3}[٠-٩0-9]{4}$`);
    if (!arabicPlatePattern.test(cleanPlateAr.replace(/\s/g, "")) || !/^[A-Z]{3}\s?\d{4}$/.test(cleanPlateEn)) {
      toast.error("أدخل حروف اللوحة العربية وثلاثة أحرف وأربعة أرقام للوحة الإنجليزية");
      return;
    }
    if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(cleanVin)) {
      toast.error("رقم الهيكل يجب أن يتكون من 17 حرفاً ورقماً");
      return;
    }
    if (!Number.isInteger(parsedMileage) || parsedMileage < 0) {
      toast.error("أدخل قراءة عداد صحيحة");
      return;
    }
    if (!purchaseDate || purchaseDate > todayISO()) {
      toast.error("تاريخ الشراء لا يمكن أن يكون في المستقبل");
      return;
    }
    if (!Number.isFinite(parsedPurchase) || parsedPurchase <= 0 || !Number.isFinite(parsedListPrice) || parsedListPrice < priceRange.min || parsedListPrice > priceRange.max) {
      toast.error(`أدخل سعر شراء موجباً وسعر بيع بين ${priceRange.min.toLocaleString("ar-SA")} و${priceRange.max.toLocaleString("ar-SA")} ريال`);
      return;
    }
    const normalizePlate = (value: string) => value.replace(/\s/g, "").toLocaleUpperCase();
    if (db.vehicles.some((vehicle) =>
      vehicle.vin.toLocaleUpperCase() === cleanVin
      || normalizePlate(vehicle.plateEn) === normalizePlate(cleanPlateEn)
      || normalizePlate(vehicle.plateAr) === normalizePlate(cleanPlateAr),
    )) {
      toast.error("رقم الهيكل أو اللوحة مسجل مسبقاً");
      return;
    }

    setSaving(true);
    const now = new Date().toISOString();
    const vehicleId = `v-${crypto.randomUUID()}`;
    const vehicle: Vehicle = {
      id: vehicleId,
      plateAr: cleanPlateAr,
      plateEn: cleanPlateEn,
      make: cleanMake,
      model: cleanModel,
      year: parsedYear,
      color: color.name,
      colorHex: color.hex,
      vin: cleanVin,
      mileage: parsedMileage,
      images: photo ? [photo] : modelPhoto ? [modelPhoto] : [],
      purchaseDate,
      purchasePrice: parsedPurchase,
      listPrice: parsedListPrice,
      status: "in_purchase",
      expenses: [],
      statusHistory: [{ status: "in_purchase", at: now, by: role === "admin" ? "u-admin" : "u-proc", note: "إضافة سيارة إلى الأسطول" }],
    };
    let duplicate = false;
    update((current) => {
      if (current.vehicles.some((existing) =>
        existing.vin.toLocaleUpperCase() === cleanVin
        || normalizePlate(existing.plateEn) === normalizePlate(cleanPlateEn)
        || normalizePlate(existing.plateAr) === normalizePlate(cleanPlateAr),
      )) {
        duplicate = true;
        return;
      }
      current.vehicles.unshift(vehicle);
      appendAudit(current, {
        userId: role === "admin" ? "u-admin" : "u-proc",
        actorRole: role,
        action: "vehicle.created",
        entity: "vehicle",
        entityId: vehicleId,
        details: `إضافة ${cleanMake} ${cleanModel} إلى الأسطول`,
      }, role);
    });

    if (duplicate) {
      setSaving(false);
      toast.error("تم تسجيل هذه السيارة مسبقاً؛ حدّث بيانات اللوحة أو رقم الهيكل");
      return;
    }
    toast.success("تمت إضافة السيارة إلى الأسطول بحالة قيد الشراء");
    router.push(`/vehicles/${vehicleId}`);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <Fade>
        <Link href="/vehicles" className="mb-3 inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-brand">
          <ArrowRight size={16} /> العودة إلى الأسطول
        </Link>
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><CarFront size={22} /></span>
          <div><h1 className="text-2xl font-bold">إضافة سيارة للأسطول</h1><p className="mt-1 text-sm text-muted">سجّل بيانات السيارة وتكلفتها؛ ستبدأ بحالة قيد الشراء.</p></div>
        </div>
      </Fade>

      <form onSubmit={save} className="grid items-start gap-5 lg:grid-cols-3">
        <Card className="space-y-5 lg:col-span-2">
          <div><h2 className="font-bold">بيانات المركبة</h2><p className="mt-1 text-xs text-muted">يجب أن تكون اللوحة ورقم الهيكل غير مسجلين لسيارة أخرى.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="الشركة المصنعة *">
              <input required className={inputCls} value={make} onChange={(event) => setMake(event.target.value)} placeholder="مثال: تويوتا" />
            </Field>
            <Field label="الطراز *">
              <input required className={inputCls} value={model} onChange={(event) => setModel(event.target.value)} placeholder="مثال: كامري" />
            </Field>
            <Field label="سنة الصنع *">
              <input required className={cn(inputCls, "num")} type="number" min="1980" max={CURRENT_YEAR + 1} value={year} onChange={(event) => setYear(event.target.value)} />
            </Field>
            <Field label="اللون *">
              <Select value={colorName} onChange={(event) => setColorName(event.target.value)}>
                {COLORS.map((color) => <option key={color.name} value={color.name}>{color.name}</option>)}
              </Select>
            </Field>
            <Field label="اللوحة بالعربية *">
              <input required className={inputCls} value={plateAr} onChange={(event) => setPlateAr(event.target.value)} placeholder="أ ب ج 1234" />
            </Field>
            <Field label="اللوحة بالإنجليزية *">
              <input required className={cn(inputCls, "num")} value={plateEn} onChange={(event) => setPlateEn(event.target.value.toUpperCase())} placeholder="ABC 1234" dir="ltr" />
            </Field>
            <Field label="رقم الهيكل (VIN) *">
              <input required minLength={17} maxLength={17} className={cn(inputCls, "num uppercase")} value={vin} onChange={(event) => setVin(event.target.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase())} placeholder="17 حرفاً ورقماً" dir="ltr" />
            </Field>
            <Field label="قراءة العداد (كم) *">
              <input required className={cn(inputCls, "num")} type="number" min="0" step="1" inputMode="numeric" value={mileage} onChange={(event) => setMileage(event.target.value)} />
            </Field>
          </div>
        </Card>

        <div className="space-y-5">
          <Card className="space-y-4">
            <h2 className="font-bold">الشراء والتسعير</h2>
            <Field label="تاريخ الشراء *">
              <input required className={cn(inputCls, "num")} type="date" max={todayISO()} value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} />
            </Field>
            <Field label="سعر الشراء (ريال) *">
              <input required className={cn(inputCls, "num")} type="number" min="0.01" step="0.01" inputMode="decimal" value={purchasePrice} onChange={(event) => setPurchasePrice(event.target.value)} placeholder="0.00" />
            </Field>
            <Field label={`سعر السيارة المقترح (من ${priceRange.min.toLocaleString("ar-SA")} إلى ${priceRange.max.toLocaleString("ar-SA")} ريال) *`}>
              <input required className={cn(inputCls, "num")} type="number" min={priceRange.min} max={priceRange.max} step="100" inputMode="decimal" value={listPrice} onChange={(event) => setListPrice(event.target.value)} placeholder="0" />
            </Field>
            <Field label="صورة السيارة الفعلية">
              <input type="file" accept="image/*" className={cn(inputCls, "file:me-3 file:rounded-lg file:border-0 file:bg-brand-soft file:px-3 file:py-1 file:text-xs file:font-semibold file:text-brand")} onChange={(event) => { const selected = event.currentTarget.files?.[0]; if (selected) void readPhoto(selected); }} />
            </Field>
          </Card>
          <Card className="flex items-start gap-3 bg-surface-2">
            <span className="mt-1 h-4 w-4 shrink-0 rounded-full border border-line" style={{ background: COLORS.find((item) => item.name === colorName)?.hex }} />
            <div className="min-w-0"><p className="font-bold">{make || "الشركة"} {model || "الطراز"} {year}</p><p className="mt-1 text-xs text-muted">ستُضاف المركبة بحالة قيد الشراء، ويمكن تجهيزها وإتاحتها للتعاقد من ملف السيارة.</p></div>
          </Card>
          <Card className="space-y-3">
            <h2 className="font-bold">معاينة الصورة</h2>
            <VehiclePhoto src={photo ?? CAR_MODELS.find((item) => item.make === make.trim() && item.model.toLocaleLowerCase() === model.trim().toLocaleLowerCase())?.image} alt={`${make || "السيارة"} ${model}`.trim()} className="aspect-[16/10] w-full rounded-xl" />
            <p className="text-xs leading-5 text-muted">تُحفظ الصورة بحجم مناسب داخل بيانات العرض؛ اختر صورة السيارة نفسها لعرض المركبة الفعلية بدلاً من صورة الطراز العامة.</p>
          </Card>
        </div>

        <div className="flex justify-end gap-2 lg:col-span-3">
          <Button type="button" variant="outline" onClick={() => router.push("/vehicles")}>إلغاء</Button>
          <Button type="submit" disabled={saving}><Plus size={16} /> {saving ? "جارٍ حفظ السيارة…" : "حفظ السيارة"}</Button>
        </div>
      </form>
    </div>
  );
}
