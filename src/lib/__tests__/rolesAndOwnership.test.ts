import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/lib/db';
import { resetDb, seedSettings } from '@/test/testUtils';
import { residentIsResident, residentIsOwner, roleLabel } from '@/lib/roles';
import { RESIDENTS_DEF } from '@/lib/import/schemas';
import { buildProcessedRows, detectDuplicates, commitImport } from '@/lib/import/engine';

async function seedBuildingAndFlat(unitNo = 'A-1') {
  const buildingId = (await db.buildings.add({ name: 'Test Tower', address: '1 Main St', totalFlats: 4 })) as number;
  const flatId = (await db.flats.add({ buildingId, unitNo, occupancyStatus: 'vacant', lifecycleStatus: 'active' })) as number;
  return { buildingId, flatId };
}

beforeEach(async () => {
  await resetDb();
  await seedSettings();
});

describe('lib/roles.ts - independent Resident/Owner role helpers', () => {
  it('falls back to the legacy `type` field for a pre-existing record with no isResident/isOwner', () => {
    const tenant = { type: 'Tenant' as const, isResident: undefined, isOwner: undefined };
    const owner = { type: 'Owner' as const, isResident: undefined, isOwner: undefined };
    expect(residentIsResident(tenant)).toBe(true);
    expect(residentIsOwner(tenant)).toBe(false);
    expect(residentIsResident(owner)).toBe(false);
    expect(residentIsOwner(owner)).toBe(true);
  });

  it('explicit booleans always win over the legacy type field', () => {
    const bothRoles = { type: 'Owner' as const, isResident: true, isOwner: true };
    expect(residentIsResident(bothRoles)).toBe(true);
    expect(residentIsOwner(bothRoles)).toBe(true);
    expect(roleLabel(bothRoles)).toBe('Owner + Resident');
  });
});

