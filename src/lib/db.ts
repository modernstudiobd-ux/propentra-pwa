import Dexie, { type Table } from 'dexie';
import type { Building, Flat, Resident, Bill, Receipt, Payment, CompanySettings } from '@/types';

export class BuildingBillDB extends Dexie {
  buildings!: Table<Building, number>;
  flats!: Table<Flat, number>;
  residents!: Table<Resident, number>;
  bills!: Table<Bill, number>;
  receipts!: Table<Receipt, number>;
  payments!: Table<Payment, number>;
  settings!: Table<CompanySettings, number>;

  constructor() {
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

    // v2: "Tenants" renamed to "Residents" (with Tenant/Owner type). Existing
    // local data is migrated automatically — nothing is lost on update.
    this.version(2)
      .stores({
        buildings: '++id, name',
        flats: '++id, buildingId, unitNo, status',
        tenants: null, // drop old store
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
              name: t.name,
              mobile: t.mobile,
              email: t.email,
              flatId: t.flatId,
              buildingId: t.buildingId,
              unitLabel: t.unitLabel,
              type: 'Tenant',
            }))
          );
        }
        await tx.table('bills').toCollection().modify((b: any) => {
          b.residentId = b.tenantId;
          delete b.tenantId;
        });
        await tx.table('receipts').toCollection().modify((r: any) => {
          r.residentId = r.tenantId;
          delete r.tenantId;
        });
        await tx.table('payments').toCollection().modify((p: any) => {
          p.residentId = p.tenantId;
          delete p.tenantId;
        });
      });
  }
}

export const db = new BuildingBillDB();

// If another tab has an older version of this database open, IndexedDB
// blocks the upgrade indefinitely with no error and no timeout - the app
// just hangs on the loading screen forever. These handlers make that
// recoverable: the tab holding the old connection closes it and reloads,
// which lets the upgrade in the other tab proceed.
db.on('blocked', () => {
  console.warn('BuildingBill: database upgrade blocked by another open tab.');
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
    companyName: '',
    address: '',
    phone: '',
    email: '',
    taxId: '',
    defaultTaxRate: 0,
    bankDetails: '',
    invoiceNotes: 'Please make payment by the due date. Thank you for your cooperation.',
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
