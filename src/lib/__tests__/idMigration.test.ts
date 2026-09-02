import Dexie from 'dexie';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';

const DB_NAME = 'buildingbill-db';

async function deleteDb() {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('v8 displayId migration/backfill', () => {
  beforeEach(async () => {
    db.close();
    await deleteDb();
  });

  it('backfills sequential display IDs onto pre-existing (pre-v8) records, and preserves an existing externalId as the ID', async () => {
    // Simulate a v7 database (pre-dates displayId/sequences) with some data already in it.
    const legacy = new Dexie(DB_NAME);
    legacy.version(7).stores({
      buildings: '++id, name, externalId',
      flats: '++id, buildingId, unitNo, occupancyStatus, lifecycleStatus, externalId',
      residents: '++id, name, buildingId, flatId, type, status, externalId',
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
    });
    await legacy.open();

    // Building #1 came from a prior import and already has an externalId -
    // the migration should reuse it verbatim as the displayId.
    const b1 = await legacy.table('buildings').add({ name: 'Imported Tower', address: '1 Main St', totalFlats: 2, externalId: 'BLDG-0007' });
    // Building #2 was created by hand in the app and has no externalId -
    // the migration must generate a fresh sequential ID for it.
    const b2 = await legacy.table('buildings').add({ name: 'Hand-Added House', address: '2 Side St', totalFlats: 1 });
    await legacy.table('flats').add({ buildingId: b1, unitNo: 'A-1', occupancyStatus: 'vacant', lifecycleStatus: 'active' });
    await legacy.table('expenses').add({ buildingId: b1, category: 'Utilities', amount: 100, date: '2026-01-01' });
    legacy.close();

    // Now open the real app database (current version, v8) against the
    // same underlying IndexedDB - this triggers the real upgrade path.
    await db.open();

    const buildings = await db.buildings.orderBy('id').toArray();
    expect(buildings[0].displayId).toBe('BLDG-0007'); // reused from externalId
    expect(buildings[1].displayId).toMatch(/^BLDG-\d{4}$/); // freshly generated
    expect(buildings[1].displayId).not.toBe(buildings[0].displayId);

    const flats = await db.flats.toArray();
    expect(flats[0].displayId).toMatch(/^UNIT-\d{4}$/);

    const expenses = await db.expenses.toArray();
    expect(expenses[0].displayId).toMatch(/^EXP-\d{5}$/);

    // The sequence counters must be initialized past every backfilled ID,
    // including the reused externalId, so the next auto-generated building
    // ID never collides with "BLDG-0007".
    const seq = await db.sequences.get('buildings');
    expect(seq?.value).toBeGreaterThanOrEqual(7);
  });
});
