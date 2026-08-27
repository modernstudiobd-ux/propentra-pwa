import Dexie, { type Table } from 'dexie';
import type {
  Building, Flat, Resident, Bill, Receipt, Payment, CompanySettings,
  DepositTransaction, MaintenanceRequest, Expense, Reminder, DocumentRecord, AuditLogEntry, ImportTemplate,
  Tenancy, Ownership, Contact, EmergencyContact, Vehicle, ParkingSpace,
} from '@/types';
import { base64ToBlob } from '@/lib/fileValidation';

export class PropentraDB extends Dexie {
  buildings!: Table<Building, number>;
  flats!: Table<Flat, number>;
  residents!: Table<Resident, number>;
  bills!: Table<Bill, number>;
  receipts!: Table<Receipt, number>;
  payments!: Table<Payment, number>;
  settings!: Table<CompanySettings, number>;
  depositTransactions!: Table<DepositTransaction, number>;
  maintenanceRequests!: Table<MaintenanceRequest, number>;
  expenses!: Table<Expense, number>;
  reminders!: Table<Reminder, number>;
  documents!: Table<DocumentRecord, number>;
  auditLog!: Table<AuditLogEntry, number>;
  importTemplates!: Table<ImportTemplate, number>;
  tenancies!: Table<Tenancy, number>;
  ownerships!: Table<Ownership, number>;
  contacts!: Table<Contact, number>;
  emergencyContacts!: Table<EmergencyContact, number>;
  vehicles!: Table<Vehicle, number>;
  parkingSpaces!: Table<ParkingSpace, number>;

