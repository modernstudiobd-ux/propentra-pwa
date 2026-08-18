import { db } from '@/lib/db';
import type { Building, Flat, Resident } from '@/types';

/** Wipes every table so each test starts from a clean, known-empty database. */
export async function resetDb() {
  await db.transaction('rw', db.tables, async () => {
    for (const table of db.tables) await table.clear();
  });
}

/** Seeds the single settings row that billing.ts / deposits.ts require to exist before they'll run. */
export async function seedSettings() {
  return db.settings.add({
    onboardingComplete: true,
    companyName: 'Test Co', address: '', phone: '', email: '',
    taxId: '', defaultTaxRate: 0, bankDetails: '', invoiceNotes: '',
    currencySymbol: '$', currencyName: 'US Dollars', countryCode: '',
    paymentMethods: ['Cash'],
    defaultRates: { electricityRate: 0, waterCharge: 0, gasCharge: 0, liftCharge: 0, securityCharge: 0, cleaningCharge: 0, internetCharge: 0 },
  });
}

export async function seedBuildingFlatResident(): Promise<{ buildingId: number; flatId: number; resident: Resident & { id: number } }> {
  const buildingId = (await db.buildings.add({ name: 'Test Tower', address: '1 Main St', totalFlats: 4 } as Building)) as number;
  const flatId = (await db.flats.add({ buildingId, unitNo: 'A-1', status: 'occupied' } as Flat)) as number;
  const residentId = (await db.residents.add({
    name: 'Jane Doe', mobile: '555-0100', email: 'jane@example.com',
    flatId, buildingId, unitLabel: 'A-1', type: 'Tenant', status: 'current',
    isBillingContact: true,
  } as Resident)) as number;
  const resident = await db.residents.get(residentId);
  return { buildingId, flatId, resident: resident as Resident & { id: number } };
}

/** Minimal but valid Bill for tests that just need something to pay against. */
export async function seedBill(opts: { buildingId: number; flatId: number; residentId: number; totalAmount: number; invoiceNo?: string }) {
  const id = (await db.bills.add({
    invoiceNo: opts.invoiceNo ?? 'INV-2026-001',
    buildingId: opts.buildingId, flatId: opts.flatId, residentId: opts.residentId,
    billingMonth: 'August 2026', issueDate: '2026-08-01', dueDate: '2026-08-10',
    electricityUnits: { previous: 0, current: 0, rate: 0 },
    charges: [{ label: 'Rent', amount: opts.totalAmount }],
    previousBalance: 0, discount: 0, taxRate: 0, taxAmount: 0, penalty: 0,
    subtotal: opts.totalAmount, totalAmount: opts.totalAmount,
    status: 'unpaid', paidAmount: 0,
  } as any)) as number;
  return db.bills.get(id);
}
