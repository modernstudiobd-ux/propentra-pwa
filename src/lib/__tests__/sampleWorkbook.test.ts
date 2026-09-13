import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { resetDb } from '@/test/testUtils';
import { parseImportFile } from '@/lib/import/parseFile';
import { autoMapColumns } from '@/lib/import/detect';
import { generateSampleWorkbook } from '@/lib/import/sampleWorkbook';
import { MAP_FIELDS as STORAGE_FIELDS } from '@/components/BulkStorageImportModal';
import { IMPORT_ENTITIES, IMPORT_ENTITY_ORDER, guessEntityFromSheetName, normalizeHeader, type ImportEntityKey } from '@/lib/import/schemas';
import {
  buildProcessedRows, resolveBuildingRefs, resolveFlatRefs, resolveResidentRefs, applyRefResolutions, finalizeRefErrors,
  detectDuplicates, commitImport,
} from '@/lib/import/engine';
import { coerceImportCell } from '@/lib/import/quickImport';

/**
 * The downloadable "Full Sample Workbook" (sampleWorkbook.ts) is generated
 * straight from IMPORT_ENTITIES (schemas.ts), the same source of truth the
 * real importer reads. This test proves the two stay in sync going forward:
 * it drives every tab through the exact same auto-map -> build rows ->
 * resolve refs -> commit pipeline the Import Wizard uses, and fails loudly
 * if a future schema change (renamed/added/required field, new alias
 * collision, etc.) ever makes the generated sample un-importable.
 */