describe('Resident-only / Owner-only / Both - the core business rules', () => {
  it('1. Resident only: has isResident=true, isOwner=false, no Ownership row', async () => {
    const { buildingId, flatId } = await seedBuildingAndFlat();
    const id = (await db.residents.add({
      name: 'Alice Tenant', mobile: '', email: '', flatId, buildingId, unitLabel: 'A-1',
      type: 'Tenant', isResident: true, isOwner: false, status: 'current', isBillingContact: true,
    } as any)) as number;
    const r = await db.residents.get(id);
    expect(residentIsResident(r!)).toBe(true);
    expect(residentIsOwner(r!)).toBe(false);
    expect(await db.ownerships.where('residentId').equals(id).count()).toBe(0);
  });

  it('2. Owner only (offsite): has isOwner=true, isResident=false, and an Ownership row', async () => {
    const { buildingId, flatId } = await seedBuildingAndFlat();
    const id = (await db.residents.add({
      name: 'Robert Owner', mobile: '', email: '', flatId, buildingId, unitLabel: 'A-1',
      type: 'Owner', isResident: false, isOwner: true, status: 'current', isBillingContact: false,
    } as any)) as number;
    await db.ownerships.add({ residentId: id, flatId, buildingId, status: 'active', ownershipPct: 100, purchaseDate: '2020-01-01', ownershipType: 'Sole' });
    const r = await db.residents.get(id);
    expect(residentIsOwner(r!)).toBe(true);
    expect(residentIsResident(r!)).toBe(false);
  });

  it('3. Owner + Resident: both flags true simultaneously on the same person', async () => {
    const { buildingId, flatId } = await seedBuildingAndFlat();
    const id = (await db.residents.add({
      name: 'John Both', mobile: '', email: '', flatId, buildingId, unitLabel: 'A-1',
      type: 'Tenant', isResident: true, isOwner: true, status: 'current', isBillingContact: true,
    } as any)) as number;
    await db.ownerships.add({ residentId: id, flatId, buildingId, status: 'active', ownershipPct: 100, purchaseDate: '2020-01-01', ownershipType: 'Sole' });
    await db.tenancies.add({ residentId: id, flatId, buildingId, leaseType: 'Fixed Term', leaseStart: '2024-01-01', moveIn: '2024-01-01', monthlyRent: 0, currency: 'USD', deposit: 0, paymentFrequency: 'Monthly', occupancyStatus: 'active' });
    const r = await db.residents.get(id);
    expect(residentIsOwner(r!)).toBe(true);
    expect(residentIsResident(r!)).toBe(true);
  });

  it('4. Owner of multiple flats: one Person, several Ownership rows across different flats', async () => {
    const { buildingId, flatId: flatA } = await seedBuildingAndFlat('A-1');
    const flatB = (await db.flats.add({ buildingId, unitNo: 'B-2', occupancyStatus: 'vacant', lifecycleStatus: 'active' })) as number;
    const id = (await db.residents.add({
      name: 'Multi Owner', mobile: '', email: '', flatId: flatA, buildingId, unitLabel: 'A-1',
      type: 'Owner', isResident: false, isOwner: true, status: 'current', isBillingContact: false,
    } as any)) as number;
    await db.ownerships.add({ residentId: id, flatId: flatA, buildingId, status: 'active', ownershipPct: 100, purchaseDate: '2020-01-01', ownershipType: 'Sole' });
    await db.ownerships.add({ residentId: id, flatId: flatB, buildingId, status: 'active', ownershipPct: 100, purchaseDate: '2021-01-01', ownershipType: 'Sole' });
    const owned = await db.ownerships.where('residentId').equals(id).toArray();
    expect(owned).toHaveLength(2);
    expect(new Set(owned.map((o) => o.flatId))).toEqual(new Set([flatA, flatB]));
  });

  it('5. Resident of a flat they do not own: isResident=true, isOwner=false, still valid without any Ownership row', async () => {
    const { buildingId, flatId } = await seedBuildingAndFlat();
    const id = (await db.residents.add({
      name: 'Renter Only', mobile: '', email: '', flatId, buildingId, unitLabel: 'A-1',
      type: 'Tenant', isResident: true, isOwner: false, status: 'current', isBillingContact: true,
    } as any)) as number;
    const r = await db.residents.get(id);
    expect(residentIsResident(r!)).toBe(true);
    expect(residentIsOwner(r!)).toBe(false);
    expect(await db.ownerships.where('residentId').equals(id).count()).toBe(0);
  });

  it('11. Existing (pre-migration-shaped) resident data remains intact - no isResident/isOwner columns present at all', async () => {
    const { buildingId, flatId } = await seedBuildingAndFlat();
    // Simulates a record written before this feature existed - no
    // isResident/isOwner keys on the object at all.
    const id = (await db.residents.add({
      name: 'Legacy Tenant', mobile: '555-0100', email: 'legacy@example.com', flatId, buildingId, unitLabel: 'A-1',
      type: 'Tenant', status: 'current', isBillingContact: true,
    } as any)) as number;
    const r = await db.residents.get(id);
    expect(r?.name).toBe('Legacy Tenant');
    expect(r?.mobile).toBe('555-0100');
    expect(residentIsResident(r!)).toBe(true); // derived correctly despite missing fields
    expect(residentIsOwner(r!)).toBe(false);
  });
});

