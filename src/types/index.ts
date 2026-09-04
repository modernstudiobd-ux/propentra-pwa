// --- Address (shared shape for Building + Resident mailing address) --------

export interface StructuredAddress {
  line1?: string;
  line2?: string;
  locality?: string; // city/town
  adminArea?: string; // state/province/region
  postalCode?: string;
  countryCode?: string; // ISO 3166-1 alpha-2, e.g. 'US', 'BD', 'GB'
}

export const PROPERTY_TYPES = ['Apartment Building', 'Condominium', 'Townhouse Complex', 'Single-Family', 'Mixed-Use', 'Other'] as const;
export const BUILDING_STATUSES = ['active', 'inactive', 'under_construction'] as const;

export interface Building {
  id?: number;
  name: string;
  address: string; // free-text address kept as the single source shown throughout the app (invoices, lists, search)
  addressLine2?: string;
  locality?: string; // city/town - recommended for new buildings, optional for backward compatibility with existing records
  adminArea?: string; // state/province/region
  postalCode?: string;
  countryCode?: string; // ISO 3166-1 alpha-2
  propertyType?: string;
  status?: string; // 'active' | 'inactive' | 'under_construction' - lifecycle status, defaults to 'active'
  totalFlats: number;
  createdAt?: string; // ISO datetime
  updatedAt?: string; // ISO datetime
  externalId?: string; // source record ID from an imported file (e.g. "BLDG-0001") - lets later sheets in the same workbook reference this record by ID instead of name
  displayId?: string; // human-readable record ID shown throughout the UI (e.g. "BLDG-0001") - auto-generated, or copied from externalId when this record came from an import
}

export const UNIT_TYPES = ['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4+ Bedroom', 'Commercial', 'Other'] as const;
export type FlatOccupancyStatus = 'occupied' | 'vacant';
export const FLAT_LIFECYCLE_STATUSES = ['active', 'under_renovation', 'inactive'] as const;

export interface Flat {
  id?: number;
  buildingId: number;
  unitNo: string; // e.g. A-3
  floor?: string;
  occupancyStatus: FlatOccupancyStatus; // whether someone currently lives there (was "status" prior to the Tenancy/Ownership migration)
  lifecycleStatus?: string; // 'active' | 'under_renovation' | 'inactive' - whether the unit itself is in service, independent of occupancy
  unitType?: string;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  standardRent?: number; // list/asking rent - used to auto-fill a new Tenancy's monthly rent
  currency?: string; // ISO 4217 code, e.g. 'USD' - falls back to company currency when unset
  parkingIncluded?: boolean;
  storageIncluded?: boolean;
  externalId?: string; // source record ID from an imported file (e.g. "UNIT-0001")
  displayId?: string; // human-readable record ID shown throughout the UI (e.g. "UNIT-0001")
}

export type ResidentType = 'Tenant' | 'Owner';
export type ResidentStatus = 'current' | 'former';
export const PREFERRED_CONTACT_METHODS = ['Mobile', 'Email', 'WhatsApp', 'Mail'] as const;
export const CONSENT_STATUSES = ['granted', 'declined', 'not_asked'] as const;

