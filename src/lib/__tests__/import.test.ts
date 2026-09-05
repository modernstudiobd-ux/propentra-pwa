import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { resetDb } from '@/test/testUtils';
import { autoMapColumns, detectColumnType } from '@/lib/import/detect';
import { BUILDINGS_DEF, FLATS_DEF, RESIDENTS_DEF, EXPENSES_DEF, TENANCIES_DEF, PARKING_SPACES_DEF } from '@/lib/import/schemas';
import {
  buildProcessedRows, resolveBuildingRefs, resolveFlatRefs, resolveResidentRefs, applyRefResolutions, finalizeRefErrors,
  detectDuplicates, commitImport, ImportRollbackError,
} from '@/lib/import/engine';

beforeEach(async () => {
  await resetDb();
});

describe('detectColumnType', () => {
  it('detects numbers even with commas/currency symbols', () => {
    expect(detectColumnType(['1,200', '$50.00', '99'])).toBe('number');
  });
  it('detects ISO and slash dates without misreading plain numbers as dates', () => {
    expect(detectColumnType(['2024-01-15', '2024-02-20'])).toBe('date');
    expect(detectColumnType(['2024', '2025', '2026'])).toBe('number');
  });
  it('detects yes/no as boolean', () => {
    expect(detectColumnType(['Yes', 'No', 'yes'])).toBe('boolean');
  });
  it('falls back to string for mixed/free text', () => {
    expect(detectColumnType(['Sunset Tower', 'Ocean View'])).toBe('string');
  });
});

describe('autoMapColumns', () => {
  it('matches headers to fields via aliases, case/punctuation-insensitive', () => {
    const headers = ['Building Name', 'Address', 'Total Units'];
    const mapping = autoMapColumns(headers, BUILDINGS_DEF);
    expect(mapping.name).toBe(0);
    expect(mapping.address).toBe(1);
    expect(mapping.totalFlats).toBe(2);
  });

  it('leaves unmatched fields as -1 rather than guessing wrong', () => {
    const headers = ['Random Column'];
    const mapping = autoMapColumns(headers, BUILDINGS_DEF);
    expect(mapping.address).toBe(-1);
  });

  it('never maps two fields to the same column', () => {
    const headers = ['Name'];
    const mapping = autoMapColumns(headers, RESIDENTS_DEF);
    const used = Object.values(mapping).filter((v) => v >= 0);
    expect(new Set(used).size).toBe(used.length);
  });

  it('matches reworded/synonym headers a differently-styled tab might use', () => {
    // A tab titled with wording nobody hand-wrote an alias for verbatim -
    // exercises word-overlap + synonym matching, not just alias lookup.
    const headers = ['Tenant Full Name', 'Cell Phone', 'Email Address', 'Move-In Date'];
    const mapping = autoMapColumns(headers, RESIDENTS_DEF);
    expect(mapping.name).toBe(0);
    expect(mapping.mobile).toBe(1);
    expect(mapping.email).toBe(2);
    expect(mapping.moveInDate).toBe(3);
  });

  it('matches headers with extra connector words and reordered words', () => {
    const headers = ['Name of Building', 'Total Number of Units'];
    const mapping = autoMapColumns(headers, BUILDINGS_DEF);
    expect(mapping.name).toBe(0);
    expect(mapping.totalFlats).toBe(1);
  });

  it('tolerates small typos in headers', () => {
    const headers = ['Buildng Name', 'Adress'];
    const mapping = autoMapColumns(headers, BUILDINGS_DEF);
    expect(mapping.name).toBe(0);
    expect(mapping.address).toBe(1);
  });

  it('matches a rent-amount-style header to the right numeric field without false-matching currency', () => {
    const headers = ['Monthly Rental Amount', 'Currency Code'];
    const mapping = autoMapColumns(headers, FLATS_DEF);
    expect(mapping.standardRent).toBe(0);
    expect(mapping.currency).toBe(1);
  });

  it('does not force a wrong match for a truly unrelated column', () => {
    const headers = ['Notes', 'Random Internal Code'];
    const mapping = autoMapColumns(headers, BUILDINGS_DEF);
    expect(mapping.name).toBe(-1);
    expect(mapping.address).toBe(-1);
  });
});

