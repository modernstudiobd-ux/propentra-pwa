import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { normalizeHeader, type ImportEntityDef, type ImportEntityKey, type ImportFieldDef } from './schemas';

export type DuplicateDecision = 'skip' | 'update' | 'create';

export interface RefResolution {
  raw: string; // trimmed text value from the sheet
  status: 'matched' | 'create' | 'unmatched';
  matchedId?: number;
}

export interface ProcessedRow {
  rowIndex: number; // 0-based index into the sheet's data rows
  raw: Record<string, any>; // field key -> raw cell value, before coercion
  record: Record<string, any>; // coerced, non-relationship field values
  errors: string[];
  refs: Record<string, RefResolution>; // relationship fields only (buildingRef / flatRef)
  duplicate: { matchedId: number } | null;
  decision: DuplicateDecision; // only meaningful when `duplicate` is set
  included: boolean; // user can manually exclude a row from the preview
}

const TABLE_MAP: Record<ImportEntityKey, 'buildings' | 'flats' | 'residents' | 'expenses'> = {
  buildings: 'buildings', flats: 'flats', residents: 'residents', expenses: 'expenses',
};

const ENTITY_AUDIT_TYPE: Record<ImportEntityKey, 'building' | 'flat' | 'resident' | 'expense'> = {
  buildings: 'building', flats: 'flat', residents: 'resident', expenses: 'expense',
};

function refFieldTarget(fieldKey: string): string {
  if (fieldKey === 'buildingRef') return 'buildingId';
  if (fieldKey === 'flatRef') return 'flatId';
  return fieldKey;
}

// --- Step 1: coerce raw cells into typed field values, collecting errors ---

function coerceValue(cell: any, field: ImportFieldDef): { value: any; error?: string } {
  const isEmpty = cell === '' || cell === null || cell === undefined;
  if (isEmpty) {
    if (field.required) return { value: undefined, error: 'is required' };
    if (field.defaultValue !== undefined) return { value: field.defaultValue };
    return { value: field.type === 'string' ? '' : undefined };
  }

  switch (field.type) {
    case 'string':
      return { value: String(cell).trim() };
    case 'number': {
      const n = typeof cell === 'number' ? cell : Number(String(cell).replace(/[,$\s%]/g, ''));
      if (!Number.isFinite(n)) return { value: undefined, error: 'must be a number' };
      return { value: n };
    }
    case 'boolean': {
      if (typeof cell === 'boolean') return { value: cell };
      const s = String(cell).trim().toLowerCase();
      if (['true', 'yes', 'y', '1'].includes(s)) return { value: true };
      if (['false', 'no', 'n', '0'].includes(s)) return { value: false };
      return { value: undefined, error: 'must be Yes/No' };
    }
    case 'date': {
      const d = cell instanceof Date ? cell : new Date(String(cell));
      if (isNaN(d.getTime())) return { value: undefined, error: 'must be a valid date' };
      return { value: d.toISOString().slice(0, 10) };
    }
    case 'enum': {
      const s = String(cell).trim();
      const match = field.enumValues?.find((v) => v.toLowerCase() === s.toLowerCase());
      if (match) return { value: match };
      if (field.defaultValue !== undefined) return { value: field.defaultValue };
      return { value: undefined, error: `must be one of: ${field.enumValues?.join(', ')}` };
    }
    default:
      return { value: cell };
  }
}

/** Builds one ProcessedRow per data row: coerced values + validation errors. Relationship fields are left unresolved here - see resolveBuildingRefs/resolveFlatRefs, run once distinct values across the whole sheet are known. */
export function buildProcessedRows(
  def: ImportEntityDef,
  dataRows: any[][],
  mapping: Record<string, number>
): ProcessedRow[] {
  return dataRows.map((row, rowIndex) => {
    const raw: Record<string, any> = {};
    const record: Record<string, any> = {};
    const errors: string[] = [];
    const refs: Record<string, RefResolution> = {};

    for (const field of def.fields) {
      const colIdx = mapping[field.key];
      const cell = colIdx == null || colIdx < 0 ? '' : row[colIdx];
      raw[field.key] = cell;

      if (field.refEntity) {
        const text = cell === null || cell === undefined ? '' : String(cell).trim();
        if (!text && field.required) errors.push(`"${field.label}" is required.`);
        refs[field.key] = { raw: text, status: 'unmatched' };
        continue;
      }

      const { value, error } = coerceValue(cell, field);
      if (error) errors.push(`"${field.label}" ${error}.`);
      else record[field.key] = value;
    }

    return { rowIndex, raw, record, errors, refs, duplicate: null, decision: 'create', included: true };
  });
}

// --- Step 2: relationship resolution -----------------------------------