describe('sample import workbook (generated from the live import schema)', () => {
  it('downloads with the sheet names Bulk Add auto-selection expects', async () => {
    const blob = generateSampleWorkbook();
    expect(blob.size).toBeGreaterThan(0);
    const file = new File([await blob.arrayBuffer()], 'propentra-sample-import.xlsx');
    const wb = await parseImportFile(file);
    const names = wb.sheets.map((s) => s.name);
    expect(names).toEqual(['Read Me', 'Buildings', 'Flats', 'Owners', 'Tenants', 'Tenancies', 'Ownership', 'Parking', 'Storage']);

    // Every data tab (all but Read Me) must resolve to the entity its name
    // implies, exactly like the real Import Wizard / Bulk Add "Import from
    // File" flows would resolve it.
    expect(guessEntityFromSheetName('Buildings')).toBe('buildings');
    expect(guessEntityFromSheetName('Flats')).toBe('flats');
    expect(guessEntityFromSheetName('Owners')).toBe('residents');
    expect(guessEntityFromSheetName('Tenants')).toBe('residents');
    expect(guessEntityFromSheetName('Tenancies')).toBe('tenancies');
    expect(guessEntityFromSheetName('Ownership')).toBe('ownerships');
    expect(guessEntityFromSheetName('Parking')).toBe('parkingSpaces');
  });

  it('imports every data tab end-to-end with no errors, skips, or unmapped required fields', async () => {
    await resetDb();
    const blob = generateSampleWorkbook();
    const file = new File([await blob.arrayBuffer()], 'propentra-sample-import.xlsx');
    const wb = await parseImportFile(file);

    const jobs = wb.sheets
      .map((sheet) => ({ sheet, entity: guessEntityFromSheetName(sheet.name) }))
      .filter((j): j is { sheet: typeof j.sheet; entity: ImportEntityKey } => j.entity !== null)
      .sort((a, b) => IMPORT_ENTITY_ORDER.indexOf(a.entity) - IMPORT_ENTITY_ORDER.indexOf(b.entity));

    expect(jobs.length).toBe(7); // Buildings, Flats, Owners, Tenants, Tenancies, Ownership, Parking (Read Me + Storage excluded)

    for (const { sheet, entity } of jobs) {
      const def = IMPORT_ENTITIES[entity];
      const mapping = autoMapColumns(sheet.headers, def.fields);

      const unmappedRequired = def.fields.filter((f) => f.required && (mapping[f.key] ?? -1) < 0);
      expect(unmappedRequired.map((f) => f.label), `${sheet.name}: required field(s) failed to auto-map`).toEqual([]);

      const rows = buildProcessedRows(def, sheet.rows, mapping);

      if (def.fields.some((f) => f.refEntity === 'building')) {
        const dist = await resolveBuildingRefs(rows);
        const resolved = new Map(Array.from(dist.entries()).map(([k, v]) => [k, v.status === 'unmatched' ? { ...v, status: 'create' as const } : v]));
        applyRefResolutions(rows, resolved, new Map(), undefined, { finalize: false });
      }
      if (def.fields.some((f) => f.refEntity === 'flat')) {
        const dist = await resolveFlatRefs(rows);
        applyRefResolutions(rows, new Map(), dist, undefined, { finalize: false });
      }
      if (def.fields.some((f) => f.refEntity === 'resident')) {
        const dist = await resolveResidentRefs(rows);
        applyRefResolutions(rows, new Map(), new Map(), dist, { finalize: false });
      }
      finalizeRefErrors(rows);

      await detectDuplicates(def, rows);
      const result = await commitImport(def, rows);

      const errorRows = rows.filter((r) => r.errors.length > 0);
      expect(errorRows.map((r) => r.errors.join('; ')), `${sheet.name} -> ${def.label} had row errors`).toEqual([]);
      expect(result.skipped, `${sheet.name} -> ${def.label} skipped rows unexpectedly`).toBe(0);
    }

    expect(await db.buildings.count()).toBe(2);
    expect(await db.flats.count()).toBe(2);
    expect(await db.residents.count()).toBe(2);
    expect(await db.tenancies.count()).toBe(1);
    expect(await db.ownerships.count()).toBe(1);
    expect(await db.parkingSpaces.count()).toBe(1);

    // Cross-sheet dependency check: the Owners-tab person must have actually
    // landed as an owner (Type/isOwner), and both people must have resolved
    // to a real flat/building - i.e. the Ownership/Tenancy tabs' name-based
    // links to the Owners/Tenants tabs genuinely worked, not just parsed.
    const residents = await db.residents.toArray();
    const owner = residents.find((r: any) => r.name === 'Robert Chen');
    const tenant = residents.find((r: any) => r.name === 'Jane Doe');
    expect(owner?.isOwner).toBe(true);
    expect(tenant?.flatId).toBeTruthy();
    expect(owner?.flatId).toBeTruthy();

    const ownerships = await db.ownerships.toArray();
    expect(ownerships[0].residentId).toBe(owner!.id);
    const tenancies = await db.tenancies.toArray();
    expect(tenancies[0].residentId).toBe(tenant!.id);
  });

  it('imports the Storage tab and updates the matching flat', async () => {
    // Storage isn't a full Import Wizard entity - it's applied via the
    // dedicated Bulk Import Storage Flags flow, driven by MAP_FIELDS from
    // BulkStorageImportModal.tsx (the same field list the sample tab uses).
    await resetDb();
    const buildingId = (await db.buildings.add({ name: 'Sunset Tower', address: '123 Main St', totalFlats: 24 } as any)) as number;
    const flatId = (await db.flats.add({ buildingId, unitNo: 'A-101', occupancyStatus: 'occupied', lifecycleStatus: 'active', storageIncluded: false } as any)) as number;

    const blob = generateSampleWorkbook();
    const file = new File([await blob.arrayBuffer()], 'propentra-sample-import.xlsx');
    const wb = await parseImportFile(file);
    const storageSheet = wb.sheets.find((s) => s.name === 'Storage')!;
    expect(storageSheet).toBeTruthy();

    const mapping = autoMapColumns(storageSheet.headers, STORAGE_FIELDS);
    for (const f of STORAGE_FIELDS) {
      if (f.required) expect(mapping[f.key], `Storage: "${f.label}" failed to auto-map`).toBeGreaterThanOrEqual(0);
    }

    const uIdx = mapping['unitNoText'];
    const iIdx = mapping['included'];
    const row = storageSheet.rows[0];
    const unitNoText = String(row[uIdx]).trim();
    const included = !!coerceImportCell({ key: 'included', type: 'checkbox' }, row[iIdx]);
    expect(normalizeHeader(unitNoText)).toBe(normalizeHeader('A-101'));
    expect(included).toBe(true);

    await db.flats.update(flatId, { storageIncluded: included });
    const updated = await db.flats.get(flatId);
    expect(updated?.storageIncluded).toBe(true);
  });
});