describe('buildProcessedRows - coercion & validation', () => {
  it('parses valid buildings rows cleanly with no errors', () => {
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['Sunset Tower', '123 Main St', '24']], mapping);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].record).toMatchObject({ name: 'Sunset Tower', address: '123 Main St', totalFlats: 24 });
  });

  it('flags a missing required field', () => {
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['', '123 Main St', '24']], mapping);
    expect(rows[0].errors.some((e) => /Building Name/.test(e))).toBe(true);
  });

  it('flags a non-numeric value in a number field', () => {
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['Sunset Tower', '', 'not-a-number']], mapping);
    expect(rows[0].errors.some((e) => /Total Flats/.test(e))).toBe(true);
  });

  it('defaults an unmapped enum field rather than erroring', () => {
    const mapping = { buildingRef: -1, unitNo: 0, floor: -1, occupancyStatus: -1, lifecycleStatus: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [['A-1']], mapping);
    expect(rows[0].record.occupancyStatus).toBe('vacant');
  });

  it('falls back to the default value for an unrecognized enum cell rather than erroring, when a default exists', () => {
    const mapping = { buildingRef: -1, unitNo: 0, floor: -1, occupancyStatus: 1, lifecycleStatus: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [['A-1', 'not-a-status']], mapping);
    expect(rows[0].record.occupancyStatus).toBe('vacant');
  });

  it('resolves a real-world synonym for an enum field instead of silently defaulting (e.g. "Flat Owner" -> "Owner")', () => {
    const mapping: Record<string, number> = { buildingRef: -1, flatRef: -1, name: 0, mobile: -1, email: -1, type: 1, status: -1, moveInDate: -1, moveOutDate: -1, isBillingContact: -1, idType: -1, idNumber: -1, firstName: -1, lastName: -1 } as any;
    const rows = buildProcessedRows(RESIDENTS_DEF, [['Jane Doe', 'Flat Owner']], mapping);
    expect(rows[0].record.type).toBe('Owner');
    expect(rows[0].errors).toEqual([]);
  });

  it('coerces boolean-like text for Yes/No fields', () => {
    const mapping: Record<string, number> = { buildingRef: -1, flatRef: -1, name: 0, mobile: -1, email: -1, type: -1, status: -1, moveInDate: -1, moveOutDate: -1, isBillingContact: 1, idType: -1, idNumber: -1, firstName: -1, lastName: -1 } as any;
    const rows = buildProcessedRows(RESIDENTS_DEF, [['Jane Doe', 'No']], mapping);
    expect(rows[0].record.isBillingContact).toBe(false);
  });

  it('rejects an unparseable date', () => {
    const mapping = { buildingRef: -1, flatRef: -1, category: 0, amount: 1, vendor: -1, date: 2, notes: -1 };
    const rows = buildProcessedRows(EXPENSES_DEF, [['Repairs & Maintenance', '150', 'not-a-date']], mapping);
    expect(rows[0].errors.some((e) => /Date/.test(e))).toBe(true);
  });

  it('uses a manual value for a required field with no matching column instead of erroring', () => {
    const mapping = { name: -1, address: -1, totalFlats: -1 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['ignored']], mapping, { name: 'Sunset Tower' });
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].record.name).toBe('Sunset Tower');
  });

  it('applies the same manual value to every row', () => {
    const mapping = { buildingRef: -1, unitNo: 0, floor: -1, occupancyStatus: -1, lifecycleStatus: -1, unitType: -1, bedrooms: -1, bathrooms: -1, sqft: -1, standardRent: -1, currency: -1, parkingIncluded: -1, storageIncluded: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [['A-1'], ['A-2'], ['A-3']], mapping, { storageIncluded: 'Yes' });
    expect(rows.every((r) => r.record.storageIncluded === true)).toBe(true);
  });

  it('lets a manual value resolve a required relationship field too (e.g. every row is for the same building)', () => {
    const mapping = { buildingRef: -1, unitNo: 0, floor: -1, occupancyStatus: -1, lifecycleStatus: -1, unitType: -1, bedrooms: -1, bathrooms: -1, sqft: -1, standardRent: -1, currency: -1, parkingIncluded: -1, storageIncluded: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [['A-1'], ['A-2']], mapping, { buildingRef: 'Sunset Tower' });
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].refs.buildingRef.raw).toBe('Sunset Tower');
    expect(rows[1].refs.buildingRef.raw).toBe('Sunset Tower');
  });

  it('prefers a mapped column over a stale manual value for the same field', () => {
    const mapping = { name: 0, address: -1, totalFlats: -1 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['Real Column Value']], mapping, { name: 'Should Be Ignored' });
    expect(rows[0].record.name).toBe('Real Column Value');
  });
});

