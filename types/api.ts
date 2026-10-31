import type {
  AppNotification,
  AuditEntry,
  CollectionNote,
  CommChannel,
  Contract,
  Customer,
  CustomerDocument,
  DocumentType,
  ExpenseType,
  Handover,
  Installment,
  Payment,
  PaymentMethod,
  Role,
  Settings,
  StaffRole,
  User,
  Vehicle,
  VehicleStatus,
} from "./domain";

/** عقد مع ملخص العميل والسيارة — شكل الاستجابة من API */
export interface CustomerRef {
  id: string;
  fullName: string;
  phone: string;
  city: string;
  riskLevel: Customer["riskLevel"];
  nationalId: string;
}

export interface VehicleRef {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  colorHex: string;
  plateAr: string;
  plateEn: string;
  images: string[];
  status: VehicleStatus;
}

export interface ContractView extends Contract {
  customer: CustomerRef;
  vehicle: VehicleRef;
}

export interface PaymentView extends Payment {
  contractNumber: string;
  customer: CustomerRef;
  vehicle: VehicleRef;
}

export interface Session {
  userId: string;
  role: Role;
  name: string;
  email?: string;
  customerId?: string;
}

export interface LoginStaffInput {
  email: string;
  password: string;
}
export interface LoginOtpInput {
  phone: string;
  otp: string;
}

export interface CreateContractInput {
  customerId: string;
  vehicleId: string;
  vehiclePrice: number;
  downPayment: number;
  months: number;
  firstDueDate: string;
  installmentOverride?: number;
}

export interface CreateCustomerInput {
  fullName: string;
  nationalId: string;
  phone: string;
  city: string;
  email?: string;
  employer?: string;
  monthlyIncome?: number;
}

export interface RecordPaymentInput {
  contractId: string;
  amount: number;
  method: PaymentMethod;
  reference?: string;
  paidAt?: string;
}

export interface ReversePaymentInput {
  contractId: string;
  paymentId: string;
  reason: string;
}

export interface HandoverInput {
  mileage: number;
  fuelLevel: number;
  notes?: string;
}

export interface AddNoteInput {
  channel: CommChannel;
  text: string;
  nextFollowUp?: string;
  contractId?: string;
}

export interface AddExpenseInput {
  type: ExpenseType;
  amount: number;
  date: string;
  note?: string;
}

export interface CreateVehicleInput {
  make: string;
  model: string;
  year: number;
  color: string;
  colorHex: string;
  plateAr: string;
  plateEn: string;
  vin: string;
  mileage: number;
  purchasePrice: number;
  listPrice: number;
  purchaseDate: string;
  body: "sedan" | "hatch" | "suv";
}

export interface UploadDocumentInput {
  type: DocumentType;
  expiresAt?: string;
}

export interface UserInput {
  name: string;
  email: string;
  role: StaffRole;
  phone: string;
  active: boolean;
}

/** بيانات البوابة — منقّاة من أي أرقام داخلية (التكلفة، الربح، الموظف) */
export interface PortalVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  color: string;
  colorHex: string;
  plateAr: string;
  plateEn: string;
  vin: string;
  mileage: number;
  images: string[];
}

export interface PortalPayment {
  id: string;
  receiptNo: string;
  type: Payment["type"];
  amount: number;
  method: PaymentMethod;
  paidAt: string;
  reference?: string;
  reversed: boolean;
  allocations: Payment["allocations"];
}

export interface PortalHandover {
  at: string;
  mileage: number;
  fuelLevel: number;
  notes?: string;
  photos: string[];
}

export interface PortalContract {
  id: string;
  number: string;
  status: Contract["status"];
  vehiclePrice: number;
  downPayment: number;
  months: number;
  installmentAmount: number;
  vatRate: number;
  firstDueDate: string;
  endDate: string;
  createdAt: string;
  approvedAt?: string;
  ownedAt?: string;
  termsSnapshot: string;
  installments: Installment[];
  payments: PortalPayment[];
  handover?: PortalHandover;
  vehicle: PortalVehicle;
}

export interface PortalData {
  customer: Omit<Customer, "communications" | "riskLevel" | "monthlyIncome">;
  contracts: PortalContract[];
  notifications: AppNotification[];
  company: Settings["company"];
}

export type { AuditEntry, CollectionNote, Customer, CustomerDocument, Handover, Settings, User, Vehicle, AppNotification };