  constructor() {
    // The physical IndexedDB name is intentionally left as-is even after the
    // "BuildingBill" -> "Propentra" rebrand: renaming it would make Dexie
    // open a brand-new, empty database and orphan everyone's existing local
    // data. Only user-facing text changed.
    super('buildingbill-db');

    // v1: original schema (kept only so upgrade() below can read old data safely)
    this.version(1).stores({
      buildings: '++id, name',
      flats: '++id, buildingId, unitNo, status',
      tenants: '++id, name, buildingId, flatId',
      bills: '++id, invoiceNo, buildingId, flatId, tenantId, status, billingMonth',
      receipts: '++id, receiptNo, invoiceId, tenantId',
      payments: '++id, invoiceId, tenantId, date',
      settings: '++id',
    });

    // v2: "Tenants" renamed to "Residents" (with Tenant/Owner type).
    this.version(2)
      .stores({
        buildings: '++id, name',
        flats: '++id, buildingId, unitNo, status',
        tenants: null,
        residents: '++id, name, buildingId, flatId, type',
        bills: '++id, invoiceNo, buildingId, flatId, residentId, status, billingMonth',
        receipts: '++id, receiptNo, invoiceId, residentId',
        payments: '++id, invoiceId, residentId, date',
        settings: '++id',
      })
      .upgrade(async (tx) => {
        const oldTenants = await tx.table('tenants').toArray();
        if (oldTenants.length) {
          await tx.table('residents').bulkAdd(
            oldTenants.map((t: any) => ({
              name: t.name, mobile: t.mobile, email: t.email, flatId: t.flatId,
              buildingId: t.buildingId, unitLabel: t.unitLabel, type: 'Tenant',
            }))
          );
        }
        await tx.table('bills').toCollection().modify((b: any) => { b.residentId = b.tenantId; delete b.tenantId; });
        await tx.table('receipts').toCollection().modify((r: any) => { r.residentId = r.tenantId; delete r.tenantId; });
        await tx.table('payments').toCollection().modify((p: any) => { p.residentId = p.tenantId; delete p.tenantId; });
      });

    // v3: adds deposit ledger, maintenance, expenses, reminders, documents;
    // indexes resident status/voided flags; backfills existing records with
    // safe defaults so nothing already saved is lost or left inconsistent.
    this.version(3)
      .stores({
        buildings: '++id, name',
        flats: '++id, buildingId, unitNo, status',
        residents: '++id, name, buildingId, flatId, type, status',
        bills: '++id, invoiceNo, buildingId, flatId, residentId, status, billingMonth',
        receipts: '++id, receiptNo, invoiceId, residentId, voided',
        payments: '++id, invoiceId, residentId, date, voided',
        settings: '++id',
        depositTransactions: '++id, residentId, buildingId, flatId, type, date',
        maintenanceRequests: '++id, buildingId, flatId, status, priority, reportedDate',
        expenses: '++id, buildingId, flatId, category, date',
        reminders: '++id, dueDate, status, priority, linkType, linkId',
        documents: '++id, linkType, linkId, buildingId, category, expiryDate',
      })
      .upgrade(async (tx) => {
        await tx.table('residents').toCollection().modify((r: any) => {
          if (!r.status) r.status = 'current';
          if (r.isBillingContact === undefined) r.isBillingContact = true;
        });
        await tx.table('payments').toCollection().modify((p: any) => {
          if (p.voided === undefined) p.voided = false;
        });
        await tx.table('receipts').toCollection().modify((r: any) => {
          if (r.voided === undefined) r.voided = false;
        });
      });

    // v4: adds the audit log; migrates resident ID document photos from
    // base64 strings to native Blobs (smaller, faster, consistent with how
    // the Documents module already stores files).
    this.version(4)
      .stores({
        buildings: '++id, name',
        flats: '++id, buildingId, unitNo, status',
        residents: '++id, name, buildingId, flatId, type, status',
        bills: '++id, invoiceNo, buildingId, flatId, residentId, status, billingMonth',
        receipts: '++id, receiptNo, invoiceId, residentId, voided',
        payments: '++id, invoiceId, residentId, date, voided',
        settings: '++id',
        depositTransactions: '++id, residentId, buildingId, flatId, type, date',
        maintenanceRequests: '++id, buildingId, flatId, status, priority, reportedDate',
        expenses: '++id, buildingId, flatId, category, date',
        reminders: '++id, dueDate, status, priority, linkType, linkId',
        documents: '++id, linkType, linkId, buildingId, category, expiryDate',
        auditLog: '++id, entityType, entityId, action, timestamp, residentId',
      })
      .upgrade(async (tx) => {
        await tx.table('residents').toCollection().modify((r: any) => {
          if (typeof r.idDocumentImage === 'string' && r.idDocumentImage.startsWith('data:')) {
            try {
              r.idDocumentBlob = base64ToBlob(r.idDocumentImage);
              r.idDocumentFileType = r.idDocumentBlob.type;
            } catch {
              // leave the legacy base64 field alone if it fails to parse - nothing lost
            }
            delete r.idDocumentImage;
          }
        });
      });

    // v5: adds saved column-mapping templates for the Import Wizard. Purely
    // additive - every existing table/index is repeated unchanged, so this
    // upgrade never touches existing data.
    this.version(5).stores({
      buildings: '++id, name',
      flats: '++id, buildingId, unitNo, status',
      residents: '++id, name, buildingId, flatId, type, status',
      bills: '++id, invoiceNo, buildingId, flatId, residentId, status, billingMonth',
      receipts: '++id, receiptNo, invoiceId, residentId, voided',
      payments: '++id, invoiceId, residentId, date, voided',
      settings: '++id',
      depositTransactions: '++id, residentId, buildingId, flatId, type, date',
      maintenanceRequests: '++id, buildingId, flatId, status, priority, reportedDate',
      expenses: '++id, buildingId, flatId, category, date',
      reminders: '++id, dueDate, status, priority, linkType, linkId',
      documents: '++id, linkType, linkId, buildingId, category, expiryDate',
      auditLog: '++id, entityType, entityId, action, timestamp, residentId',
      importTemplates: '++id, entity',
    });

    // v6: adds Tenancy, Ownership, Contact, EmergencyContact, Vehicle, and
    // ParkingSpace tables; restructures Flat.status -> occupancyStatus (+ new
    // lifecycleStatus) and backfills denormalized Document resident/flat ids.
    // Every other field added this version (structured address, resident
    // name parts, payment reference, etc.) is a plain optional column and
    // needs no migration - Dexie/IndexedDB records don't need a column to
    // exist until something writes to it.
    this.version(6)
      .stores({
        buildings: '++id, name',
        flats: '++id, buildingId, unitNo, occupancyStatus, lifecycleStatus',
        residents: '++id, name, buildingId, flatId, type, status',
        bills: '++id, invoiceNo, buildingId, flatId, residentId, status, billingMonth',
        receipts: '++id, receiptNo, invoiceId, residentId, voided',
        payments: '++id, invoiceId, residentId, date, voided, tenancyId',
        settings: '++id',
        depositTransactions: '++id, residentId, buildingId, flatId, type, date',
        maintenanceRequests: '++id, buildingId, flatId, status, priority, reportedDate',
        expenses: '++id, buildingId, flatId, category, date',
        reminders: '++id, dueDate, status, priority, linkType, linkId',
        documents: '++id, linkType, linkId, buildingId, flatId, residentId, category, expiryDate',
        auditLog: '++id, entityType, entityId, action, timestamp, residentId',
        importTemplates: '++id, entity',
        tenancies: '++id, residentId, flatId, buildingId, occupancyStatus, leaseEnd',
        ownerships: '++id, residentId, flatId, buildingId, status',
        contacts: '++id, residentId, type',
        emergencyContacts: '++id, residentId, isPrimary',
        vehicles: '++id, residentId, flatId, buildingId, plate, status',
        parkingSpaces: '++id, buildingId, flatId, residentId, status',
      })
      .upgrade(async (tx) => {
        const nowIso = new Date().toISOString();

        await tx.table('buildings').toCollection().modify((b: any) => {
          if (!b.status) b.status = 'active';
          if (b.createdAt === undefined) b.createdAt = nowIso;
          if (b.updatedAt === undefined) b.updatedAt = nowIso;
        });

        await tx.table('flats').toCollection().modify((f: any) => {
          f.occupancyStatus = f.status === 'occupied' ? 'occupied' : 'vacant';
          delete f.status;
          if (!f.lifecycleStatus) f.lifecycleStatus = 'active';
        });

        // Best-effort split of the existing single `name` field into
        // firstName/lastName - `name` itself is left completely untouched,
        // so nothing that already reads it is affected. Purely additive.
        await tx.table('residents').toCollection().modify((r: any) => {
          if (!r.firstName && !r.lastName && typeof r.name === 'string' && r.name.trim()) {
            const parts = r.name.trim().split(/\s+/);
            r.firstName = parts[0];
            r.lastName = parts.length > 1 ? parts.slice(1).join(' ') : '';
          }
        });

        await tx.table('documents').toCollection().modify((d: any) => {
          if (d.linkType === 'resident' && d.linkId) d.residentId = d.linkId;
          if (d.linkType === 'flat' && d.linkId) d.flatId = d.linkId;
        });
      });
  }
}

