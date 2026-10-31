/**
 * مولد بيانات ثابت (Seeded): نفس اليوم ← نفس البيانات. كل التواريخ نسبية لتاريخ اليوم.
 * SPEC §6.1
 */
import type {
  AuditEntry,
  CollectionNote,
  Contract,
  Customer,
  CustomerDocument,
  Database,
  Handover,
  Installment,
  Payment,
  PaymentMethod,
  User,
  Vehicle,
  VehicleExpense,
  VehicleStatus,
  VehicleStatusEvent,
} from "@/types/domain";
import { allocatePayment, refreshContract } from "@/lib/domain/allocation";
import { DEFAULT_ALERT_SETTINGS } from "@/lib/domain/alerts";
import { formatContractNumber, formatReceiptNumber } from "@/lib/domain/contractNumber";
import { addDaysISO, addMonthsISO, daysBetween, type ISODate } from "@/lib/domain/dates";
import { round2, toHalalas, toRiyals } from "@/lib/domain/money";
import { calcContractTerms, generateSchedule } from "@/lib/domain/schedule";
import { buildTemplateVars, renderTemplate } from "@/lib/domain/template";
import {
  CAR_MODELS,
  CITIES,
  EMPLOYERS,
  HANDOVER_NOTES,
  NOTE_TEMPLATES,
  PHONE_PREFIXES,
  PLATE_LETTERS,
  RESIDENT_NAMES,
  SAUDI_FAMILIES,
  SAUDI_FATHERS,
  SAUDI_FEMALE,
  SAUDI_MALE,
} from "./catalog";
import { DEFAULT_CONTRACT_TEMPLATE } from "./template";

export const SEED_VERSION = 7;
export const DEMO_CUSTOMER_PHONE = "+966551234567";
const CONTRACT_UPFRONT_FEE = 2000;

/* ---------- PRNG ---------- */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  int(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  digits(n: number): string {
    return Array.from({ length: n }, () => this.int(0, 9)).join("");
  }
  /** تقريب لأقرب step */
  price(min: number, max: number, step = 500): number {
    return Math.round(this.int(min, max) / step) * step;
  }
}

/* ---------- المستخدمون ---------- */
export const USERS: User[] = [
  { id: "u-admin", name: "أ عبدالعزيز", email: "admin@tamalk.sa", role: "admin", active: true, phone: "+966500000001" },
  { id: "u-sales1", name: "ريم الشهري", email: "sales@tamalk.sa", role: "sales", active: true, phone: "+966500000002" },
  { id: "u-sales2", name: "ماجد الحربي", email: "sales2@tamalk.sa", role: "sales", active: true, phone: "+966500000003" },
  { id: "u-acc1", name: "نواف العنزي", email: "finance@tamalk.sa", role: "accountant", active: true, phone: "+966500000004" },
  { id: "u-acc2", name: "هيا المطيري", email: "collections@tamalk.sa", role: "accountant", active: true, phone: "+966500000005" },
  { id: "u-proc", name: "سلطان الدوسري", email: "procurement@tamalk.sa", role: "procurement", active: true, phone: "+966500000006" },
];
const SALES_IDS = ["u-sales1", "u-sales2"];
const ACC_IDS = ["u-acc1", "u-acc2"];

const DEMO_PASSWORD = "demo1234";
export const DEMO_OTP = "1234";
export const isDemoPassword = (p: string): boolean => p === DEMO_PASSWORD;

/* ---------- خطط العقود ---------- */
type Plan =
  | { kind: "active"; months: number; nextOffset: number; elapsed?: number; prepayToday?: boolean; partialNext?: boolean; demo?: boolean }
  | { kind: "ending"; months: number; endOffset: number }
  | { kind: "overdue"; months: number; daysOverdue: number; partial?: boolean }
  | { kind: "paid_off"; months: number; endOffset: number }
  | { kind: "owned"; months: number; endOffset: number }
  | { kind: "pending"; months: number; createdOffset: number }
  | { kind: "terminated"; months: number; createdOffset: number; paidCount: number };

