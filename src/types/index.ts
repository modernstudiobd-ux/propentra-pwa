export interface Building {
  id?: number;
  name: string;
  address: string;
  totalFlats: number;
}

export interface Flat {
  id?: number;
  buildingId: number;
  unitNo: string; // e.g. A-3
  floor?: string;
  status: 'occupied' | 'vacant';
}

export type ResidentType = 'Tenant' | 'Owner';
export type ResidentStatus = 'current' | 'former';

export interface Resident {
  id?: number;
  name: string;
  mobile: string;
  email: string;
  flatId: number;
  buildingId: number;
  unitLabel: string; // denormalized e.g. "A-3"
  type: ResidentType;
  status: ResidentStatus;
  moveInDate?: string; // ISO date
  moveOutDate?: string; // ISO date - only set once status is 'former'
  isBillingContact: boolean; // who bills default to when a flat has multiple current residents
  // ID / compliance record - many jurisdictions require landlords to keep a
  // copy of tenant identification on file. Stored locally only, same as
  // everything else in this app - nothing leaves the device.
  idType?: string; // free text so it works for any country's ID system (Passport, National ID, Driver's License...)
  idNumber?: string;
  idIssueDate?: string; // ISO date
  idExpiryDate?: string; // ISO date - feeds Dashboard "expiring soon" alerts
  idDocumentImage?: string; // base64 scan/photo of the ID
}

export interface ChargeLine {
  label: string;
  amount: number;
}

export interface Bill {
  id?: number;
  invoiceNo: string;
  buildingId: number;
  flatId: number;
  residentId: number;
  billingMonth: string; // e.g. "July 2026"
  issueDate: string; // ISO
  dueDate: string; // ISO
  electricityUnits: { previous: number; current: number; rate: number };
  charges: ChargeLine[]; // fully user-editable: water, gas, lift, security, cleaning, internet, custom...
  previousBalance: number;
  discount: number;
  taxRate: number; // % VAT/tax applied to (line items - discount)
  taxAmount: number;
  penalty: number;
  subtotal: number;
  totalAmount: number;
  status: 'unpaid' | 'partial' | 'paid';
  paidAmount: number;
}

export interface Receipt {
  id?: number;
  receiptNo: string;
  invoiceId: number;
  residentId: number;
  buildingId: number;
  flatId: number;
  date: string; // ISO
  amountReceived: number;
  previousBalance: number;
  totalPayable: number;
  remainingBalance: number;
  method: string; // configurable in Settings (custom payment methods supported)
  receivedBy: string;
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
}

export interface Payment {
  id?: number;
  date: string;
  invoiceId: number;
  receiptId?: number; // links back to the Receipt created alongside this payment
  residentId: number;
  buildingId: number;
  flatId: number;
  method: string; // configurable in Settings (custom payment methods supported)
  amount: number;
  type: 'Full' | 'Partial';
  // Payments are never hard-deleted - they're voided, preserving the audit
  // trail. "Remove" in the UI now means "void and reverse", not delete.
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
}

// --- Deposits / advance payments -------------------------------------------

export type DepositTransactionType = 'collected' | 'applied' | 'refunded' | 'adjustment';

export interface DepositTransaction {
  id?: number;
  residentId: number;
  buildingId: number;
  flatId: number;
  type: DepositTransactionType;
  // Sign convention: 'collected' and positive 'adjustment' are positive
  // (increase balance held); 'applied' and 'refunded' are stored as
  // positive amounts too, but always REDUCE the balance - see lib/deposits.ts.
  amount: number;
  date: string; // ISO
  invoiceId?: number; // set when type === 'applied'
  notes?: string;
  voided?: boolean;
  voidedAt?: string;
}

// --- Maintenance -------------------------------------------------------------

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface MaintenanceRequest {
  id?: number;
  buildingId: number;
  flatId?: number; // optional - building-wide issues (e.g. roof, lobby) have no flat
  title: string;
  description?: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  vendorName?: string;
  vendorContact?: string;
  cost?: number;
  reportedDate: string; // ISO
  completedDate?: string;
  notes?: string;
}

// --- Expenses ------------------------------------------------------------

export const EXPENSE_CATEGORIES = [
  'Utilities', 'Repairs & Maintenance', 'Staff & Wages', 'Insurance',
  'Property Tax', 'Cleaning', 'Security', 'Legal & Professional', 'Other',
] as const;

export interface Expense {
  id?: number;
  buildingId: number;
  flatId?: number;
  category: string;
  amount: number;
  vendor?: string;
  date: string; // ISO
  notes?: string;
  receiptImage?: string; // base64
}

// --- Reminders -------------------------------------------------------------

export type ReminderPriority = 'low' | 'medium' | 'high';
export type ReminderStatus = 'pending' | 'done' | 'dismissed';
export type ReminderLinkType = 'building' | 'flat' | 'resident' | 'none';

export interface Reminder {
  id?: number;
  title: string;
  notes?: string;
  dueDate: string; // ISO
  priority: ReminderPriority;
  status: ReminderStatus;
  linkType: ReminderLinkType;
  linkId?: number;
  buildingId?: number;
}

// --- Documents -------------------------------------------------------------

export const DOCUMENT_CATEGORIES = [
  'Lease Agreement', 'ID Document', 'Insurance', 'Inspection Report', 'Warranty', 'Legal', 'Other',
] as const;

export interface DocumentRecord {
  id?: number;
  title: string;
  category: string;
  linkType: 'building' | 'flat' | 'resident' | 'none';
  linkId?: number;
  buildingId?: number;
  fileData: string; // base64
  fileName: string;
  fileType: string; // mime type
  fileSize: number; // bytes
  uploadDate: string; // ISO
  expiryDate?: string; // ISO, optional
  notes?: string;
}

export interface CompanySettings {
  id?: number;
  onboardingComplete?: boolean;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  logo?: string; // base64
  signatureImage?: string; // base64 - uploaded or drawn authorized signature
  taxId?: string; // VAT/TIN/BIN registration number, shown on invoices if set
  defaultTaxRate?: number; // % VAT/tax applied to bills by default
  bankDetails?: string; // payment instructions (bank/mobile banking) shown on invoices
  invoiceNotes?: string; // footer terms/notes shown on invoices
  currencySymbol?: string; // e.g. '$', '€', '£' - shown on every amount
  currencyName?: string; // e.g. 'US Dollars', 'Euros', 'Pounds' - used in "amount in words"
  countryCode?: string; // e.g. '1', '44', '91' - dialing code used to build WhatsApp links
  paymentMethods?: string[]; // configurable list shown in every payment-method dropdown
  defaultRates: {
    electricityRate: number;
    waterCharge: number;
    gasCharge: number;
    liftCharge: number;
    securityCharge: number;
    cleaningCharge: number;
    internetCharge: number;
  };
}
