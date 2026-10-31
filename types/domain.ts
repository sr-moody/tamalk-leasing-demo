/** نموذج البيانات — SPEC §6. التواريخ بصيغة ISO `YYYY-MM-DD` أو ISO كامل للأحداث. المبالغ بالريال (رقمان عشريان). */

export type Role = "admin" | "sales" | "accountant" | "procurement" | "customer";
export type StaffRole = Exclude<Role, "customer">;
export type AccountReviewStatus = "pending" | "approved" | "rejected";

export type VehicleStatus =
  | "in_purchase"
  | "preparing"
  | "available"
  | "reserved"
  | "contracted"
  | "returned"
  | "sold";

export type ContractStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "active"
  | "overdue"
  | "paid_off"
  | "owned"
  | "terminated";

export type InstallmentStatus = "upcoming" | "due" | "partial" | "paid" | "overdue";

export type ExpenseType = "maintenance" | "insurance" | "registration" | "preparation" | "other";

export interface VehicleExpense {
  id: string;
  type: ExpenseType;
  amount: number;
  date: string;
  note?: string;
  createdBy: string;
}

export interface VehicleStatusEvent {
  status: VehicleStatus;
  at: string;
  by: string;
  note?: string;
}

export interface Vehicle {
  id: string;
  plateAr: string;
  plateEn: string;
  make: string;
  model: string;
  year: number;
  color: string;
  colorHex: string;
  vin: string;
  mileage: number;
  images: string[];
  purchaseDate: string;
  purchasePrice: number;
  /** سعر البيع المقترح للتمويل */
  listPrice: number;
  status: VehicleStatus;
  expenses: VehicleExpense[];
  statusHistory: VehicleStatusEvent[];
  /** تحتاج فحص بعد الاسترداد */
  needsInspection?: boolean;
}

export type DocumentType = "national_id" | "license" | "salary_certificate" | "bank_statement";

export interface CustomerDocument {
  id: string;
  type: DocumentType;
  number?: string;
  issuedAt?: string;
  expiresAt?: string;
  uploadedAt: string;
}

export type CommChannel = "call" | "whatsapp" | "visit" | "sms" | "note";

export interface CollectionNote {
  id: string;
  at: string;
  by: string;
  channel: CommChannel;
  text: string;
  nextFollowUp?: string;
  contractId?: string;
}

export interface Customer {
  id: string;
  fullName: string;
  nationalId: string;
  idType: "citizen" | "resident";
  phone: string;
  email?: string;
  /** Customer portal access; omitted legacy records remain enabled. */
  portalEnabled?: boolean;
  reviewStatus?: AccountReviewStatus;
  city: string;
  employer?: string;
  monthlyIncome?: number;
  riskLevel: "low" | "medium" | "high";
  documents: CustomerDocument[];
  communications: CollectionNote[];
  createdAt: string;
}

export interface Installment {
  id: string;
  seq: number;
  dueDate: string;
  amount: number;
  paidAmount: number;
  status: InstallmentStatus;
}

export type PaymentType = "down" | "installment" | "settlement" | "contract_fee";
export type PaymentMethod = "cash" | "bank_transfer" | "mada" | "sadad";

export interface PaymentAllocation {
  installmentId: string;
  amount: number;
}

export interface Payment {
  id: string;
  receiptNo: string;
  contractId: string;
  type: PaymentType;
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string;
  createdBy: string;
  allocations: PaymentAllocation[];
  reversed?: { at: string; by: string; reason: string };
}

export interface Handover {
  at: string;
  by: string;
  mileage: number;
  fuelLevel: number;
  notes?: string;
  photos: string[];
}

export interface Contract {
  id: string;
  number: string;
  customerId: string;
  vehicleId: string;
  vehiclePrice: number;
  downPayment: number;
  upfrontFee?: number;
  months: number;
  installmentAmount: number;
  vatRate: number;
  firstDueDate: string;
  endDate: string;
  dueDay: number;
  status: ContractStatus;
  createdAt: string;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  ownedAt?: string;
  terminatedAt?: string;
  termsSnapshot: string;
  installments: Installment[];
  payments: Payment[];
  handover?: Handover;
  returnRecord?: Handover;
}

export type AlertRule =
  | "INSTALLMENT_DUE_SOON"
  | "INSTALLMENT_DUE_TODAY"
  | "INSTALLMENT_OVERDUE"
  | "CONTRACT_ENDING_SOON"
  | "DOCUMENT_EXPIRING"
  | "CONTRACT_PENDING_APPROVAL"
  | "VEHICLE_READY";

export type Severity = "info" | "warning" | "critical";

export interface AppNotification {
  id: string;
  rule: AlertRule;
  audience: Role[];
  customerId?: string;
  contractId?: string;
  title: string;
  body: string;
  link: string;
  /** رابط للعميل داخل بوابته */
  portalLink?: string;
  /** نص ودود يظهر للعميل */
  customerTitle?: string;
  customerBody?: string;
  severity: Severity;
  createdAt: string;
  readBy: string[];
}

export interface AlertRuleSetting {
  enabled: boolean;
  days: number;
}

export type AlertSettings = Record<AlertRule, AlertRuleSetting>;

export interface User {
  id: string;
  name: string;
  email: string;
  role: StaffRole;
  active: boolean;
  reviewStatus?: AccountReviewStatus;
  phone: string;
  lastLoginAt?: string;
}

export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  actorName?: string;
  actorRole?: Role;
  action: string;
  entity: "contract" | "payment" | "vehicle" | "customer" | "settings" | "user" | "notification";
  entityId: string;
  severity?: Severity;
  details?: string;
}

export interface CompanySettings {
  name: string;
  legalName: string;
  crNumber: string;
  vatNumber: string;
  address: string;
  phone: string;
  email: string;
}

export interface Settings {
  company: CompanySettings;
  alerts: AlertSettings;
  vatRate: number;
  contractTemplate: string;
  monthlyCollectionTarget: number;
}

export interface Database {
  version: number;
  seededFor: string;
  vehicles: Vehicle[];
  customers: Customer[];
  contracts: Contract[];
  users: User[];
  audit: AuditEntry[];
  settings: Settings;
  /** معرّفات الإشعارات المقروءة لكل مستخدم */
  reads: Record<string, string[]>;
  counters: { contract: number; receipt: number };
}
