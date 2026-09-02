import { db } from '@/lib/db';
import { logAudit } from '@/lib/audit';
import { nextDisplayId, reserveDisplayId } from '@/lib/ids';
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

const TABLE_MAP: Record<ImportEntityKey, 'buildings' | 'flats' | 'residents' | 'expenses' | 'tenancies' | 'ownerships' | 'contacts' | 'emergencyContacts' | 'vehicles' | 'parkingSpaces'> = {
  buildings: 'buildings', flats: 'flats', residents: 'residents', expenses: 'expenses',
  tenancies: 'tenancies', ownerships: 'ownerships', contacts: 'contacts', emergencyContacts: 'emergencyContacts',
  vehicles: 'vehicles', parkingSpaces: 'parkingSpaces',
};

const ENTITY_AUDIT_TYPE: Record<ImportEntityKey, 'building' | 'flat' | 'resident' | 'expense' | 'tenancy' | 'ownership'> = {
  buildings: 'building', flats: 'flat', residents: 'resident', expenses: 'expense',
  tenancies: 'tenancy', ownerships: 'ownership', contacts: 'resident', emergencyContacts: 'resident',
  vehicles: 'resident', parkingSpaces: 'building',
};

// Entities whose DB record needs buildingId/flatId even though the import
// schema has no explicit Building/Unit column for them - those two fields
// are copied straight from the resolved resident instead (see commitImport).
const DERIVE_LOCATION_FROM_RESIDENT: Partial<Record<ImportEntityKey, true>> = {
  tenancies: true, ownerships: true, vehicles: true,
};

function refFieldTarget(fieldKey: string): string {
  if (fieldKey === 'buildingRef') return 'buildingId';
  if (fieldKey === 'flatRef') return 'flatId';
  if (fieldKey === 'residentRef') return 'residentId';
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
      if (['true', 'yes', 'y', '1', 'granted', 'approved', 'consented', 'agreed', 'on'].includes(s)) return { value: true };
      if (['false', 'no', 'n', '0', 'declined', 'denied', 'refused', 'off', 'not_asked', 'notasked'].includes(s)) return { value: false };
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
      // An optional field with a value that doesn't match any known option
      // (e.g. a real-world export using "Phone" where this app expects
      // "Mobile") is dropped rather than failing the whole row - it simply
      // wasn't important enough to require in the first place.
      if (!field.required) return { value: undefined };
      return { value: undefined, error: `must be one of: ${field.enumValues?.join(', ')}` };
    }
    default:
      return { value: cell };
  }
}

/** Builds one ProcessedRow per data row: coerced values + validation errors. Relationship fields are left unresolved here - see resolveBuildingRefs/resolveFlatRefs, run once distinct values across the whole sheet are known.
 *
 * `manualValues` supplies a single fixed value (as if it were a cell) for any field the person chose not to map to a column - either because the sheet has no matching column at all (required field, or an optional-but-important one like "Storage Included" they still want to set explicitly), or because they'd rather apply one value to every row than add a column. Manual values are looked up ahead of the sheet column for a field.
 */
/** Reads one field's cell for a row the same way the main loop does (mapped column, else manual value) - used to pull First/Middle/Last Name for name composition without duplicating that lookup logic. */
function readFieldCell(row: any[], key: string, mapping: Record<string, number>, manualValues?: Record<string, string>): any {
  const idx = mapping[key];
  if (idx != null && idx >= 0) return row[idx];
  const manual = manualValues?.[key];
  return manual !== undefined ? manual : '';
}