function buildPlans(rng: Rng): Plan[] {
  const plans: Plan[] = [];
  plans.push({ kind: "active", months: 24, nextOffset: 2, elapsed: 14, partialNext: true, demo: true });
  [1, 2, 3].forEach((endOffset) => plans.push({ kind: "ending", months: 24, endOffset }));
  plans.push({ kind: "active", months: 24, nextOffset: 0 });
  for (let i = 0; i < 25; i++) plans.push({ kind: "active", months: 24, nextOffset: rng.pick([6, 9, 12, 15, 18, 21]) });
  [5, 7, 12, 18, 24, 45].forEach((daysOverdue) => plans.push({ kind: "overdue", months: 24, daysOverdue }));
  for (let i = 0; i < 3; i++) plans.push({ kind: "paid_off", months: 24, endOffset: -9 });
  plans.push({ kind: "owned", months: 24, endOffset: -12 });
  for (let i = 0; i < 3; i++) plans.push({ kind: "pending", months: 24, createdOffset: -1 });
  for (let i = 0; i < 2; i++) plans.push({ kind: "terminated", months: 24, createdOffset: -45, paidCount: rng.pick([4, 8]) });
  return plans;
}

/** أول تاريخ استحقاق بحيث يقع القسط رقم (index+1) في target بالضبط */
function firstDueHitting(target: ISODate, index: number): { firstDueDate: ISODate; index: number } {
  for (let i = index; i >= 0; i--) {
    const first = addMonthsISO(target, -i);
    if (addMonthsISO(first, i) === target) return { firstDueDate: first, index: i };
  }
  return { firstDueDate: target, index: 0 };
}