describe('relationship resolution', () => {
  it('matches a building reference to an existing building by name (case/whitespace-insensitive)', async () => {
    await db.buildings.add({ name: 'Sunset Tower', address: '', totalFlats: 0 });
    const mapping = { buildingRef: 0, unitNo: 1, floor: -1, status: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [[' sunset tower ', 'A-1']], mapping);
    const distinct = await resolveBuildingRefs(rows);
    const res = Array.from(distinct.values())[0];
    expect(res.status).toBe('matched');
    expect(res.matchedId).toBeDefined();
  });

  it('flags an unmatched building reference until the user resolves it', async () => {
    const mapping = { buildingRef: 0, unitNo: 1, floor: -1, status: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [['Nonexistent Tower', 'A-1']], mapping);
    const distinct = await resolveBuildingRefs(rows);
    expect(Array.from(distinct.values())[0].status).toBe('unmatched');
  });

  it('applyRefResolutions turns a "create" choice into a resolved ref with no row error', () => {
    const mapping = { buildingRef: 0, unitNo: 1, floor: -1, status: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [['New Tower', 'A-1']], mapping);
    const buildingRes = new Map([['newtower', { raw: 'New Tower', status: 'create' as const }]]);
    applyRefResolutions(rows, buildingRes, new Map());
    expect(rows[0].refs.buildingRef.status).toBe('create');
    expect(rows[0].errors).toEqual([]);
  });

  it('adds a row error when a reference is left unmatched', () => {
    const mapping = { buildingRef: 0, unitNo: 1, floor: -1, status: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [['Nonexistent Tower', 'A-1']], mapping);
    applyRefResolutions(rows, new Map(), new Map()); // no resolutions supplied -> stays unmatched
    expect(rows[0].errors.some((e) => /Could not match/.test(e))).toBe(true);
  });
});

describe('detectDuplicates', () => {
  it('flags a building with the same name (case-insensitive) as a duplicate', async () => {
    const existingId = (await db.buildings.add({ name: 'Sunset Tower', address: '', totalFlats: 0 })) as number;
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['sunset tower', '', '']], mapping);
    await detectDuplicates(BUILDINGS_DEF, rows);
    expect(rows[0].duplicate?.matchedId).toBe(existingId);
  });

  it('does not flag a genuinely new building as a duplicate', async () => {
    await db.buildings.add({ name: 'Sunset Tower', address: '', totalFlats: 0 });
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['Ocean View', '', '']], mapping);
    await detectDuplicates(BUILDINGS_DEF, rows);
    expect(rows[0].duplicate).toBeNull();
  });

  it('never flags a row that already has a validation error', async () => {
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['', '', '']], mapping); // missing required name -> error
    await detectDuplicates(BUILDINGS_DEF, rows);
    expect(rows[0].duplicate).toBeNull();
  });
});