export function buildProcessedRows(
  def: ImportEntityDef,
  dataRows: any[][],
  mapping: Record<string, number>,
  manualValues?: Record<string, string>
): ProcessedRow[] {
  // A sheet that splits a person's name into First/Middle/Last/Preferred
  // columns (instead of one combined "Full Name" column) still satisfies
  // the required `name` field - it's composed from the parts below, per row,
  // whenever `name` itself has no mapped column or manual value.
  const hasNameParts = def.fields.some((f) => f.key === 'firstName') && def.fields.some((f) => f.key === 'name');

  return dataRows.map((row, rowIndex) => {
    const raw: Record<string, any> = {};
    const record: Record<string, any> = {};
    const errors: string[] = [];
    const refs: Record<string, RefResolution> = {};

    for (const field of def.fields) {
      const colIdx = mapping[field.key];
      const hasColumn = colIdx != null && colIdx >= 0;
      const manual = manualValues?.[field.key];
      // A real mapped column always wins over a manual value, even if both
      // happen to be set at once (the UI keeps them mutually exclusive, but
      // the engine itself shouldn't rely on that - a genuine column of data
      // is always more specific than a single fixed fallback value).
      let cell = hasColumn ? row[colIdx] : (manual !== undefined && manual !== '' ? manual : '');

      if (field.key === 'name' && hasNameParts && (cell === '' || cell === null || cell === undefined)) {
        const first = readFieldCell(row, 'firstName', mapping, manualValues);
        const middle = readFieldCell(row, 'middleName', mapping, manualValues);
        const last = readFieldCell(row, 'lastName', mapping, manualValues);
        const composed = [first, middle, last].map((v) => (v ?? '').toString().trim()).filter(Boolean).join(' ');
        if (composed) cell = composed;
      }

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

/** Distinct building-name values across all rows, each matched against existing buildings (or flagged unmatched). Keyed by normalizeHeader(raw name). Checks a building's own Source ID (externalId) first - far more reliable than matching by name, and what lets a workbook that links tabs by "Property ID" resolve correctly - then falls back to matching by name for files that only ever had a Building Name column. */
export async function resolveBuildingRefs(rows: ProcessedRow[]): Promise<Map<string, RefResolution>> {
  const existing = await db.buildings.toArray();
  const byName = new Map(existing.map((b) => [normalizeHeader(b.name), b]));
  const byExternalId = new Map(existing.filter((b) => b.externalId).map((b) => [normalizeHeader(b.externalId as string), b]));
  const distinct = new Map<string, RefResolution>();
  for (const row of rows) {
    const ref = row.refs['buildingRef'];
    if (!ref || !ref.raw) continue;
    const key = normalizeHeader(ref.raw);
    if (distinct.has(key)) continue;
    const match = byExternalId.get(key) ?? byName.get(key);
    distinct.set(key, match ? { raw: ref.raw, status: 'matched', matchedId: match.id } : { raw: ref.raw, status: 'unmatched' });
  }
  return distinct;
}

/** Distinct (building, unit) pairs, matched against existing flats scoped to that building. Rows whose building will be newly created can never match an existing flat, so those are reported separately as always-"create". Call AFTER building resolutions have been applied to rows via applyRefResolutions.
 *
 * A flat's own Source ID (externalId, e.g. "UNIT-0001") is checked first and
 * resolves independently of building - a workbook that links tabs by ID
 * (e.g. a Tenancy sheet's "Unit ID") doesn't need its own Building column at
 * all for this to work. Only when there's no externalId match does this fall
 * back to the building-scoped unit-number lookup used by simpler files.
 */
export async function resolveFlatRefs(rows: ProcessedRow[]): Promise<Map<string, RefResolution>> {
  const existing = await db.flats.toArray();
  const byKey = new Map(existing.map((f) => [`${f.buildingId}::${normalizeHeader(f.unitNo)}`, f]));
  const byExternalId = new Map(existing.filter((f) => f.externalId).map((f) => [normalizeHeader(f.externalId as string), f]));
  const distinct = new Map<string, RefResolution>();
  for (const row of rows) {
    const fRef = row.refs['flatRef'];
    if (!fRef || !fRef.raw) continue;

    const extKey = normalizeHeader(fRef.raw);
    const extMatch = byExternalId.get(extKey);
    if (extMatch) {
      if (!distinct.has(extKey)) distinct.set(extKey, { raw: fRef.raw, status: 'matched', matchedId: extMatch.id });
      continue;
    }

    const bRef = row.refs['buildingRef'];
    if (!bRef || !bRef.raw || bRef.status === 'unmatched') continue; // no building to scope by, and no ID match either
    if (bRef.status === 'create') continue; // brand-new building can't have an existing flat; always created together
    const key = `${bRef.matchedId}::${normalizeHeader(fRef.raw)}`;
    if (distinct.has(key)) continue;
    const match = byKey.get(key);
    distinct.set(key, match ? { raw: fRef.raw, status: 'matched', matchedId: match.id } : { raw: fRef.raw, status: 'unmatched' });
  }
  return distinct;
}

/** Distinct resident-name values across all rows, matched by normalized full name. Ambiguous only when two residents share the exact name - the person resolves that manually in the relationship step, same as an unmatched building/unit. Never offers "create new": a resident needs far more required information than any of these child tables provide. */
export async function resolveResidentRefs(rows: ProcessedRow[]): Promise<Map<string, RefResolution>> {
  const existing = await db.residents.toArray();
  const byName = new Map(existing.map((r) => [normalizeHeader(r.name), r]));
  const byExternalId = new Map(existing.filter((r) => r.externalId).map((r) => [normalizeHeader(r.externalId as string), r]));
  const distinct = new Map<string, RefResolution>();
  for (const row of rows) {
    const ref = row.refs['residentRef'];
    if (!ref || !ref.raw) continue;
    const key = normalizeHeader(ref.raw);
    if (distinct.has(key)) continue;
    const match = byExternalId.get(key) ?? byName.get(key);
    distinct.set(key, match ? { raw: ref.raw, status: 'matched', matchedId: match.id } : { raw: ref.raw, status: 'unmatched' });
  }
  return distinct;
}

/** Applies the user's confirmed choices for each distinct building/flat/resident value back onto every row.
 *
 * By default also turns any value still left unmatched into a row-level
 * error (`finalize: true`, the right behavior for an entity with only one
 * kind of reference, resolved in a single call). An entity with SEVERAL
 * reference types (e.g. Residents/Tenancies with Building + Unit + Resident)
 * goes through this function once per reference type, in separate wizard
 * steps - passing `finalize: false` on every one of those intermediate
 * calls is essential, or a reference that simply hasn't had its turn yet
 * (e.g. Unit, on the call that only just resolved Building) would be
 * wrongly flagged as permanently unmatched before it was ever attempted.
 * Call `finalizeRefErrors` once, after every applicable reference type has
 * been resolved, to do that check exactly once with the complete picture.
 */
export function applyRefResolutions(
  rows: ProcessedRow[],
  buildingResolutions: Map<string, RefResolution>,
  flatResolutions: Map<string, RefResolution>,
  residentResolutions?: Map<string, RefResolution>,
  options?: { finalize?: boolean }
) {
  for (const row of rows) {
    const bRef = row.refs['buildingRef'];
    if (bRef?.raw) {
      const resolved = buildingResolutions.get(normalizeHeader(bRef.raw));
      if (resolved) row.refs['buildingRef'] = resolved;
    }

    const fRef = row.refs['flatRef'];
    const bNow = row.refs['buildingRef'];
    if (fRef?.raw) {
      // A flat matched directly by its own Source ID (externalId) resolves
      // independently of building - try that first.
      const extResolved = flatResolutions.get(normalizeHeader(fRef.raw));
      if (extResolved) {
        row.refs['flatRef'] = extResolved;
      } else if (bNow?.raw) {
        if (bNow.status === 'matched') {
          const resolved = flatResolutions.get(`${bNow.matchedId}::${normalizeHeader(fRef.raw)}`);
          if (resolved) row.refs['flatRef'] = resolved;
        } else if (bNow.status === 'create') {
          row.refs['flatRef'] = { raw: fRef.raw, status: 'create' };
        }
      }
    }

    const rRef = row.refs['residentRef'];
    if (rRef?.raw && residentResolutions) {
      const resolved = residentResolutions.get(normalizeHeader(rRef.raw));
      if (resolved) row.refs['residentRef'] = resolved;
    }
  }

  if (options?.finalize ?? true) finalizeRefErrors(rows);
}

/** Turns any reference still left unmatched, across every reference field on every row, into a row-level error. Safe to call more than once - already-recorded messages are never duplicated. See applyRefResolutions for why this must run only once ALL applicable reference types for the entity have had their resolution step. */
export function finalizeRefErrors(rows: ProcessedRow[]) {
  for (const row of rows) {
    for (const [fieldKey, ref] of Object.entries(row.refs)) {
      if (ref.raw && ref.status === 'unmatched') {
        const label = fieldKey === 'buildingRef' ? 'Building' : fieldKey === 'flatRef' ? 'Unit' : 'Resident';
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
    await db.transaction(
      'rw',
      [db.buildings, db.flats, db.residents, db.expenses, db.auditLog, db.sequences,
       db.tenancies, db.ownerships, db.contacts, db.emergencyContacts, db.vehicles, db.parkingSpaces],
      async () => {
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
              const displayId = await nextDisplayId('buildings');
              id = (await db.buildings.add({ name: bRef.raw, address: '', totalFlats: 0, displayId })) as number;
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
              const displayId = await nextDisplayId('flats');
              id = (await db.flats.add({ buildingId: idOverrides.buildingRef, unitNo: fRef.raw, occupancyStatus: 'vacant', lifecycleStatus: 'active', displayId })) as number;
              flatCache.set(cacheKey, id);
            }
            idOverrides.flatRef = id;
          }
        }

        const rRef = row.refs['residentRef'];
        let matchedResident: any = undefined;
        if (rRef?.raw && rRef.status === 'matched' && rRef.matchedId) {
          idOverrides.residentRef = rRef.matchedId;
          matchedResident = await db.residents.get(rRef.matchedId);
        }

        const finalRecord = previewRecord(def, row);
        for (const [k, v] of Object.entries(idOverrides)) finalRecord[refFieldTarget(k)] = v;
        // Residents carry a denormalized unit label alongside flatId, same
        // convention used everywhere else in the app (see types/index.ts).
        if (def.key === 'residents' && fRef?.raw) finalRecord.unitLabel = fRef.raw;
        // Parking spaces may optionally be pre-assigned to a resident's unit.
        if (def.key === 'parkingSpaces' && matchedResident && finalRecord.flatId === undefined) {
          finalRecord.flatId = matchedResident.flatId;
        }
        // A row with its own resolved Unit but no Building column (common
        // once a sheet links tabs by ID - e.g. a Tenancy/Parking row that
        // gives a Unit ID but no separate Property ID) gets its building
        // straight from that unit - always more specific/reliable than
        // falling back to the resident below.
        if (finalRecord.buildingId === undefined && finalRecord.flatId !== undefined) {
          const flat = await db.flats.get(finalRecord.flatId);
          if (flat) finalRecord.buildingId = flat.buildingId;
        }
        // Tenancy/Ownership/Vehicle fall back to wherever the matched
        // resident already lives ONLY when still unknown at this point - a
        // sheet with its own Property ID/Unit ID (or one derived from Unit
        // ID above) always wins, since it's more specific than the
        // resident's on-file location.
        if (DERIVE_LOCATION_FROM_RESIDENT[def.key] && matchedResident) {
          if (finalRecord.buildingId === undefined) finalRecord.buildingId = matchedResident.buildingId;
          if (finalRecord.flatId === undefined) finalRecord.flatId = matchedResident.flatId;
        }
        // A resident imported from a sheet with no Building/Unit columns of
        // its own (e.g. a "People" tab, situated later by Tenancy/Ownership)
        // has no location yet. The first child row that both matches this
        // resident AND states its own building/unit backfills it onto the
        // resident record - a one-time correction, never overwriting a
        // location the resident already has.
        if (matchedResident && !matchedResident.buildingId && finalRecord.buildingId !== undefined && finalRecord.flatId !== undefined) {
          const flat = await db.flats.get(finalRecord.flatId);
          await db.residents.update(matchedResident.id, {
            buildingId: finalRecord.buildingId,
            flatId: finalRecord.flatId,
            unitLabel: flat?.unitNo ?? matchedResident.unitLabel,
          });
        }

        // Every entity gets a human-readable display ID (see lib/ids.ts).
        // If the sheet supplied its own ID (mapped to `externalId` for
        // buildings/flats/residents, or `displayId` for every other
        // entity - see schemas.ts), that exact value is used and the
        // entity's counter is bumped past it so future auto-generated IDs
        // never collide with it. Otherwise a new one is allocated.
        const sourceId: string | undefined = finalRecord.displayId || finalRecord.externalId || undefined;
        if (sourceId) {
          finalRecord.displayId = sourceId;
          await reserveDisplayId(def.key, sourceId);
        } else if (!row.duplicate || row.decision !== 'update') {
          // Only generate a brand-new ID for CREATE rows - an UPDATE row
          // with no ID of its own must never overwrite the existing
          // record's displayId, so `displayId` is simply left off the
          // partial update payload.
          finalRecord.displayId = await nextDisplayId(def.key);
        } else {
          delete finalRecord.displayId;
        }

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