/** Distinct building-name values across all rows, each matched against existing buildings (or flagged unmatched). Keyed by normalizeHeader(raw name). */
export async function resolveBuildingRefs(rows: ProcessedRow[]): Promise<Map<string, RefResolution>> {
  const existing = await db.buildings.toArray();
  const byName = new Map(existing.map((b) => [normalizeHeader(b.name), b]));
  const distinct = new Map<string, RefResolution>();
  for (const row of rows) {
    const ref = row.refs['buildingRef'];
    if (!ref || !ref.raw) continue;
    const key = normalizeHeader(ref.raw);
    if (distinct.has(key)) continue;
    const match = byName.get(key);
    distinct.set(key, match ? { raw: ref.raw, status: 'matched', matchedId: match.id } : { raw: ref.raw, status: 'unmatched' });
  }
  return distinct;
}

/** Distinct (building, unit) pairs, matched against existing flats scoped to that building. Rows whose building will be newly created can never match an existing flat, so those are reported separately as always-"create". Call AFTER building resolutions have been applied to rows via applyRefResolutions. */
export async function resolveFlatRefs(rows: ProcessedRow[]): Promise<Map<string, RefResolution>> {
  const existing = await db.flats.toArray();
  const byKey = new Map(existing.map((f) => [`${f.buildingId}::${normalizeHeader(f.unitNo)}`, f]));
  const distinct = new Map<string, RefResolution>();
  for (const row of rows) {
    const fRef = row.refs['flatRef'];
    const bRef = row.refs['buildingRef'];
    if (!fRef || !fRef.raw) continue;
    if (!bRef || bRef.status === 'unmatched') continue; // building unresolved - row already carries an error
    if (bRef.status === 'create') continue; // brand-new building can't have an existing flat; always created together
    const key = `${bRef.matchedId}::${normalizeHeader(fRef.raw)}`;
    if (distinct.has(key)) continue;
    const match = byKey.get(key);
    distinct.set(key, match ? { raw: fRef.raw, status: 'matched', matchedId: match.id } : { raw: fRef.raw, status: 'unmatched' });
  }
  return distinct;
}

/** Applies the user's confirmed choices for each distinct building/flat value back onto every row, and turns any value still left unmatched into a row-level error. */
export function applyRefResolutions(
  rows: ProcessedRow[],
  buildingResolutions: Map<string, RefResolution>,
  flatResolutions: Map<string, RefResolution>
) {
  for (const row of rows) {
    const bRef = row.refs['buildingRef'];
    if (bRef?.raw) {
      const resolved = buildingResolutions.get(normalizeHeader(bRef.raw));
      if (resolved) row.refs['buildingRef'] = resolved;
    }

    const fRef = row.refs['flatRef'];
    const bNow = row.refs['buildingRef'];
    if (fRef?.raw && bNow?.raw) {
      if (bNow.status === 'matched') {
        const resolved = flatResolutions.get(`${bNow.matchedId}::${normalizeHeader(fRef.raw)}`);
        if (resolved) row.refs['flatRef'] = resolved;
      } else if (bNow.status === 'create') {
        row.refs['flatRef'] = { raw: fRef.raw, status: 'create' };
      }
    }

    for (const [fieldKey, ref] of Object.entries(row.refs)) {
      if (ref.raw && ref.status === 'unmatched') {
        const label = fieldKey === 'buildingRef' ? 'Building' : 'Unit';
        const msg = `Could not match ${label} "${ref.raw}" to an existing record.`;
        if (!row.errors.includes(msg)) row.errors.push(msg);
      }
    }
  }
}

// --- Step 3: duplicate detection ----------------------------------------

/** Merges coerced field values with resolved relationship ids (matched ones only - "create" refs have no id yet at preview time, which correctly means such a row can never look like a duplicate of something that doesn't exist). */
function previewRecord(def: ImportEntityDef, row: ProcessedRow): Record<string, any> {
  const out: Record<string, any> = { ...row.record };
  for (const field of def.fields) {
    if (!field.refEntity) continue;
    const ref = row.refs[field.key];
    if (ref?.status === 'matched') out[refFieldTarget(field.key)] = ref.matchedId;
  }
  return out;
}

export async function detectDuplicates(def: ImportEntityDef, rows: ProcessedRow[]) {
  const tableName = TABLE_MAP[def.key];
  const existingRows: any[] = await (db as any)[tableName].toArray();
  const indices = def.matchKeyGroups.map((group) => {
    const idx = new Map<string, number>();
    for (const r of existingRows) {
      if (group.every((k) => r[k] !== undefined && r[k] !== '' && r[k] !== null)) {
        idx.set(group.map((k) => normalizeHeader(String(r[k]))).join('||'), r.id);
      }
    }
    return { group, idx };
  });

  for (const row of rows) {
    row.duplicate = null;
    if (row.errors.length) continue;
    const full = previewRecord(def, row);
    for (const { group, idx } of indices) {
      if (group.every((k) => full[k] !== undefined && full[k] !== '' && full[k] !== null)) {
        const key = group.map((k) => normalizeHeader(String(full[k]))).join('||');
        const id = idx.get(key);
        if (id !== undefined) { row.duplicate = { matchedId: id }; break; }
      }
    }
  }
}