export interface Resident {
  id?: number;
  name: string; // full display name - source of truth for every existing screen (search, invoices, WhatsApp, receipts). Kept in sync with firstName/lastName by the Residents form when those are used.
  // Structured name - optional so existing records (and every screen that
  // only ever dealt with a single `name` field) keep working unchanged;
  // filling these in the Resident form keeps `name` in sync automatically.
  firstName?: string;
  lastName?: string;
  middleName?: string;
  preferredName?: string;
  companyName?: string; // for corporate tenants/owners
  mobile: string;
  altPhone?: string;
  email: string;
  preferredContactMethod?: string;
  dob?: string; // ISO date
  nationality?: string;
  language?: string; // preferred language for correspondence
  accessibilityNotes?: string;
  flatId: number;
  buildingId: number;
  unitLabel: string; // denormalized e.g. "A-3"
  /** @deprecated Kept for backward compatibility (older records, badge display, bulk-add convenience) - no longer the source of truth for whether this person is a resident and/or an owner. Use `isResident`/`isOwner` (and lib/roles.ts helpers, which fall back to this field for any record that predates it) instead. Ownership does NOT imply residency and vice versa - a person can be a Resident, an Owner, or both at once, independently. */
  type: ResidentType;
  // Independent role flags - a person can be a Resident, an Owner, or both.
  // Optional so every pre-existing record (which only ever had `type`)
  // keeps working unchanged - see lib/roles.ts for the fallback derivation
  // (`isResident ?? type !== 'Owner'`, `isOwner ?? type === 'Owner'`) used
  // everywhere these should be read, rather than reading the fields directly.
  isResident?: boolean;
  isOwner?: boolean;
  status: ResidentStatus;
  moveInDate?: string; // ISO date
  moveOutDate?: string; // ISO date - only set once status is 'former'
  isBillingContact: boolean; // who bills default to when a flat has multiple current residents
  mailingAddress?: StructuredAddress; // only needed when different from the flat itself (e.g. a former resident, an absentee owner)
  // Tax / legal identity - separate from the government ID block below,
  // used for owner statements and any tax-related correspondence.
  taxLegalName?: string;
  taxIdType?: string;
  taxIdLast4?: string; // only the last 4 digits are ever stored - never the full tax ID
  consentStatus?: string; // 'granted' | 'declined' | 'not_asked' - general data-handling consent
  marketingConsent?: boolean;
  dataProcessingConsent?: boolean;
  jurisdiction?: string; // governing legal jurisdiction for this resident's lease/ownership, e.g. a US state or country
  // ID / compliance record - many jurisdictions require landlords to keep a
  // copy of tenant identification on file. Stored locally only, same as
  // everything else in this app - nothing leaves the device.
  idType?: string; // free text so it works for any country's ID system (Passport, National ID, Driver's License...)
  idNumber?: string;
  idIssueDate?: string; // ISO date
  idExpiryDate?: string; // ISO date - feeds Dashboard "expiring soon" alerts
  /** @deprecated base64 scan/photo of the ID - replaced by idDocumentBlob (v4). Kept optional only so old records/backups migrate cleanly. */
  idDocumentImage?: string;
  idDocumentBlob?: Blob; // scan/photo of the ID, stored as a native Blob (smaller, faster, no base64 bloat)
  idDocumentFileType?: string; // mime type of idDocumentBlob
  // Archiving hides a resident from the everyday list without deleting them
  // (unlike status='former', which reflects a real-world move-out, archiving
  // is purely a "get this out of my way but keep it recoverable" action -
  // e.g. cleaning up years-old former residents).
  archived?: boolean;
  archivedAt?: string;
  externalId?: string; // source record ID from an imported file (e.g. "P-00001")
  displayId?: string; // human-readable record ID shown throughout the UI (e.g. "P-00001")
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
  voided?: boolean;
  voidedAt?: string;
  voidReason?: string;
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
  displayId?: string; // human-readable record ID (e.g. "PAY-00001")
  date: string;
  invoiceId: number;
  receiptId?: number; // links back to the Receipt created alongside this payment
  residentId: number;
  buildingId: number;
  flatId: number;
  method: string; // configurable in Settings (custom payment methods supported)
  amount: number;
  type: 'Full' | 'Partial';
  reference?: string; // external reference - cheque no., bank transaction ID, gateway reference...
  amountDueAtPayment?: number; // snapshot of the invoice balance at the moment this payment was recorded, for audit clarity
  tenancyId?: number; // links to the active Tenancy this payment applies toward, when known
  currency?: string; // ISO 4217 code - falls back to company currency when unset
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
  displayId?: string; // human-readable record ID (e.g. "DEP-00001")
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
  voidReason?: string;
}

// --- Maintenance -------------------------------------------------------------

export type MaintenancePriority = 'low' | 'medium' | 'high' | 'urgent';
export type MaintenanceStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export interface MaintenanceRequest {
  id?: number;
  displayId?: string; // human-readable record ID (e.g. "MAINT-00001")
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
  displayId?: string; // human-readable record ID (e.g. "EXP-00001")
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
  displayId?: string; // human-readable record ID (e.g. "REM-00001")
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
  displayId?: string; // human-readable record ID (e.g. "DOC-00001")
  title: string;
  category: string;
  linkType: 'building' | 'flat' | 'resident' | 'none';
  linkId?: number;
  // Denormalized foreign keys mirroring linkType/linkId, in the same spirit
  // as the pre-existing buildingId field below - kept for fast, direct
  // querying (e.g. "all documents for this resident") without having to
  // filter every document by linkType first. Always kept in sync with
  // linkType/linkId by the Documents page.
  residentId?: number;
  flatId?: number;
  buildingId?: number;
  fileData: Blob; // stored as a native Blob (efficient in IndexedDB) - converted to base64 only at backup/restore time for JSON compatibility
  fileName: string;
  fileType: string; // mime type
  fileSize: number; // bytes
  uploadDate: string; // ISO
  expiryDate?: string; // ISO, optional
  notes?: string;
  documentStatus?: string; // 'active' | 'archived' | 'superseded'
  verificationStatus?: string; // 'unverified' | 'verified' | 'rejected' - for compliance-sensitive documents (ID, lease, insurance)
}