/* ---------- المولد ---------- */
export function generateSeed(today: ISODate): Database {
  const rng = new Rng(20261026);
  const audit: AuditEntry[] = [];
  let auditSeq = 0;
  const log = (at: string, userId: string, action: string, entity: AuditEntry["entity"], entityId: string, details?: string) =>
    audit.push({ id: `a-${++auditSeq}`, at, userId, action, entity, entityId, details });

  const at = (date: ISODate, h = rng.int(8, 17), m = rng.int(0, 59)): string =>
    `${date}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;

  /* ---- السيارات ---- */
  const usedPlates = new Set<string>();
  const makePlate = (): { ar: string; en: string } => {
    for (;;) {
      const letters = [rng.pick(PLATE_LETTERS), rng.pick(PLATE_LETTERS), rng.pick(PLATE_LETTERS)];
      const num = String(rng.int(1000, 9999));
      const en = `${letters.map((l) => l[1]).join("")} ${num}`;
      if (usedPlates.has(en)) continue;
      usedPlates.add(en);
      const arDigits = num.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
      return { ar: `${letters.map((l) => l[0]).join(" ")} ${arDigits}`, en };
    }
  };
  const VIN_CHARS = "ABCDEFGHJKLMNPRSTUVWXYZ0123456789";
  const makeVin = (): string => `JT${Array.from({ length: 15 }, () => rng.pick(VIN_CHARS.split(""))).join("")}`;

  let vehicleSeq = 0;
  const makeVehicle = (purchaseDate: ISODate, modelIdx?: number): Vehicle => {
    const m = modelIdx !== undefined ? CAR_MODELS[modelIdx] : rng.pick(CAR_MODELS);
    const color = m.color;
    const plate = makePlate();
    const listPrice = rng.price(m.price[0], m.price[1]);
    const purchasePrice = rng.price(listPrice * 0.8, listPrice * 0.87);
    const id = `v-${String(++vehicleSeq).padStart(3, "0")}`;
    const year = rng.int(m.year[0], m.year[1]);
    const expenses: VehicleExpense[] = [
      { id: `${id}-e1`, type: "insurance", amount: rng.price(2400, 4200, 50), date: addDaysISO(purchaseDate, 2), createdBy: "u-proc", note: "تأمين شامل — سنة أولى" },
      { id: `${id}-e2`, type: "registration", amount: rng.price(350, 800, 50), date: addDaysISO(purchaseDate, 3), createdBy: "u-proc", note: "استمارة ولوحات" },
      { id: `${id}-e3`, type: "preparation", amount: rng.price(700, 2600, 50), date: addDaysISO(purchaseDate, 6), createdBy: "u-proc", note: "تظليل وحماية وتنظيف" },
    ];
    return {
      id,
      plateAr: plate.ar,
      plateEn: plate.en,
      make: m.make,
      model: m.model,
      year,
      color: color.name,
      colorHex: color.hex,
      vin: makeVin(),
      mileage: rng.int(45000, 180000),
      images: [m.image],
      purchaseDate,
      purchasePrice,
      listPrice,
      status: "available",
      expenses,
      statusHistory: [],
    };
  };

  const vehicles: Vehicle[] = [];
  const pushHistory = (v: Vehicle, status: VehicleStatus, date: string, by: string, note?: string) => {
    v.statusHistory.push({ status, at: date.length === 10 ? at(date) : date, by, note });
    v.status = status;
  };
  /** سيارة جاهزة قبل تاريخ معين */
  const vehicleReadyBy = (readyDate: ISODate, modelIdx?: number): Vehicle => {
    const purchaseDate = addDaysISO(readyDate, -rng.int(12, 25));
    const v = makeVehicle(purchaseDate, modelIdx);
    pushHistory(v, "in_purchase", purchaseDate, "u-proc");
    pushHistory(v, "preparing", addDaysISO(purchaseDate, 3), "u-proc");
    pushHistory(v, "available", readyDate, "u-proc");
    log(at(purchaseDate), "u-proc", "vehicle.created", "vehicle", v.id, `${v.make} ${v.model}`);
    vehicles.push(v);
    return v;
  };

  /* ---- العملاء ---- */
  const usedIds = new Set<string>();
  const usedPhones = new Set<string>([DEMO_CUSTOMER_PHONE]);
  let customerSeq = 0;
  const makeCustomer = (createdAt: ISODate, opts: { demo?: boolean; resident?: boolean; female?: boolean } = {}): Customer => {
    const resident = opts.resident ?? false;
    const id = `c-${String(++customerSeq).padStart(3, "0")}`;
    let fullName: string;
    if (opts.demo) fullName = "عبدالله محمد العتيبي";
    else if (resident) fullName = rng.pick(RESIDENT_NAMES);
    else {
      const first = opts.female ? rng.pick(SAUDI_FEMALE) : rng.pick(SAUDI_MALE);
      fullName = `${first} ${rng.pick(SAUDI_FATHERS)} ${rng.pick(SAUDI_FAMILIES)}`;
    }
    let nationalId: string;
    do nationalId = `${resident ? 2 : 1}${rng.digits(9)}`;
    while (usedIds.has(nationalId));
    usedIds.add(nationalId);
    let phone: string;
    if (opts.demo) phone = DEMO_CUSTOMER_PHONE;
    else {
      do phone = `+966${rng.pick(PHONE_PREFIXES)}${rng.digits(7)}`;
      while (usedPhones.has(phone));
      usedPhones.add(phone);
    }
    const docs: CustomerDocument[] = [
      { id: `${id}-d1`, type: "national_id", number: nationalId, issuedAt: addDaysISO(createdAt, -rng.int(400, 1500)), expiresAt: addDaysISO(today, rng.int(120, 1600)), uploadedAt: createdAt },
      { id: `${id}-d2`, type: "license", number: rng.digits(10), issuedAt: addDaysISO(createdAt, -rng.int(300, 2000)), expiresAt: addDaysISO(today, rng.int(90, 1800)), uploadedAt: createdAt },
      { id: `${id}-d3`, type: "salary_certificate", issuedAt: addDaysISO(createdAt, -rng.int(1, 20)), uploadedAt: createdAt },
      { id: `${id}-d4`, type: "bank_statement", issuedAt: addDaysISO(createdAt, -rng.int(1, 15)), uploadedAt: createdAt },
    ];
    const income = rng.price(7000, 32000, 250);
    return {
      id,
      fullName,
      nationalId,
      idType: resident ? "resident" : "citizen",
      phone,
      email: rng.chance(0.7) ? `user${customerSeq}@${rng.pick(["gmail.com", "outlook.sa", "hotmail.com"])}` : undefined,
      city: opts.demo ? "الرياض" : rng.pick(CITIES),
      employer: rng.pick(EMPLOYERS),
      monthlyIncome: income,
      riskLevel: "low",
      documents: docs,
      communications: [],
      createdAt: at(createdAt),
    };
  };

  /* ---- العقود ---- */
  const contracts: Contract[] = [];
  const payments: Payment[] = [];

  const methods: PaymentMethod[] = ["bank_transfer", "bank_transfer", "sadad", "mada", "cash", "sadad"];

  const makeHandover = (date: ISODate, mileage: number): Handover => ({
    at: at(date, rng.int(10, 16)),
    by: rng.pick(SALES_IDS),
    mileage,
    fuelLevel: rng.pick([50, 75, 100]),
    notes: rng.pick(HANDOVER_NOTES),
    photos: ["front", "side", "rear", "odometer"],
  });

  const plans = buildPlans(rng);
  const customers: Customer[] = [];
  const demoCustomer = makeCustomer(addDaysISO(today, -600), { demo: true });
  customers.push(demoCustomer);

  // عملاء التمليك يعودون بعقد جديد (عملاء متكررون)
  const repeatPool: Customer[] = [];

  plans.forEach((plan, idx) => {
    const months = plan.months;
    // ---- تحديد التواريخ ----
    let firstDueDate: ISODate;
    let fixedCreated: ISODate | undefined;
    let paidCount = 0;
    if (plan.kind === "active") {
      const target = addDaysISO(today, plan.nextOffset);
      const wanted = plan.elapsed ?? rng.int(3, months - 6);
      const hit = firstDueHitting(target, wanted);
      firstDueDate = hit.firstDueDate;
      paidCount = hit.index;
    } else if (plan.kind === "ending") {
      const target = addDaysISO(today, plan.endOffset);
      firstDueDate = addMonthsISO(target, -(months - 1));
      paidCount = months - 1;
    } else if (plan.kind === "overdue") {
      const target = addDaysISO(today, -plan.daysOverdue);
      const hit = firstDueHitting(target, rng.int(4, months - 10));
      firstDueDate = hit.firstDueDate;
      paidCount = hit.index;
    } else if (plan.kind === "paid_off" || plan.kind === "owned") {
      const target = addDaysISO(today, plan.endOffset);
      firstDueDate = addMonthsISO(target, -(months - 1));
      paidCount = months;
    } else if (plan.kind === "pending") {
      fixedCreated = addDaysISO(today, plan.createdOffset);
      firstDueDate = addMonthsISO(addDaysISO(fixedCreated, 5), 1);
    } else {
      fixedCreated = addDaysISO(today, plan.createdOffset);
      firstDueDate = addMonthsISO(addDaysISO(fixedCreated, 3), 1);
      paidCount = plan.paidCount;
    }
    const createdAt: ISODate = fixedCreated ?? addDaysISO(firstDueDate, -rng.int(28, 35));

    // ---- العميل ----
    let customer: Customer;
    if (plan.kind === "active" && plan.demo) customer = demoCustomer;
    else if (plan.kind === "active" && repeatPool.length > 0 && idx > 22) customer = repeatPool.shift() as Customer;
    else {
      customer = makeCustomer(addDaysISO(createdAt, -rng.int(2, 10)), { resident: rng.chance(0.22), female: rng.chance(0.18) });
      customers.push(customer);
    }
    if (plan.kind === "owned") repeatPool.push(customer);

    // ---- السيارة ----
    const vehicle = vehicleReadyBy(addDaysISO(createdAt, -rng.int(3, 20)), plan.kind === "active" && plan.demo ? 0 : undefined);

    // ---- الشروط ----
    const vehiclePrice = vehicle.listPrice;
    const downPayment = 0;
    const upfrontFee = CONTRACT_UPFRONT_FEE;
    const terms = calcContractTerms({ vehiclePrice, downPayment, upfrontFee, months, vatRate: 0.15 });
    const cid = `k-${String(idx + 1).padStart(3, "0")}`;
    const installments: Installment[] = generateSchedule({ terms, firstDueDate, idPrefix: cid });
    const endDate = installments[installments.length - 1].dueDate;
    const createdBy = rng.pick(SALES_IDS);

    const contract: Contract = {
      id: cid,
      number: "",
      customerId: customer.id,
      vehicleId: vehicle.id,
      vehiclePrice,
      downPayment,
      upfrontFee,
      months,
      installmentAmount: terms.installment,
      vatRate: 0.15,
      firstDueDate,
      endDate,
      dueDay: Number(firstDueDate.slice(8, 10)),
      status: "active",
      createdAt: at(createdAt),
      createdBy,
      termsSnapshot: "",
      installments,
      payments: [],
    };

    // ---- دورة الحياة ----
    pushHistory(vehicle, "reserved", createdAt, createdBy, contract.id);
    log(contract.createdAt, createdBy, "contract.created", "contract", cid);

    if (plan.kind === "pending") {
      contract.status = "pending_approval";
    } else {
      const approvedAt = addDaysISO(createdAt, 1);
      const handoverAt = addDaysISO(createdAt, 2);
      contract.approvedBy = "u-admin";
      contract.approvedAt = at(approvedAt);
      contract.handover = makeHandover(handoverAt, vehicle.mileage);
      pushHistory(vehicle, "contracted", contract.handover.at, contract.handover.by, contract.id);
      log(contract.approvedAt, "u-admin", "contract.approved", "contract", cid);
      log(contract.handover.at, contract.handover.by, "contract.handover", "contract", cid);

      // المقدم
      const down: Payment = {
        id: `${cid}-p0`,
        receiptNo: "",
        contractId: cid,
        type: "down",
        amount: downPayment,
        method: rng.pick(["bank_transfer", "mada"] as const),
        paidAt: at(handoverAt),
        reference: `TRX${rng.digits(8)}`,
        createdBy: rng.pick(ACC_IDS),
        allocations: [],
      };
      if (downPayment > 0) contract.payments.push(down);
      contract.payments.push({
        id: `${cid}-fee`,
        receiptNo: "",
        contractId: cid,
        type: "contract_fee",
        amount: upfrontFee,
        method: rng.pick(["bank_transfer", "mada"] as const),
        paidAt: at(handoverAt),
        reference: `TRX${rng.digits(8)}`,
        createdBy: rng.pick(ACC_IDS),
        allocations: [],
      });

      // الأقساط المسددة
      const lateProne = plan.kind === "overdue" || rng.chance(0.25);
      for (let k = 0; k < Math.min(paidCount, installments.length); k++) {
        const inst = installments[k];
        let payDate = addDaysISO(inst.dueDate, lateProne && rng.chance(0.35) ? rng.int(1, 9) : -rng.int(0, 4));
        if (daysBetween(payDate, today) < 1) payDate = addDaysISO(today, -1);
        if (payDate < createdAt) payDate = createdAt;
        contract.payments.push({
          id: `${cid}-p${k + 1}`,
          receiptNo: "",
          contractId: cid,
          type: "installment",
          amount: inst.amount,
          method: rng.pick(methods),
          paidAt: at(payDate),
          reference: rng.chance(0.7) ? `TRX${rng.digits(8)}` : undefined,
          createdBy: rng.pick(ACC_IDS),
          allocations: [{ installmentId: inst.id, amount: inst.amount }],
        });
        inst.paidAmount = inst.amount;
      }

      // دفعات إضافية
      const extra = (amount: number, date: string, suffix: string) => {
        const res = allocatePayment(installments, amount);
        if (!res.ok) return;
        for (const a of res.allocations) {
          const inst = installments.find((i) => i.id === a.installmentId) as Installment;
          inst.paidAmount = toRiyals(toHalalas(inst.paidAmount) + toHalalas(a.amount));
        }
        contract.payments.push({
          id: `${cid}-${suffix}`,
          receiptNo: "",
          contractId: cid,
          type: "installment",
          amount,
          method: rng.pick(methods),
          paidAt: date,
          reference: `TRX${rng.digits(8)}`,
          createdBy: rng.pick(ACC_IDS),
          allocations: res.allocations,
        });
      };
      if (plan.kind === "active" && plan.prepayToday) {
        extra(installments[paidCount].amount, at(today, rng.int(8, 11)), "pt");
      }
      if (plan.kind === "active" && plan.partialNext) {
        extra(round2(installments[paidCount].amount * 0.5), at(addDaysISO(today, -rng.int(1, 3))), "pp");
      }
      if (plan.kind === "overdue" && plan.partial) {
        extra(round2(installments[paidCount].amount * 0.4), at(addDaysISO(today, -rng.int(1, 2))), "pp");
      }

      if (plan.kind === "paid_off") {
        contract.status = "paid_off";
      } else if (plan.kind === "owned") {
        contract.status = "owned";
        contract.ownedAt = at(addDaysISO(endDate, rng.int(3, 8)));
        pushHistory(vehicle, "sold", contract.ownedAt, "u-admin", contract.id);
        log(contract.ownedAt, "u-admin", "contract.owned", "contract", cid);
      } else if (plan.kind === "terminated") {
        const termDate = addDaysISO(installments[paidCount].dueDate, rng.int(95, 120));
        contract.status = "terminated";
        contract.terminatedAt = at(termDate);
        contract.returnRecord = { ...makeHandover(addDaysISO(termDate, 2), vehicle.mileage + rng.int(15000, 30000)), by: "u-proc", notes: "استرداد بعد التعثر — تحتاج فحص شامل" };
        pushHistory(vehicle, "returned", contract.returnRecord.at, "u-proc", contract.id);
        log(contract.terminatedAt, "u-admin", "contract.terminated", "contract", cid);
        vehicle.mileage = contract.returnRecord.mileage;
      }
      // عداد السيارة يزيد مع الوقت
      if (contract.status !== "terminated") {
        vehicle.mileage += Math.max(0, daysBetween(handoverAt, today)) * rng.int(35, 70);
      }
    }

    // ---- المخاطرة والتواصل ----
    if (plan.kind === "overdue") {
      customer.riskLevel = plan.daysOverdue > 20 ? "high" : "medium";
      const notes: CollectionNote[] = [];
      const n = plan.daysOverdue > 20 ? 3 : plan.daysOverdue > 5 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const channel = rng.pick(["call", "whatsapp", "call", "note"] as const);
        const day = addDaysISO(today, -Math.max(1, Math.round((plan.daysOverdue * (n - i)) / (n + 1))));
        notes.push({
          id: `${customer.id}-n${i + 1}`,
          at: at(day),
          by: rng.pick(ACC_IDS),
          channel,
          text: rng.pick(NOTE_TEMPLATES[channel]),
          contractId: cid,
          nextFollowUp: i === n - 1 ? addDaysISO(today, rng.int(0, 2)) : undefined,
        });
      }
      customer.communications.push(...notes);
    } else if (plan.kind === "terminated") {
      customer.riskLevel = "high";
    } else if (rng.chance(0.15)) {
      customer.riskLevel = "medium";
    }

    contracts.push(contract);
    payments.push(...contract.payments);
  });

  // ---- العميل التجريبي: رخصة تنتهي بعد 12 يوماً + سجل تواصل ودي ----
  const license = demoCustomer.documents.find((d) => d.type === "license");
  if (license) license.expiresAt = addDaysISO(today, 12);
  demoCustomer.email = "abdullah.alotaibi@gmail.com";
  demoCustomer.employer = "أرامكو السعودية";
  demoCustomer.monthlyIncome = 21500;
  demoCustomer.communications.push({
    id: `${demoCustomer.id}-n1`,
    at: at(addDaysISO(today, -20)),
    by: "u-acc1",
    channel: "whatsapp",
    text: "تم إرسال تذكير بموعد القسط وشكر العميل على الالتزام",
  });

  // ---- وثائق تنتهي خلال 30 يوماً لعملاء آخرين + وثيقة منتهية ----
  [5, 9, 17, 23, 28].forEach((days, i) => {
    const c = customers[3 + i * 5];
    const doc = c?.documents.find((d) => d.type === (i % 2 === 0 ? "national_id" : "license"));
    if (doc) doc.expiresAt = addDaysISO(today, days);
  });
  const expiredDoc = customers[7]?.documents.find((d) => d.type === "license");
  if (expiredDoc) expiredDoc.expiresAt = addDaysISO(today, -6);

  // ---- عملاء بدون عقود (عملاء محتملون) ----
  while (customers.length < 60) {
    customers.push(makeCustomer(addDaysISO(today, -rng.int(1, 90)), { resident: rng.chance(0.25), female: rng.chance(0.2) }));
  }

  // ---- سيارات خارج العقود ----
  // الأولى: سيارة المفسوخ الثاني أُعيد تجهيزها وأتيحت (تمر بحالة المستردة)
  const terminated = contracts.filter((c) => c.status === "terminated");
  const reVehicle = vehicles.find((v) => v.id === terminated[1]?.vehicleId);
  if (reVehicle && terminated[1]?.returnRecord) {
    const r = terminated[1].returnRecord.at.slice(0, 10);
    reVehicle.expenses.push({ id: `${reVehicle.id}-e9`, type: "maintenance", amount: 3850, date: addDaysISO(r, 4), createdBy: "u-proc", note: "صيانة شاملة بعد الاسترداد" });
    pushHistory(reVehicle, "preparing", addDaysISO(r, 3), "u-proc", "فحص وصيانة بعد الاسترداد");
    pushHistory(reVehicle, "available", addDaysISO(today, -2), "u-proc");
  }
  const firstTerminated = vehicles.find((v) => v.id === terminated[0]?.vehicleId);
  if (firstTerminated) firstTerminated.needsInspection = true;

  // متاحة (منها 3 أصبحت متاحة حديثاً ← تنبيه VEHICLE_READY للمبيعات)
  for (let i = 0; i < 2; i++) vehicleReadyBy(addDaysISO(today, -i - 1), [0, 1][i]);
  // قيد التجهيز
  for (let i = 0; i < 0; i++) {
    const p = addDaysISO(today, -rng.int(4, 12));
    const v = makeVehicle(p);
    pushHistory(v, "in_purchase", p, "u-proc");
    pushHistory(v, "preparing", addDaysISO(p, 3), "u-proc");
    if (i === 0) v.expenses = v.expenses.slice(0, 2);
    log(at(p), "u-proc", "vehicle.created", "vehicle", v.id, `${v.make} ${v.model}`);
    vehicles.push(v);
  }
  // قيد الشراء
  for (let i = 0; i < 0; i++) {
    const p = addDaysISO(today, -rng.int(0, 3));
    const v = makeVehicle(p);
    v.expenses = [];
    v.mileage = rng.int(0, 15);
    pushHistory(v, "in_purchase", p, "u-proc");
    log(at(p), "u-proc", "vehicle.created", "vehicle", v.id, `${v.make} ${v.model}`);
    vehicles.push(v);
  }
  // صيانة دورية عشوائية للسيارات المتعاقد عليها (تظهر في مصروفات الشهر)
  vehicles
    .filter((v) => v.status === "contracted")
    .forEach((v, i) => {
      if (i % 4 !== 0) return;
      v.expenses.push({ id: `${v.id}-m${i}`, type: "maintenance", amount: rng.price(450, 1800, 50), date: addDaysISO(today, -rng.int(0, 24)), createdBy: "u-proc", note: "صيانة دورية" });
    });
  vehicles.filter((v) => v.status === "contracted").slice(0, 5).forEach((v, i) =>
    v.expenses.push({ id: `${v.id}-i2`, type: "insurance", amount: rng.price(2600, 3900, 50), date: addDaysISO(today, -rng.int(1, 20)), createdBy: "u-proc", note: `تجديد تأمين ${i + 2}` }),
  );

  // ---- الترقيم: عقود حسب تاريخ الإنشاء، إيصالات حسب تاريخ الدفع ----
  const contractCounters: Record<number, number> = {};
  [...contracts]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .forEach((c) => {
      const y = Number(c.createdAt.slice(0, 4));
      contractCounters[y] = (contractCounters[y] ?? 0) + 1;
      c.number = formatContractNumber(y, contractCounters[y] + 40);
    });
  const receiptCounters: Record<number, number> = {};
  [...payments]
    .sort((a, b) => a.paidAt.localeCompare(b.paidAt))
    .forEach((p) => {
      const y = Number(p.paidAt.slice(0, 4));
      receiptCounters[y] = (receiptCounters[y] ?? 0) + 1;
      p.receiptNo = formatReceiptNumber(y, receiptCounters[y]);
      if (p.paidAt.slice(0, 10) >= addDaysISO(today, -45)) log(p.paidAt, p.createdBy, "payment.recorded", "payment", p.id, p.receiptNo);
    });

  // ---- نص العقد ----
  const company = {
    name: "تملك",
    legalName: "شركة تملك لتأجير السيارات",
    crNumber: "1010789456",
    vatNumber: "310987654300003",
    address: "الرياض، طريق الملك فهد، حي العليا",
    phone: "+966920001234",
    email: "info@tamalk.sa",
  };
  for (const c of contracts) {
    const customer = customers.find((x) => x.id === c.customerId) as Customer;
    const vehicle = vehicles.find((x) => x.id === c.vehicleId) as Vehicle;
    const terms = calcContractTerms({ vehiclePrice: c.vehiclePrice, downPayment: c.downPayment, upfrontFee: c.upfrontFee, months: c.months, vatRate: c.vatRate });
    c.termsSnapshot = renderTemplate(
      DEFAULT_CONTRACT_TEMPLATE,
      buildTemplateVars({ company, customer, vehicle, terms, number: c.number, createdAt: c.createdAt, firstDueDate: c.firstDueDate, endDate: c.endDate }),
    );
  }

  // ---- تحديث الحالات حسب اليوم ----
  const refreshed = contracts.map((c) => {
    const r = refreshContract(c, today);
    // عقود مسدد/تمليك تبقى كما هي
    return c.status === "owned" || c.status === "terminated" ? { ...r, status: c.status } : r;
  });

  const dueSoonDates = [
    today,
    today,
    today,
    today,
    today,
    addDaysISO(today, 1),
    addDaysISO(today, 2),
    addDaysISO(today, 3),
    addDaysISO(today, 1),
    addDaysISO(today, 2),
    addDaysISO(today, 3),
    addDaysISO(today, 1),
  ];
  let duePointer = 0;
  for (const contract of refreshed.filter((c) => ["active", "overdue"].includes(c.status) && c.customerId !== demoCustomer.id)) {
    for (const inst of contract.installments) {
      if (inst.status === "paid") continue;
      if (duePointer >= dueSoonDates.length) break;
      inst.dueDate = dueSoonDates[duePointer++];
    }
    if (duePointer >= dueSoonDates.length) break;
  }
  const refreshedNormalized = refreshed.map((c) => refreshContract(c, today));

  // ---- سجل تدقيق إضافي ----
  log(at(addDaysISO(today, -15)), "u-admin", "settings.alerts", "settings", "alerts");
  log(at(addDaysISO(today, -40)), "u-admin", "user.created", "user", "u-acc2");
  vehicles.forEach((v) =>
    v.statusHistory.sort((a, b) => a.at.localeCompare(b.at)).forEach((h: VehicleStatusEvent) => {
      if (h.status === "available" && h.at.slice(0, 10) >= addDaysISO(today, -30)) log(h.at, h.by, "vehicle.ready", "vehicle", v.id);
    }),
  );

  // ---- المستهدف الشهري ----
  const dueThisMonth = refreshedNormalized
    .filter((c) => c.status !== "terminated" && c.status !== "pending_approval")
    .flatMap((c) => c.installments.filter((i) => i.dueDate.slice(0, 7) === today.slice(0, 7)))
    .reduce((acc, i) => acc + i.amount, 0);

  const year = Number(today.slice(0, 4));
  return {
    version: SEED_VERSION,
    seededFor: today,
    vehicles,
    customers,
    contracts: refreshedNormalized,
    users: USERS.map((u, i) => ({ ...u, lastLoginAt: at(addDaysISO(today, -i % 3)) })),
    audit: audit.sort((a, b) => b.at.localeCompare(a.at)).filter((a) => a.at.slice(0, 10) <= today),
    settings: {
      company,
      alerts: DEFAULT_ALERT_SETTINGS,
      vatRate: 0.15,
      contractTemplate: DEFAULT_CONTRACT_TEMPLATE,
      monthlyCollectionTarget: Math.ceil((dueThisMonth * 1.02) / 5000) * 5000,
    },
    reads: {},
    counters: { contract: (contractCounters[year] ?? 0) + 40, receipt: receiptCounters[year] ?? 0 },
  };
}