describe('commitImport', () => {
  it('creates new buildings inside a transaction and logs one audit entry', async () => {
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['Sunset Tower', '123 Main St', '24'], ['Ocean View', '', '10']], mapping);
    await detectDuplicates(BUILDINGS_DEF, rows);
    const result = await commitImport(BUILDINGS_DEF, rows);
    expect(result.created).toBe(2);
    expect(await db.buildings.count()).toBe(2);
    const audit = await db.auditLog.toArray();
    expect(audit.some((a) => a.action === 'data_imported')).toBe(true);
  });

  it('skips duplicate rows when the decision is "skip" and leaves the existing record untouched', async () => {
    const existingId = (await db.buildings.add({ name: 'Sunset Tower', address: 'Old Address', totalFlats: 5 })) as number;
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['Sunset Tower', 'New Address', '99']], mapping);
    await detectDuplicates(BUILDINGS_DEF, rows);
    rows[0].decision = 'skip';
    const result = await commitImport(BUILDINGS_DEF, rows);
    expect(result.skipped).toBe(1);
    expect(result.created).toBe(0);
    const existing = await db.buildings.get(existingId);
    expect(existing?.address).toBe('Old Address');
  });

  it('updates the existing record when the decision is "update"', async () => {
    const existingId = (await db.buildings.add({ name: 'Sunset Tower', address: 'Old Address', totalFlats: 5 })) as number;
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['Sunset Tower', 'New Address', '99']], mapping);
    await detectDuplicates(BUILDINGS_DEF, rows);
    rows[0].decision = 'update';
    const result = await commitImport(BUILDINGS_DEF, rows);
    expect(result.updated).toBe(1);
    const existing = await db.buildings.get(existingId);
    expect(existing?.address).toBe('New Address');
  });

  it('excludes rows with validation errors from being written', async () => {
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['', '', '']], mapping);
    const result = await commitImport(BUILDINGS_DEF, rows);
    expect(result.skipped).toBe(1);
    expect(await db.buildings.count()).toBe(0);
  });

  it('auto-creates a missing building and flat together for a resident import, and rolls back nothing is left half-written on failure', async () => {
    const mapping: Record<string, number> = { buildingRef: 0, flatRef: 1, name: 2, mobile: -1, email: -1, type: -1, status: -1, moveInDate: -1, moveOutDate: -1, isBillingContact: -1, idType: -1, idNumber: -1 };
    const rows = buildProcessedRows(RESIDENTS_DEF, [['New Tower', 'A-1', 'Jane Doe']], mapping);
    const buildingDistinct = await resolveBuildingRefs(rows);
    const buildingChoices = new Map(Array.from(buildingDistinct.entries()).map(([k, v]) => [k, { ...v, status: 'create' as const }]));
    applyRefResolutions(rows, buildingChoices, new Map());
    const flatDistinct = await resolveFlatRefs(rows); // building is "create", so this is empty - flat is created alongside it
    applyRefResolutions(rows, new Map(), flatDistinct);
    await detectDuplicates(RESIDENTS_DEF, rows);

    const result = await commitImport(RESIDENTS_DEF, rows);
    expect(result.created).toBe(1);
    expect(await db.buildings.count()).toBe(1);
    expect(await db.flats.count()).toBe(1);
    const resident = (await db.residents.toArray())[0];
    expect(resident.unitLabel).toBe('A-1');
    const flat = (await db.flats.toArray())[0];
    expect(resident.flatId).toBe(flat.id);
    expect(resident.buildingId).toBe(flat.buildingId);
  });

  it('rolls back the whole batch and throws ImportRollbackError if a write fails partway through', async () => {
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(
      BUILDINGS_DEF,
      [['First Tower', '', '1'], ['Second Tower', '', '2']],
      mapping
    );
    await detectDuplicates(BUILDINGS_DEF, rows);

    // Force the SECOND row's write to fail, after the first has already
    // succeeded inside the same transaction - proves the whole batch is
    // rolled back together rather than leaving the first row committed.
    const originalAdd = db.buildings.add.bind(db.buildings);
    let calls = 0;
    const spy = vi.spyOn(db.buildings, 'add').mockImplementation((...args: any[]) => {
      calls++;
      if (calls === 2) return Promise.reject(new Error('Simulated write failure'));
      return (originalAdd as any)(...args);
    });

    await expect(commitImport(BUILDINGS_DEF, rows)).rejects.toBeInstanceOf(ImportRollbackError);
    spy.mockRestore();
    expect(await db.buildings.count()).toBe(0); // first row's insert was rolled back too
  });
});