// --- Audit Log ---------------------------------------------------------------
// Append-only trail of every sensitive/financial action taken in the app.
// Records are never edited or deleted through the UI - only ever added.

export type AuditAction =
  | 'payment_recorded' | 'payment_voided' | 'payment_deleted'
  | 'deposit_collected' | 'deposit_applied' | 'deposit_refunded' | 'deposit_adjusted'
  | 'deposit_voided' | 'deposit_deleted'
  | 'bill_voided' | 'bill_deleted'
  | 'resident_created' | 'resident_updated' | 'resident_deleted' | 'resident_archived' | 'resident_unarchived'
  | 'document_uploaded' | 'document_deleted'
  | 'backup_created' | 'restore_performed'
  | 'data_imported'
  | 'tenancy_created' | 'tenancy_updated' | 'tenancy_deleted'
  | 'ownership_created' | 'ownership_updated' | 'ownership_deleted';

export interface AuditLogEntry {
  id?: number;
  timestamp: string; // ISO datetime
  action: AuditAction;
  entityType: 'payment' | 'receipt' | 'bill' | 'deposit' | 'resident' | 'document' | 'backup' | 'building' | 'flat' | 'expense' | 'tenancy' | 'ownership';
  entityId?: number; // id of the affected record, when applicable
  buildingId?: number;
  flatId?: number;
  residentId?: number;
  summary: string; // short human-readable description, e.g. "Voided payment of $150.00"
  details?: string; // optional extra context (reason, field changes, counts...)
  amount?: number; // financial amount involved, when applicable
  performedBy: string; // no auth system yet, so this is always 'Local User' - kept as a field so it's ready if multi-user login is added later
}

// --- Tenancy (lease terms) ---------------------------------------------

export const LEASE_TYPES = ['Fixed Term', 'Month-to-Month', 'Short-Term'] as const;
export const PAYMENT_FREQUENCIES = ['Weekly', 'Monthly', 'Quarterly', 'Annually'] as const;
export const TENANCY_OCCUPANCY_STATUSES = ['upcoming', 'active', 'ended'] as const;

export interface Tenancy {
  id?: number;
  displayId?: string; // human-readable record ID (e.g. "TEN-00001")
  residentId: number;
  flatId: number;
  buildingId: number;
  leaseType: string; // 'Fixed Term' | 'Month-to-Month' | 'Short-Term'
  leaseStart: string; // ISO date
  leaseEnd?: string; // ISO date - unset for month-to-month
  moveIn: string; // ISO date
  moveOut?: string; // ISO date
  monthlyRent: number;
  currency: string; // ISO 4217 code
  deposit: number;
  paymentFrequency: string; // 'Weekly' | 'Monthly' | 'Quarterly' | 'Annually'
  occupancyStatus: string; // 'upcoming' | 'active' | 'ended'
  notes?: string;
}

// --- Ownership -----------------------------------------------------------

export const OWNERSHIP_TYPES = ['Sole', 'Joint', 'Corporate', 'Trust'] as const;
export const OWNERSHIP_STATUSES = ['active', 'former'] as const;

export interface Ownership {
  id?: number;
  displayId?: string; // human-readable record ID (e.g. "OWN-00001")
  residentId: number;
  flatId: number;
  buildingId: number;
  status: string; // 'active' | 'former'
  ownershipPct: number; // 0-100 - the sum of all active owners' % for one flat should never exceed 100 (validated in lib/ownership.ts)
  purchaseDate: string; // ISO date
  ownershipType: string; // 'Sole' | 'Joint' | 'Corporate' | 'Trust'
  notes?: string;
}

// --- Contact (general secondary contacts, distinct from Emergency) -------

export const CONTACT_TYPES = ['Personal', 'Business', 'Guarantor', 'Agent', 'Other'] as const;