describe('Import: Owner sheet vs Tenant sheet - same person, one Person record', () => {
  const mapping: Record<string, number> = {
    buildingRef: -1, flatRef: -1, firstName: -1, middleName: -1, lastName: -1, preferredName: -1,
    name: 0, companyName: -1, mobile: 1, altPhone: -1, email: 2, preferredContactMethod: -1,
    dob: -1, nationality: -1, language: -1, idType: -1, idNumber: -1, taxLegalName: -1, taxIdType: -1,
    taxIdLast4: -1, consentStatus: -1, marketingConsent: -1, dataProcessingConsent: -1,
    type: 3, isResident: -1, isOwner: -1, status: -1, moveInDate: -1, moveOutDate: -1,
    isBillingContact: -1, externalId: -1,
  };

  it('6. same person on a Tenant sheet then an Owner sheet resolves to ONE Person with both roles (matched by phone)', async () => {
    // First import: a "Tenants" sheet.
    const tenantRows = buildProcessedRows(RESIDENTS_DEF, [['Jane Doe', '555-0100', 'jane@example.com', 'Tenant']], mapping);
    await detectDuplicates(RESIDENTS_DEF, tenantRows);
    const r1 = await commitImport(RESIDENTS_DEF, tenantRows);
    expect(r1.created).toBe(1);

    // Second import: an "Owners" sheet - same phone number, no name column
    // variance, explicitly typed Owner this time.
    const ownerRows = buildProcessedRows(RESIDENTS_DEF, [['Jane Doe', '(555) 0100', 'jane@example.com', 'Owner']], mapping);
    await detectDuplicates(RESIDENTS_DEF, ownerRows);
    expect(ownerRows[0].duplicate).not.toBeNull(); // matched by normalized phone, not blindly re-created
    ownerRows[0].decision = 'update';
    const r2 = await commitImport(RESIDENTS_DEF, ownerRows);
    expect(r2.updated).toBe(1);
    expect(r2.created).toBe(0);

    const all = await db.residents.toArray();
    expect(all).toHaveLength(1); // 7. no duplicate person created
    expect(residentIsResident(all[0])).toBe(true); // role from sheet 1 preserved
    expect(residentIsOwner(all[0])).toBe(true); // role from sheet 2 added, not overwritten
  });

  it('9. offsite owner (Owner-only import row) never gets isResident=true just because the row imported cleanly', async () => {
    const rows = buildProcessedRows(RESIDENTS_DEF, [['Robert Owner', '555-9999', 'robert@example.com', 'Owner']], mapping);
    await detectDuplicates(RESIDENTS_DEF, rows);
    const result = await commitImport(RESIDENTS_DEF, rows);
    expect(result.created).toBe(1);
    const r = (await db.residents.toArray())[0];
    expect(residentIsOwner(r)).toBe(true);
    expect(residentIsResident(r)).toBe(false); // 8. excluded from Residents / resident counts
  });

  it('10. importing the exact same row twice (idempotent) does not create a duplicate person', async () => {
    const row = [['Idempotent Person', '555-1234', 'idem@example.com', 'Tenant']];
    const first = buildProcessedRows(RESIDENTS_DEF, row, mapping);
    await detectDuplicates(RESIDENTS_DEF, first);
    await commitImport(RESIDENTS_DEF, first);

    const second = buildProcessedRows(RESIDENTS_DEF, row, mapping);
    await detectDuplicates(RESIDENTS_DEF, second);
    expect(second[0].duplicate).not.toBeNull();
    second[0].decision = 'skip';
    const result = await commitImport(RESIDENTS_DEF, second);
    expect(result.skipped).toBe(1);
    expect(await db.residents.count()).toBe(1);
  });

  it('14. a blank cell on a second-sheet update never erases a good value already on file', async () => {
    const first = buildProcessedRows(RESIDENTS_DEF, [['Priya Owner', '555-2222', 'priya@example.com', 'Tenant']], mapping);
    await detectDuplicates(RESIDENTS_DEF, first);
    await commitImport(RESIDENTS_DEF, first);

    // Second sheet only knows the phone number (used to match) and the
    // role - email column is blank on this row.
    const second = buildProcessedRows(RESIDENTS_DEF, [['Priya Owner', '555-2222', '', 'Owner']], mapping);
    await detectDuplicates(RESIDENTS_DEF, second);
    expect(second[0].duplicate).not.toBeNull();
    second[0].decision = 'update';
    await commitImport(RESIDENTS_DEF, second);

    const r = (await db.residents.toArray())[0];
    expect(r.email).toBe('priya@example.com'); // NOT blanked
    expect(residentIsOwner(r)).toBe(true);
    expect(residentIsResident(r)).toBe(true);
  });

  it('15. two existing residents sharing the same phone number are never silently auto-merged (ambiguous match)', async () => {
    const { buildingId, flatId } = await seedBuildingAndFlat();
    await db.residents.add({
      name: 'Person One', mobile: '555-7777', email: 'one@example.com', flatId, buildingId, unitLabel: 'A-1',
      type: 'Tenant', isResident: true, isOwner: false, status: 'current', isBillingContact: true,
    } as any);
    await db.residents.add({
      name: 'Person Two', mobile: '555-7777', email: 'two@example.com', flatId, buildingId, unitLabel: 'A-1',
      type: 'Tenant', isResident: true, isOwner: false, status: 'current', isBillingContact: false,
    } as any);

    const rows = buildProcessedRows(RESIDENTS_DEF, [['Someone New', '555-7777', 'new@example.com', 'Owner']], mapping);
    await detectDuplicates(RESIDENTS_DEF, rows);
    expect(rows[0].ambiguousMatch).toBeTruthy();
    expect(rows[0].duplicate).toBeNull();

    const result = await commitImport(RESIDENTS_DEF, rows);
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    expect(await db.residents.count()).toBe(2); // untouched - never guessed which one to merge into
  });
});