// --- Step 4: rollback-safe commit ---------------------------------------

export class ImportRollbackError extends Error {}

export interface ImportRunResult {
  created: number;
  updated: number;
  skipped: number;
  rowResults: { rowIndex: number; status: 'created' | 'updated' | 'skipped'; message?: string }[];
}

/**
 * Writes every included, error-free row inside a single Dexie transaction -
 * along with any building/flat records auto-created to satisfy relationship
 * references. If anything fails partway through, Dexie rolls the whole
 * transaction back and nothing is saved (same guarantee as Backup Restore).
 */
export async function commitImport(def: ImportEntityDef, rows: ProcessedRow[]): Promise<ImportRunResult> {
  const tableName = TABLE_MAP[def.key];
  const rowResults: ImportRunResult['rowResults'] = [];
  let created = 0, updated = 0, skipped = 0;

  const buildingCache = new Map<string, number>(); // normalized name -> id, created earlier in THIS run
  const flatCache = new Map<string, number>(); // `${buildingId}::${normalizedUnit}` -> id, created earlier in THIS run

  try {
    await db.transaction('rw', db.buildings, db.flats, db.residents, db.expenses, db.auditLog, async () => {
      for (const row of rows) {
        if (!row.included || row.errors.length > 0) {
          skipped++;
          rowResults.push({ rowIndex: row.rowIndex, status: 'skipped', message: row.errors[0] || 'Excluded from import' });
          continue;
        }
        if (row.duplicate && row.decision === 'skip') {
          skipped++;
          rowResults.push({ rowIndex: row.rowIndex, status: 'skipped', message: 'Duplicate of an existing record' });
          continue;
        }

        const idOverrides: Record<string, number> = {};

        const bRef = row.refs['buildingRef'];
        if (bRef?.raw) {
          if (bRef.status === 'matched' && bRef.matchedId) {
            idOverrides.buildingRef = bRef.matchedId;
          } else if (bRef.status === 'create') {
            const cacheKey = normalizeHeader(bRef.raw);
            let id = buildingCache.get(cacheKey);
            if (id === undefined) {
              id = (await db.buildings.add({ name: bRef.raw, address: '', totalFlats: 0 })) as number;
              buildingCache.set(cacheKey, id);
            }
            idOverrides.buildingRef = id;
          }
        }

        const fRef = row.refs['flatRef'];
        if (fRef?.raw) {
          if (fRef.status === 'matched' && fRef.matchedId) {
            idOverrides.flatRef = fRef.matchedId;
          } else if (idOverrides.buildingRef) {
            const cacheKey = `${idOverrides.buildingRef}::${normalizeHeader(fRef.raw)}`;
            let id = flatCache.get(cacheKey);
            if (id === undefined) {
              id = (await db.flats.add({ buildingId: idOverrides.buildingRef, unitNo: fRef.raw, status: 'vacant' })) as number;
              flatCache.set(cacheKey, id);
            }
            idOverrides.flatRef = id;
          }
        }

        const finalRecord = previewRecord(def, row);
        for (const [k, v] of Object.entries(idOverrides)) finalRecord[refFieldTarget(k)] = v;
        // Residents carry a denormalized unit label alongside flatId, same
        // convention used everywhere else in the app (see types/index.ts).
        if (def.key === 'residents' && fRef?.raw) finalRecord.unitLabel = fRef.raw;

        if (row.duplicate && row.decision === 'update') {
          await (db as any)[tableName].update(row.duplicate.matchedId, finalRecord);
          updated++;
          rowResults.push({ rowIndex: row.rowIndex, status: 'updated' });
        } else {
          await (db as any)[tableName].add(finalRecord);
          created++;
          rowResults.push({ rowIndex: row.rowIndex, status: 'created' });
        }
      }

      await logAudit({
        action: 'data_imported',
        entityType: ENTITY_AUDIT_TYPE[def.key],
        summary: `Imported ${def.label} from file: ${created} created, ${updated} updated, ${skipped} skipped.`,
      });
    });
  } catch (e: any) {
    throw new ImportRollbackError(
      e instanceof ImportRollbackError ? e.message : (e?.message || 'Import failed partway through and was rolled back - no changes were saved.')
    );
  }

  return { created, updated, skipped, rowResults };
}
