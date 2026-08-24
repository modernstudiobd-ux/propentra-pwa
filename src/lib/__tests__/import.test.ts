import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@/lib/db';
import { resetDb } from '@/test/testUtils';
import { autoMapColumns, detectColumnType } from '@/lib/import/detect';
import { BUILDINGS_DEF, FLATS_DEF, RESIDENTS_DEF, EXPENSES_DEF } from '@/lib/import/schemas';
import {
  buildProcessedRows, resolveBuildingRefs, resolveFlatRefs, applyRefResolutions,
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
});

describe('buildProcessedRows - coercion & validation', () => {
  it('parses valid buildings rows cleanly with no errors', () => {
    const mapping = { name: 0, address: 1, totalFlats: 2 };
    const rows = buildProcessedRows(BUILDINGS_DEF, [['Sunset Tower', '123 Main St', '24']], mapping);
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].record).toEqual({ name: 'Sunset Tower', address: '123 Main St', totalFlats: 24 });
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
    const mapping = { buildingRef: -1, unitNo: 0, floor: -1, status: -1 };
    const rows = buildProcessedRows(FLATS_DEF, [['A-1']], mapping);
    expect(rows[0].record.status).toBe('vacant');
  });

  it('falls back to the default value for an unrecognized enum cell rather than erroring, when a default exists', () => {
    const mapping = { buildingRef: -1, unitNo: 0, floor: -1, status: 1 };
    const rows = buildProcessedRows(FLATS_DEF, [['A-1', 'not-a-status']], mapping);
    expect(rows[0].record.status).toBe('vacant');
  });

  it('coerces boolean-like text for Yes/No fields', () => {
    const mapping: Record<string, number> = { buildingRef: -1, flatRef: -1, name: 0, mobile: -1, email: -1, type: -1, status: -1, moveInDate: -1, moveOutDate: -1, isBillingContact: 1, idType: -1, idNumber: -1 };
    const rows = buildProcessedRows(RESIDENTS_DEF, [['Jane Doe', 'No']], mapping);
    expect(rows[0].record.isBillingContact).toBe(false);
  });

  it('rejects an unparseable date', () => {
    const mapping = { buildingRef: -1, flatRef: -1, category: 0, amount: 1, vendor: -1, date: 2, notes: -1 };
    const rows = buildProcessedRows(EXPENSES_DEF, [['Repairs & Maintenance', '150', 'not-a-date']], mapping);
    expect(rows[0].errors.some((e) => /Date/.test(e))).toBe(true);
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