describe('name composition from First/Last Name columns', () => {
  it('composes "name" from First + Last Name when there is no combined Full Name column', () => {
    const mapping: Record<string, number> = {
      buildingRef: -1, flatRef: -1, firstName: 0, middleName: -1, lastName: 1, preferredName: -1, name: -1,
      mobile: -1, email: -1, type: -1, status: -1, moveInDate: -1, moveOutDate: -1, isBillingContact: -1, idType: -1, idNumber: -1,
    };
    const rows = buildProcessedRows(RESIDENTS_DEF, [['Stanley', 'Estrada']], mapping);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].record.name).toBe('Stanley Estrada');
  });

  it('still prefers a real mapped Full Name column over composing one', () => {
    const mapping: Record<string, number> = {
      buildingRef: -1, flatRef: -1, firstName: 1, middleName: -1, lastName: 2, preferredName: -1, name: 0,
      mobile: -1, email: -1, type: -1, status: -1, moveInDate: -1, moveOutDate: -1, isBillingContact: -1, idType: -1, idNumber: -1,
    };
    const rows = buildProcessedRows(RESIDENTS_DEF, [['Jane Doe', 'Stanley', 'Estrada']], mapping);
    expect(rows[0].record.name).toBe('Jane Doe');
  });

  it('leaves Building/Unit unset (not an error) when a People-style sheet has no location columns at all', () => {
    const mapping: Record<string, number> = {
      buildingRef: -1, flatRef: -1, firstName: 0, middleName: -1, lastName: 1, preferredName: -1, name: -1,
      mobile: -1, email: -1, type: -1, status: -1, moveInDate: -1, moveOutDate: -1, isBillingContact: -1, idType: -1, idNumber: -1,
    };
    const rows = buildProcessedRows(RESIDENTS_DEF, [['Stanley', 'Estrada']], mapping);
    expect(rows[0].errors).toEqual([]);
  });
});

describe('cross-sheet reference resolution by Source ID (externalId)', () => {
  it('matches a building reference by its Source ID even though the ref text isn\'t the building name', async () => {
    await db.buildings.add({ name: 'Oakwood Residences', address: '', totalFlats: 0, externalId: 'BLDG-0001' });
    const mapping = { buildingRef: 0, unitNo: 1, floor: -1, status: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [['BLDG-0001', '806']], mapping);
    const distinct = await resolveBuildingRefs(rows);
    expect(Array.from(distinct.values())[0].status).toBe('matched');
  });

  it('matches a flat reference by Source ID directly, without needing a Building column on that row', async () => {
    const buildingId = (await db.buildings.add({ name: 'Oakwood Residences', address: '', totalFlats: 0, externalId: 'BLDG-0001' })) as number;
    await db.flats.add({ buildingId, unitNo: '806', occupancyStatus: 'occupied', lifecycleStatus: 'active', externalId: 'UNIT-0001' });
    const mapping = { residentRef: 0, buildingRef: -1, flatRef: 1, leaseType: -1, leaseStart: 2, leaseEnd: -1, moveIn: 3, moveOut: -1, monthlyRent: 4, currency: -1, deposit: -1, paymentFrequency: -1, occupancyStatus: -1 };
    const rows = buildProcessedRows(TENANCIES_DEF, [['P-00001', 'UNIT-0001', '2025-01-01', '2025-01-01', '1850']], mapping);
    const distinct = await resolveFlatRefs(rows);
    expect(Array.from(distinct.values())[0].status).toBe('matched');
  });

  it('matches a resident reference by Source ID (Person ID) rather than name', async () => {
    await db.residents.add({
      name: 'Stanley Estrada', mobile: '', email: '', flatId: 0, buildingId: 0, unitLabel: '',
      type: 'Tenant', status: 'current', isBillingContact: true, externalId: 'P-00001',
    } as any);
    const rows = buildProcessedRows(TENANCIES_DEF, [['P-00001', '', '', '', '2025-01-01', '2025-01-01', '1850']], {
      residentRef: 0, buildingRef: -1, flatRef: -1, leaseType: -1, leaseStart: 4, leaseEnd: -1, moveIn: 5, moveOut: -1, monthlyRent: 6, currency: -1, deposit: -1, paymentFrequency: -1, occupancyStatus: -1,
    });
    const distinct = await resolveResidentRefs(rows);
    expect(Array.from(distinct.values())[0].status).toBe('matched');
  });
});

