import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { resetDb, seedBuildingFlatResident } from '@/test/testUtils';
import { getActiveTenancyForFlat, suggestRentForFlat, getExpiringTenancies, closeExpiredTenancies } from '@/lib/tenancy';
import { validateOwnershipPct } from '@/lib/ownership';
import { normalizeLegacyBackupRecords } from '@/lib/backup';

beforeEach(async () => {
  await resetDb();
});

describe('tenancy helpers', () => {
  it('suggests the flat standardRent when no tenancy exists yet', async () => {
    const { flatId } = await seedBuildingFlatResident();
    await db.flats.update(flatId, { standardRent: 1500 });
    expect(await suggestRentForFlat(flatId)).toBe(1500);
  });

  it('suggests 0 when neither a tenancy nor a standard rent exists', async () => {
    const { flatId } = await seedBuildingFlatResident();
    expect(await suggestRentForFlat(flatId)).toBe(0);
  });

  it('suggests the active tenancy rent over the flat standardRent (renewal case)', async () => {
    const { flatId, buildingId, resident } = await seedBuildingFlatResident();
    await db.flats.update(flatId, { standardRent: 1000 });
    await db.tenancies.add({
      residentId: resident.id, flatId, buildingId, leaseType: 'Fixed Term',
      leaseStart: '2026-01-01', leaseEnd: '2026-12-31', moveIn: '2026-01-01',
      monthlyRent: 1350, currency: 'USD', deposit: 1350, paymentFrequency: 'Monthly', occupancyStatus: 'active',
    });
    expect(await suggestRentForFlat(flatId)).toBe(1350);
    const active = await getActiveTenancyForFlat(flatId);
    expect(active?.monthlyRent).toBe(1350);
  });

  it('only ever returns an "active" tenancy, never an ended one', async () => {
    const { flatId, buildingId, resident } = await seedBuildingFlatResident();
    await db.tenancies.add({
      residentId: resident.id, flatId, buildingId, leaseType: 'Fixed Term',
      leaseStart: '2020-01-01', leaseEnd: '2020-12-31', moveIn: '2020-01-01', moveOut: '2020-12-31',
      monthlyRent: 900, currency: 'USD', deposit: 900, paymentFrequency: 'Monthly', occupancyStatus: 'ended',
    });
    expect(await getActiveTenancyForFlat(flatId)).toBeUndefined();
  });

  it('flags a tenancy whose lease ends within the window', async () => {
    const { flatId, buildingId, resident } = await seedBuildingFlatResident();
    const soon = new Date();
    soon.setDate(soon.getDate() + 10);
    await db.tenancies.add({
      residentId: resident.id, flatId, buildingId, leaseType: 'Fixed Term',
      leaseStart: '2026-01-01', leaseEnd: soon.toISOString().slice(0, 10), moveIn: '2026-01-01',
      monthlyRent: 1000, currency: 'USD', deposit: 1000, paymentFrequency: 'Monthly', occupancyStatus: 'active',
    });
    const expiring = await getExpiringTenancies(30);
    expect(expiring.length).toBe(1);
    expect(await getExpiringTenancies(5)).toHaveLength(0);
  });

  it('closeExpiredTenancies marks a past-due active lease as ended', async () => {
    const { flatId, buildingId, resident } = await seedBuildingFlatResident();
    await db.tenancies.add({
      residentId: resident.id, flatId, buildingId, leaseType: 'Fixed Term',
      leaseStart: '2020-01-01', leaseEnd: '2020-06-30', moveIn: '2020-01-01',
      monthlyRent: 800, currency: 'USD', deposit: 800, paymentFrequency: 'Monthly', occupancyStatus: 'active',
    });
    const closed = await closeExpiredTenancies();
    expect(closed).toBe(1);
    const t = (await db.tenancies.toArray())[0];
    expect(t.occupancyStatus).toBe('ended');
  });
});

describe('validateOwnershipPct', () => {
  it('allows a first owner at 100%', async () => {
    const { flatId } = await seedBuildingFlatResident();
    expect(await validateOwnershipPct(flatId, 100)).toBeNull();
  });

  it('rejects a percentage over 100', async () => {
    const { flatId } = await seedBuildingFlatResident();
    expect(await validateOwnershipPct(flatId, 150)).toMatch(/cannot exceed 100/);
  });

  it('rejects a zero or negative percentage', async () => {
    const { flatId } = await seedBuildingFlatResident();
    expect(await validateOwnershipPct(flatId, 0)).toMatch(/greater than 0/);
  });

  it('rejects a second owner whose share would push the flat total over 100%', async () => {
    const { flatId, buildingId, resident } = await seedBuildingFlatResident();
    await db.ownerships.add({ residentId: resident.id, flatId, buildingId, status: 'active', ownershipPct: 60, purchaseDate: '2020-01-01', ownershipType: 'Joint' });
    expect(await validateOwnershipPct(flatId, 50)).toMatch(/Total ownership/);
    expect(await validateOwnershipPct(flatId, 40)).toBeNull();
  });

  it('excludes the record being edited from its own total', async () => {
    const { flatId, buildingId, resident } = await seedBuildingFlatResident();
    const id = (await db.ownerships.add({ residentId: resident.id, flatId, buildingId, status: 'active', ownershipPct: 60, purchaseDate: '2020-01-01', ownershipType: 'Sole' })) as number;
    // Raising this SAME record from 60% to 90% should be fine (nothing else exists yet).
    expect(await validateOwnershipPct(flatId, 90, id)).toBeNull();
    // But a fresh, different record still can't also claim 90%.
    expect(await validateOwnershipPct(flatId, 90)).toMatch(/Total ownership/);
  });

  it('ignores former owners when summing existing shares', async () => {
    const { flatId, buildingId, resident } = await seedBuildingFlatResident();
    await db.ownerships.add({ residentId: resident.id, flatId, buildingId, status: 'former', ownershipPct: 100, purchaseDate: '2015-01-01', ownershipType: 'Sole' });
    expect(await validateOwnershipPct(flatId, 100)).toBeNull();
  });
});

describe('normalizeLegacyBackupRecords', () => {
  it('migrates a pre-v6 flat record (status) to the current shape (occupancyStatus)', () => {
    const data = { flats: [{ buildingId: 1, unitNo: 'A-1', status: 'occupied' }] };
    const normalized = normalizeLegacyBackupRecords(data);
    expect(normalized.flats[0].occupancyStatus).toBe('occupied');
    expect(normalized.flats[0].lifecycleStatus).toBe('active');
    expect(normalized.flats[0].status).toBeUndefined();
  });

  it('leaves an already-current flat record untouched', () => {
    const data = { flats: [{ buildingId: 1, unitNo: 'A-1', occupancyStatus: 'vacant', lifecycleStatus: 'under_renovation' }] };
    const normalized = normalizeLegacyBackupRecords(data);
    expect(normalized.flats[0]).toEqual({ buildingId: 1, unitNo: 'A-1', occupancyStatus: 'vacant', lifecycleStatus: 'under_renovation' });
  });

  it('backfills document residentId/flatId from linkType/linkId', () => {
    const data = { documents: [{ title: 'Lease', linkType: 'resident', linkId: 42 }, { title: 'Inspection', linkType: 'flat', linkId: 7 }] };
    const normalized = normalizeLegacyBackupRecords(data);
    expect(normalized.documents[0].residentId).toBe(42);
    expect(normalized.documents[1].flatId).toBe(7);
  });

  it('is a no-op when the relevant tables are absent from the backup', () => {
    const data = { residents: [{ name: 'Jane' }] };
    expect(normalizeLegacyBackupRecords(data)).toEqual(data);
  });
});
