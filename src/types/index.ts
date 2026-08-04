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

export interface Resident {
  id?: number;
  name: string;
  mobile: string;
  email: string;
  flatId: number;
  buildingId: number;
  unitLabel: string; // denormalized e.g. "A-3"
  type: ResidentType;
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
}

export interface Payment {
  id?: number;
  date: string;
  invoiceId: number;
  residentId: number;
  buildingId: number;
  flatId: number;
  method: string; // configurable in Settings (custom payment methods supported)
  amount: number;
  type: 'Full' | 'Partial';
}

export interface CompanySettings {
  id?: number;
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
  currencySymbol?: string; // e.g. '$', '€', '৳' - shown on every amount
  currencyName?: string; // e.g. 'Dollars', 'Euros', 'Taka' - used in "amount in words"
  countryCode?: string; // e.g. '1', '44', '880' - dialing code used to build WhatsApp links
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