export const db = new PropentraDB();

// If another tab has an older version of this database open, IndexedDB
// blocks the upgrade indefinitely with no error and no timeout - the app
// just hangs on the loading screen forever. These handlers make that
// recoverable: the tab holding the old connection closes it and reloads,
// which lets the upgrade in the other tab proceed.
db.on('blocked', () => {
  console.warn('Propentra: database upgrade blocked by another open tab.');
});
db.on('versionchange', () => {
  db.close();
  window.location.reload();
});

// No demo/seed data at all. The only thing ensured on first run is a single
// (empty) settings row, since Bill Generator reads default rates from it —
// everything else (buildings, flats, residents, invoices...) is created by
// the user for real.
export async function seedIfEmpty() {
  const settingsCount = await db.settings.count();
  if (settingsCount > 0) return;

  await db.settings.add({
    onboardingComplete: false,
    companyName: '',
    address: '',
    phone: '',
    email: '',
    taxId: '',
    defaultTaxRate: 0,
    bankDetails: '',
    invoiceNotes: 'Please make payment by the due date. Thank you for your cooperation.',
    currencySymbol: '$',
    currencyName: 'US Dollars',
    countryCode: '',
    paymentMethods: ['Cash', 'Bank Transfer', 'Card'],
    defaultRates: {
      electricityRate: 0,
      waterCharge: 0,
      gasCharge: 0,
      liftCharge: 0,
      securityCharge: 0,
      cleaningCharge: 0,
      internetCharge: 0,
    },
  });
}