export interface Contact {
  id?: number;
  displayId?: string; // human-readable record ID (e.g. "CONT-00001")
  residentId: number;
  type: string; // 'Personal' | 'Business' | 'Guarantor' | 'Agent' | 'Other'
  name: string;
  email?: string;
  phone?: string;
  relationship?: string;
  preferred: boolean; // preferred contact among this resident's Contact records
}

// --- Emergency Contact -----------------------------------------------------

export interface EmergencyContact {
  id?: number;
  displayId?: string; // human-readable record ID (e.g. "EC-00001")
  residentId: number;
  name: string;
  relationship: string;
  phone: string;
  email?: string;
  isPrimary: boolean;
}

// --- Vehicle -------------------------------------------------------------

export const VEHICLE_TYPES = ['Car', 'Motorcycle', 'Truck', 'Van', 'Bicycle', 'Other'] as const;
export const VEHICLE_STATUSES = ['active', 'inactive'] as const;

export interface Vehicle {
  id?: number;
  displayId?: string; // human-readable record ID (e.g. "VEH-00001")
  residentId: number;
  flatId: number;
  buildingId: number;
  type: string; // 'Car' | 'Motorcycle' | 'Truck' | 'Van' | 'Bicycle' | 'Other'
  make?: string;
  model?: string;
  year?: number;
  plate: string;
  state?: string; // issuing state/province for the plate
  status: string; // 'active' | 'inactive'
}

// --- Parking Space ---------------------------------------------------------

export const PARKING_TYPES = ['Covered', 'Uncovered', 'Garage', 'Street'] as const;
export const PARKING_STATUSES = ['assigned', 'vacant', 'reserved'] as const;

export interface ParkingSpace {
  id?: number;
  displayId?: string; // human-readable record ID (e.g. "PK-00001")
  buildingId: number;
  flatId?: number;
  residentId?: number;
  spaceNumber: string;
  type: string; // 'Covered' | 'Uncovered' | 'Garage' | 'Street'
  assignedDate?: string; // ISO date
  status: string; // 'assigned' | 'vacant' | 'reserved'
}

// --- Import Wizard: saved column-mapping templates -------------------------

export interface ImportTemplate {
  id?: number;
  name: string;
  entity: 'buildings' | 'flats' | 'residents' | 'expenses' | 'tenancies' | 'ownerships' | 'contacts' | 'emergencyContacts' | 'vehicles' | 'parkingSpaces';
  mapping: Record<string, string>; // target field key -> source header LABEL (not index - see lib/import/templates.ts)
  createdAt: string; // ISO datetime
}

export interface CompanySettings {
  id?: number;
  onboardingComplete?: boolean;
  nextInvoiceSeq?: number; // persistent monotonic counter - never reused, even if bills are voided/deleted
  nextReceiptSeq?: number;
  companyName: string;
  address: string;
  phone: string;
  email: string;
  logo?: string; // base64
  signatureImage?: string; // base64 - uploaded or drawn authorized signature
  taxId?: string; // VAT/TIN/BIN registration number, shown on invoices if set
  taxLabel?: string; // what to call the tax on invoices, e.g. "VAT", "GST", "Sales Tax" - defaults to "Tax"
  taxRegNumber?: string; // separate from taxId when a jurisdiction distinguishes a tax ID from a formal tax registration number
  defaultTaxRate?: number; // % VAT/tax applied to bills by default
  bankDetails?: string; // payment instructions (bank/mobile banking) shown on invoices
  invoiceNotes?: string; // footer terms/notes shown on invoices
  currencySymbol?: string; // e.g. '$', '€', '£' - shown on every amount
  currencyName?: string; // e.g. 'US Dollars', 'Euros', 'Pounds' - used in "amount in words"
  countryCode?: string; // e.g. '1', '44', '91' - dialing code used to build WhatsApp links
  dateFormat?: string; // e.g. 'MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD' - display preference, dates are always stored as ISO
  locale?: string; // BCP 47 locale tag, e.g. 'en-US', 'en-GB' - used for number/date formatting where relevant
  paymentMethods?: string[]; // configurable list shown in every payment-method dropdown
  idFormats?: Record<string, { prefix: string; digits: number }>; // per-entity display-ID prefix/padding overrides (keys are SequencedEntity from lib/idPrefixes); only affects IDs generated from now on, never rewrites existing records
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
