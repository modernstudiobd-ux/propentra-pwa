import Dexie from 'dexie';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { residentIsResident, residentIsOwner } from '@/lib/roles';

const DB_NAME = 'buildingbill-db';

async function deleteDb() {
  await new Promise<void>((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    req.onblocked = () => resolve();
  });
}

describe('v9 isResident/isOwner migration/backfill', () => {
  beforeEach(async () => {
    db.close();
    await deleteDb();
  });

  it('backfills isResident/isOwner from the legacy `type` field for every pre-existing resident, without touching any other field', async () => {
    // Simulate a v8 database (pre-dates isResident/isOwner) with real data.
    const legacy = new Dexie(DB_NAME);
    legacy.version(8).stores({
      buildings: '++id, name, externalId, displayId',
      flats: '++id, buildingId, unitNo, occupancyStatus, lifecycleStatus, externalId, displayId',
      residents: '++id, name, buildingId, flatId, type, status, externalId, displayId',
      bills: '++id, invoiceNo, buildingId, flatId, residentId, status, billingMonth',
      receipts: '++id, receiptNo, invoiceId, residentId, voided',
      payments: '++id, invoiceId, residentId, date, voided, tenancyId, displayId',
      settings: '++id',
      depositTransactions: '++id, residentId, buildingId, flatId, type, date, displayId',
      maintenanceRequests: '++id, buildingId, flatId, status, priority, reportedDate, displayId',
      expenses: '++id, buildingId, flatId, category, date, displayId',
      reminders: '++id, dueDate, status, priority, linkType, linkId, displayId',
      documents: '++id, linkType, linkId, buildingId, flatId, residentId, category, expiryDate, displayId',
      auditLog: '++id, entityType, entityId, action, timestamp, residentId',
      importTemplates: '++id, entity',
      tenancies: '++id, residentId, flatId, buildingId, occupancyStatus, leaseEnd, displayId',
      ownerships: '++id, residentId, flatId, buildingId, status, displayId',
      contacts: '++id, residentId, type, displayId',
      emergencyContacts: '++id, residentId, isPrimary, displayId',
      vehicles: '++id, residentId, flatId, buildingId, plate, status, displayId',
      parkingSpaces: '++id, buildingId, flatId, residentId, status, displayId',
      sequences: 'entity',
    });
    await legacy.open();

    const buildingId = (await legacy.table('buildings').add({ name: 'Test Tower', address: '1 Main St', totalFlats: 2, displayId: 'BLDG-0001' })) as number;
    const flatId = (await legacy.table('flats').add({ buildingId, unitNo: 'A-1', occupancyStatus: 'occupied', lifecycleStatus: 'active', displayId: 'UNIT-0001' })) as number;
    const tenantId = (await legacy.table('residents').add({
      name: 'Legacy Tenant', mobile: '555-0100', email: 'tenant@example.com', flatId, buildingId, unitLabel: 'A-1',
      type: 'Tenant', status: 'current', isBillingContact: true, displayId: 'P-00001',
    })) as number;
    const ownerId = (await legacy.table('residents').add({
      name: 'Legacy Owner', mobile: '555-0200', email: 'owner@example.com', flatId, buildingId, unitLabel: 'A-1',
      type: 'Owner', status: 'current', isBillingContact: false, displayId: 'P-00002',
    })) as number;
    legacy.close();

    // Open the real app database (current version) against the same
    // underlying IndexedDB - this triggers the real v9 upgrade path.
    await db.open();

    const tenant = await db.residents.get(tenantId);
    const owner = await db.residents.get(ownerId);

    // Every other field is untouched.
    expect(tenant?.name).toBe('Legacy Tenant');
    expect(tenant?.mobile).toBe('555-0100');
    expect(tenant?.email).toBe('tenant@example.com');
    expect(tenant?.displayId).toBe('P-00001');

    // Backfilled roles preserve prior single-role behavior exactly.
    expect(tenant?.isResident).toBe(true);
    expect(tenant?.isOwner).toBe(false);
    expect(owner?.isResident).toBe(false);
    expect(owner?.isOwner).toBe(true);

    expect(residentIsResident(tenant!)).toBe(true);
    expect(residentIsOwner(tenant!)).toBe(false);
    expect(residentIsResident(owner!)).toBe(false);
    expect(residentIsOwner(owner!)).toBe(true);
  });
});
