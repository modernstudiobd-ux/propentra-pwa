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

// Seeds ONLY the structural demo data (buildings/flats/residents) so the app
// isn't empty on first run. No invoices, receipts, or payments are seeded —
// all billing data is created for real through the Bill Generator.
export async function seedIfEmpty() {
  const count = await db.buildings.count();
  if (count > 0) return;

  const buildingIds = await db.buildings.bulkAdd(
    [
      { name: 'Green Tower', address: 'House # 45, Road # 12, Dhanmondi, Dhaka - 1209, Bangladesh', totalFlats: 12 },
      { name: 'Rose Garden', address: 'Block B, Bashundhara R/A, Dhaka', totalFlats: 12 },
    ],
    { allKeys: true }
  );
  const [greenTowerId, roseGardenId] = buildingIds as number[];

  const flatDefs = [
    { buildingId: greenTowerId, unitNo: 'A-3' },
    { buildingId: greenTowerId, unitNo: 'B-2A' },
    { buildingId: greenTowerId, unitNo: 'C-3C' },
    { buildingId: roseGardenId, unitNo: 'A-1A' },
    { buildingId: roseGardenId, unitNo: 'A-2' },
  ];
  const flatIds = await db.flats.bulkAdd(
    flatDefs.map((f) => ({ ...f, status: 'occupied' as const })),
    { allKeys: true }
  );

  const residentDefs: Array<{ name: string; mobile: string; email: string; unitLabel: string; bId: number; fIdx: number; type: 'Tenant' | 'Owner' }> = [
    { name: 'Aly Hasan', mobile: '01711-223344', email: 'aly.hasan@email.com', unitLabel: 'A-3', bId: greenTowerId, fIdx: 0, type: 'Tenant' },
    { name: 'Jannatul Ferdaus', mobile: '01822-334455', email: 'jannatul@email.com', unitLabel: 'B-2A', bId: greenTowerId, fIdx: 1, type: 'Owner' },
    { name: 'Rony Ahmed', mobile: '01633-445566', email: 'rony@email.com', unitLabel: 'C-3C', bId: greenTowerId, fIdx: 2, type: 'Tenant' },
    { name: 'Sadia Islam', mobile: '01944-556677', email: 'sadia@email.com', unitLabel: 'A-1A', bId: roseGardenId, fIdx: 3, type: 'Owner' },
    { name: 'Tanvir Hasan', mobile: '01764-778899', email: 'tanvir@email.com', unitLabel: 'A-2', bId: roseGardenId, fIdx: 4, type: 'Tenant' },
  ];

  await db.residents.bulkAdd(
    residentDefs.map((t) => ({
      name: t.name,
      mobile: t.mobile,
      email: t.email,
      flatId: (flatIds as number[])[t.fIdx],
      buildingId: t.bId,
      unitLabel: t.unitLabel,
      type: t.type,
    }))
  );

  await db.settings.add({
    companyName: 'Green Tower',
    address: 'House # 45, Road # 12, Dhanmondi, Dhaka - 1209, Bangladesh',
    phone: '01812-045678',
    email: 'greentower@gmail.com',
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
