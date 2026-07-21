import Dexie, { type Table } from 'dexie';
import type { Building, Flat, Tenant, Bill, Receipt, Payment, CompanySettings } from '@/types';

export class BuildingBillDB extends Dexie {
  buildings!: Table<Building, number>;
  flats!: Table<Flat, number>;
  tenants!: Table<Tenant, number>;
  bills!: Table<Bill, number>;
  receipts!: Table<Receipt, number>;
  payments!: Table<Payment, number>;
  settings!: Table<CompanySettings, number>;

  constructor() {
    super('buildingbill-db');
    this.version(1).stores({
      buildings: '++id, name',
      flats: '++id, buildingId, unitNo, status',
      tenants: '++id, name, buildingId, flatId',
      bills: '++id, invoiceNo, buildingId, flatId, tenantId, status, billingMonth',
      receipts: '++id, receiptNo, invoiceId, tenantId',
      payments: '++id, invoiceId, tenantId, date',
      settings: '++id',
    });
  }
}

export const db = new BuildingBillDB();

// Seed with demo data matching the reference design, only on first run.
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

  const tenantDefs = [
    { name: 'Aly Hasan', mobile: '01711-223344', email: 'aly.hasan@email.com', unitLabel: 'A-3', bId: greenTowerId, fIdx: 0 },
    { name: 'Jannatul Ferdaus', mobile: '01822-334455', email: 'jannatul@email.com', unitLabel: 'B-2A', bId: greenTowerId, fIdx: 1 },
    { name: 'Rony Ahmed', mobile: '01633-445566', email: 'rony@email.com', unitLabel: 'C-3C', bId: greenTowerId, fIdx: 2 },
    { name: 'Sadia Islam', mobile: '01944-556677', email: 'sadia@email.com', unitLabel: 'A-1A', bId: roseGardenId, fIdx: 3 },
    { name: 'Tanvir Hasan', mobile: '01764-778899', email: 'tanvir@email.com', unitLabel: 'A-2', bId: roseGardenId, fIdx: 4 },
  ];

  const tenantIds = await db.tenants.bulkAdd(
    tenantDefs.map((t) => ({
      name: t.name,
      mobile: t.mobile,
      email: t.email,
      flatId: (flatIds as number[])[t.fIdx],
      buildingId: t.bId,
      unitLabel: t.unitLabel,
    })),
    { allKeys: true }
  );

  await db.settings.add({
    companyName: 'Green Tower',
    address: 'House # 45, Road # 12, Dhanmondi, Dhaka - 1209, Bangladesh',
    phone: '01812-045678',
    email: 'greentower@gmail.com',
    defaultRates: {
      electricityRate: 12.0,
      waterCharge: 300,
      gasCharge: 800,
      liftCharge: 500,
      securityCharge: 700,
      cleaningCharge: 500,
      internetCharge: 600,
    },
  });

  // Seed a couple of bills/receipts/payments so Dashboard/Reports have data to show.
  const invoiceDefs = [
    { no: 'INV-2026-075', tIdx: 0, month: 'July 2026', total: 5020, status: 'unpaid' as const, paid: 0 },
    { no: 'INV-2026-074', tIdx: 1, month: 'July 2026', total: 4800, status: 'paid' as const, paid: 4800 },
    { no: 'INV-2026-073', tIdx: 2, month: 'July 2026', total: 2450, status: 'partial' as const, paid: 1000 },
    { no: 'INV-2026-072', tIdx: 3, month: 'July 2026', total: 5100, status: 'paid' as const, paid: 5100 },
  ];

  for (const inv of invoiceDefs) {
    const tenant = tenantDefs[inv.tIdx];
    const tenantId = (tenantIds as number[])[inv.tIdx];
    const flatId = (flatIds as number[])[inv.tIdx];
    const billId = await db.bills.add({
      invoiceNo: inv.no,
      buildingId: tenant.bId,
      flatId,
      tenantId,
      billingMonth: inv.month,
      issueDate: '2026-07-20',
      dueDate: '2026-08-10',
      electricityUnits: { previous: 12350, current: 12465, rate: 12 },
      charges: [
        { label: 'Water Charge', amount: 300 },
        { label: 'Gas Charge', amount: 800 },
        { label: 'Lift Charge', amount: 500 },
        { label: 'Security Charge', amount: 700 },
        { label: 'Cleaning Charge', amount: 500 },
        { label: 'Internet Charge', amount: 600 },
      ] as import('@/types').ChargeLine[],
      previousBalance: 500,
      discount: 0,
      penalty: 0,
      subtotal: inv.total,
      totalAmount: inv.total,
      status: inv.status,
      paidAmount: inv.paid,
    });

    if (inv.paid > 0) {
      await db.receipts.add({
        receiptNo: `RCPT-2026-00${41 - inv.tIdx}`,
        invoiceId: billId as number,
        tenantId,
        buildingId: tenant.bId,
        flatId,
        date: '2026-07-20',
        amountReceived: inv.paid,
        previousBalance: 500,
        totalPayable: inv.total + 500,
        remainingBalance: inv.total + 500 - inv.paid,
        method: 'Cash',
        receivedBy: 'Manager',
      });
      await db.payments.add({
        date: '2026-07-20',
        invoiceId: billId as number,
        tenantId,
        buildingId: tenant.bId,
        flatId,
        method: 'Cash',
        amount: inv.paid,
        type: inv.status === 'paid' ? 'Full' : 'Partial',
      });
    }
  }
}