describe('relational workbook import end-to-end (Building -> Unit -> Person -> Tenancy)', () => {
  it('backfills a resident\'s building/flat from a Tenancy row once its own Unit ID resolves, even though the People sheet had no location columns', async () => {
    // 1. Building imported from a "Properties" sheet, keyed by Property ID.
    const buildingRows = buildProcessedRows(BUILDINGS_DEF, [['Oakwood Residences', '', '', '', '', '', '', '', '100', 'BLDG-0001']],
      { name: 0, address: 1, addressLine2: 2, locality: 3, adminArea: 4, postalCode: 5, countryCode: 6, propertyType: 7, status: -1, totalFlats: 8, externalId: 9 });
    await detectDuplicates(BUILDINGS_DEF, buildingRows);
    await commitImport(BUILDINGS_DEF, buildingRows);
    const building = (await db.buildings.toArray())[0];
    expect(building.externalId).toBe('BLDG-0001');

    // 2. Unit imported from a "Units" sheet - Building matched by its own
    // Property ID, not by name.
    const flatMapping = { buildingRef: 0, unitNo: 1, floor: -1, occupancyStatus: -1, lifecycleStatus: -1, unitType: -1, bedrooms: -1, bathrooms: -1, sqft: -1, standardRent: -1, currency: -1, parkingIncluded: -1, storageIncluded: -1, externalId: 2 };
    const flatRows = buildProcessedRows(FLATS_DEF, [['BLDG-0001', '806', 'UNIT-0001']], flatMapping);
    const bDistinct = await resolveBuildingRefs(flatRows);
    applyRefResolutions(flatRows, bDistinct, new Map());
    await detectDuplicates(FLATS_DEF, flatRows);
    await commitImport(FLATS_DEF, flatRows);
    const flat = (await db.flats.toArray())[0];
    expect(flat.externalId).toBe('UNIT-0001');
    expect(flat.buildingId).toBe(building.id);

    // 3. Person imported from a "People" sheet - NO building/unit columns at
    // all (RESIDENTS_DEF's location fields are optional for this reason).
    const residentMapping: Record<string, number> = {
      buildingRef: -1, flatRef: -1, firstName: 0, middleName: -1, lastName: 1, preferredName: -1, name: -1,
      companyName: -1, mobile: -1, altPhone: -1, email: -1, preferredContactMethod: -1, dob: -1, nationality: -1,
      language: -1, idType: -1, idNumber: -1, taxLegalName: -1, taxIdType: -1, taxIdLast4: -1, consentStatus: -1,
      marketingConsent: -1, dataProcessingConsent: -1, type: 2, status: -1, moveInDate: -1, moveOutDate: -1,
      isBillingContact: -1, externalId: 3,
    };
    const residentRows = buildProcessedRows(RESIDENTS_DEF, [['Stanley', 'Estrada', 'Tenant', 'P-00001']], residentMapping);
    expect(residentRows[0].errors).toEqual([]); // no location required
    await detectDuplicates(RESIDENTS_DEF, residentRows);
    await commitImport(RESIDENTS_DEF, residentRows);
    const resident = (await db.residents.toArray())[0];
    expect(resident.name).toBe('Stanley Estrada');
    expect(resident.buildingId).toBeFalsy(); // not yet situated

    // 4. Tenancy imported from a "Tenancies" sheet - resident matched by
    // Person ID, unit matched by its own Unit ID (not derived from a
    // Building column, since the Tenancy sheet skips straight to Unit ID).
    const tenancyMapping = { residentRef: 0, buildingRef: -1, flatRef: 1, leaseType: -1, leaseStart: 2, leaseEnd: -1, moveIn: 3, moveOut: -1, monthlyRent: 4, currency: -1, deposit: -1, paymentFrequency: -1, occupancyStatus: -1 };
    const tenancyRows = buildProcessedRows(TENANCIES_DEF, [['P-00001', 'UNIT-0001', '2025-03-18', '2025-03-18', '1850']], tenancyMapping);
    const rDistinct = await resolveResidentRefs(tenancyRows);
    const fDistinct = await resolveFlatRefs(tenancyRows);
    applyRefResolutions(tenancyRows, new Map(), fDistinct, rDistinct);
    expect(tenancyRows[0].errors).toEqual([]);
    await detectDuplicates(TENANCIES_DEF, tenancyRows);
    const result = await commitImport(TENANCIES_DEF, tenancyRows);
    expect(result.created).toBe(1);

    const tenancy = (await db.tenancies.toArray())[0];
    expect(tenancy.flatId).toBe(flat.id);
    expect(tenancy.buildingId).toBe(building.id);

    // The resident record itself is now retroactively situated too.
    const updatedResident = await db.residents.get(resident.id as number);
    expect(updatedResident?.buildingId).toBe(building.id);
    expect(updatedResident?.flatId).toBe(flat.id);
    expect(updatedResident?.unitLabel).toBe('806');
  });

  it('derives a Parking Space\'s building from its Unit ID when the sheet has no Property ID column at all', async () => {
    const buildingId = (await db.buildings.add({ name: 'Oakwood Residences', address: '', totalFlats: 0, externalId: 'BLDG-0001' })) as number;
    const flatId = (await db.flats.add({ buildingId, unitNo: '806', occupancyStatus: 'occupied', lifecycleStatus: 'active', externalId: 'UNIT-0001' })) as number;

    const mapping = { buildingRef: -1, flatRef: 0, residentRef: -1, spaceNumber: 1, type: -1, assignedDate: -1, status: -1 };
    const rows = buildProcessedRows(PARKING_SPACES_DEF, [['UNIT-0001', 'P-001']], mapping);
    const fDistinct = await resolveFlatRefs(rows);
    applyRefResolutions(rows, new Map(), fDistinct);
    await detectDuplicates(PARKING_SPACES_DEF, rows);
    const result = await commitImport(PARKING_SPACES_DEF, rows);
    expect(result.created).toBe(1);

    const space = (await db.parkingSpaces.toArray())[0];
    expect(space.flatId).toBe(flatId);
    expect(space.buildingId).toBe(buildingId);
  });

  it('does not prematurely error a reference that simply hasn\'t had its resolution step yet, across multiple wizard steps for a multi-reference entity', async () => {
    // Regression test: Tenancies has Resident + (optional) Building + Unit
    // references, each resolved in a SEPARATE wizard step exactly like the
    // real ImportWizard does. Resolving Building first must not permanently
    // flag Unit/Resident as unmatched just because their own step hasn't
    // run yet.
    const buildingId = (await db.buildings.add({ name: 'Oakwood Residences', address: '', totalFlats: 0, externalId: 'BLDG-0001' })) as number;
    const flatId = (await db.flats.add({ buildingId, unitNo: '806', occupancyStatus: 'occupied', lifecycleStatus: 'active', externalId: 'UNIT-0001' })) as number;
    const residentId = (await db.residents.add({
      name: 'Stanley Estrada', mobile: '', email: '', flatId: 0, buildingId: 0, unitLabel: '',
      type: 'Tenant', status: 'current', isBillingContact: true, externalId: 'P-00001',
    } as any)) as number;

    const mapping = { residentRef: 0, buildingRef: 1, flatRef: 2, leaseType: -1, leaseStart: 3, leaseEnd: -1, moveIn: 4, moveOut: -1, monthlyRent: 5, currency: -1, deposit: -1, paymentFrequency: -1, occupancyStatus: -1 };
    const rows = buildProcessedRows(TENANCIES_DEF, [['P-00001', 'BLDG-0001', 'UNIT-0001', '2025-03-18', '2025-03-18', '1850']], mapping);

    // Step 1 (Building) - exactly mirrors ImportWizard's proceedFromBuildingRels.
    const bDistinct = await resolveBuildingRefs(rows);
    applyRefResolutions(rows, bDistinct, new Map(), undefined, { finalize: false });
    expect(rows[0].errors).toEqual([]); // Unit/Resident haven't been checked yet - must NOT be flagged here

    // Step 2 (Unit) - exactly mirrors proceedFromFlatRels.
    const fDistinct = await resolveFlatRefs(rows);
    applyRefResolutions(rows, new Map(), fDistinct, undefined, { finalize: false });
    expect(rows[0].errors).toEqual([]);

    // Step 3 (Resident) - exactly mirrors proceedFromResidentRels, then
    // goToPreview's single finalization pass.
    const rDistinct = await resolveResidentRefs(rows);
    applyRefResolutions(rows, new Map(), new Map(), rDistinct, { finalize: false });
    finalizeRefErrors(rows);
    expect(rows[0].errors).toEqual([]);

    await detectDuplicates(TENANCIES_DEF, rows);
    const result = await commitImport(TENANCIES_DEF, rows);
    expect(result.created).toBe(1);
    const tenancy = (await db.tenancies.toArray())[0];
    expect(tenancy.residentId).toBe(residentId);
    expect(tenancy.flatId).toBe(flatId);
    expect(tenancy.buildingId).toBe(buildingId);
  });
});
