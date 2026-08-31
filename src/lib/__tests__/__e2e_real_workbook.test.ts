import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';
import { db } from '@/lib/db';
import { resetDb } from '@/test/testUtils';
import { parseImportFile } from '@/lib/import/parseFile';
import { autoMapColumns } from '@/lib/import/detect';
import { IMPORT_ENTITIES, guessEntityFromSheetName, IMPORT_ENTITY_ORDER, type ImportEntityKey } from '@/lib/import/schemas';
import {
  buildProcessedRows, resolveBuildingRefs, resolveFlatRefs, resolveResidentRefs, applyRefResolutions, finalizeRefErrors,
  detectDuplicates, commitImport,
} from '@/lib/import/engine';

const FILE_PATH = process.env.E2E_XLSX_PATH;

(FILE_PATH ? describe : describe.skip)('real-world workbook import (industry-standard property management xlsx)', () => {
  it('imports every eligible sheet end-to-end with no leftover unlocated residents', async () => {
    await resetDb();
    const buf = readFileSync(FILE_PATH as string);
    const file = new File([buf], 'workbook.xlsx');
    const wb = await parseImportFile(file);

    const jobs = wb.sheets
      .map((sheet) => ({ sheet, entity: guessEntityFromSheetName(sheet.name) }))
      .filter((j): j is { sheet: typeof j.sheet; entity: ImportEntityKey } => j.entity !== null)
      .sort((a, b) => IMPORT_ENTITY_ORDER.indexOf(a.entity) - IMPORT_ENTITY_ORDER.indexOf(b.entity));

    const skipped = wb.sheets.filter((s) => !guessEntityFromSheetName(s.name)).map((s) => s.name);
    console.log('Auto-skipped sheets:', skipped.join(', ') || '(none)');

    for (const { sheet, entity } of jobs) {
      const def = IMPORT_ENTITIES[entity];
      const mapping = autoMapColumns(sheet.headers, def);
      const hasNameParts = def.fields.some((f) => f.key === 'firstName');
      const unmappedRequired = def.fields.filter((f) => {
        if ((mapping[f.key] ?? -1) >= 0) return false;
        if (f.key === 'name' && hasNameParts && (mapping['firstName'] >= 0 || mapping['lastName'] >= 0)) return false;
        return f.required;
      });

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
      console.log(
        `[${sheet.name}] -> ${def.label}: mapped ${Object.values(mapping).filter((v) => v >= 0).length}/${def.fields.length} fields` +
        (unmappedRequired.length ? ` (UNMAPPED REQUIRED: ${unmappedRequired.map((f) => f.label).join(', ')})` : '') +
        ` | rows ${sheet.rows.length} created ${result.created} updated ${result.updated} skipped ${result.skipped}`
      );
      if (errorRows.length) {
        console.log('  sample errors:', errorRows.slice(0, 3).map((r) => r.errors.join('; ')));
      }

      expect(unmappedRequired.length, `${sheet.name} has unmapped required fields`).toBe(0);
      expect(result.skipped, `${sheet.name} skipped rows unexpectedly`).toBe(0);
    }

    const counts: Record<string, number> = {};
    for (const t of ['buildings', 'flats', 'residents', 'tenancies', 'ownerships', 'contacts', 'emergencyContacts', 'vehicles', 'parkingSpaces'] as const) {
      counts[t] = await (db as any)[t].count();
    }
    console.log('Final counts:', counts);
    expect(counts.buildings).toBe(1);
    expect(counts.flats).toBe(100);
    expect(counts.residents).toBe(100);

    const unlocatedResidents = (await db.residents.toArray()).filter((r: any) => !r.buildingId || !r.flatId);
    console.log('Residents still unlocated:', unlocatedResidents.length);
    expect(unlocatedResidents.length).toBe(0);
  });
});
