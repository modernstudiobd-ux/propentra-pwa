import { db } from '@/lib/db';
import { blobToBase64, base64ToBlob } from '@/lib/fileValidation';
import { logAudit } from '@/lib/audit';

// Bump this whenever the backup file's shape changes in a way that affects
// how restore should interpret it. Restore uses this to decide whether it
// can safely import a file (older backups are fine; newer/unknown ones are
// rejected rather than silently importing data restore doesn't understand).
export const BACKUP_FORMAT_VERSION = 5;

export const TABLES = [
  'buildings', 'flats', 'residents', 'bills', 'receipts', 'payments', 'settings',
  'depositTransactions', 'maintenanceRequests', 'expenses', 'reminders', 'documents', 'auditLog',
  'importTemplates', 'tenancies', 'ownerships', 'contacts', 'emergencyContacts', 'vehicles', 'parkingSpaces',
] as const;

export type TableName = (typeof TABLES)[number];

// Tables whose records carry a Blob field that must round-trip through
// base64 for JSON compatibility, and the field name to convert.
export const BLOB_FIELDS: Partial<Record<TableName, string>> = {
  documents: 'fileData',
  residents: 'idDocumentBlob',
};

// The backup format version each table first appeared in. Used to tell the
// difference between "this table is legitimately absent because the backup
// predates it" (safe - leave the table untouched on restore) and "this
// table SHOULD be here for a backup of this version but isn't" (corrupted
// or tampered file - reject the whole restore before touching anything).
const TABLE_INTRODUCED_IN: Record<TableName, number> = {
  buildings: 1, flats: 1, residents: 1, bills: 1, receipts: 1, payments: 1, settings: 1,
  depositTransactions: 1, maintenanceRequests: 1, expenses: 1, reminders: 1,
  documents: 2,
  auditLog: 3,
  importTemplates: 4,
  tenancies: 5, ownerships: 5, contacts: 5, emergencyContacts: 5, vehicles: 5, parkingSpaces: 5,
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Upgrades records from older backup format versions to the CURRENT field
 * shape before validation/restore ever sees them - mirrors the equivalent
 * db.ts upgrade() logic, but for a backup FILE being restored rather than
 * the live database. Without this, restoring a pre-v5 backup would insert
 * flats with the old `status` field and no `occupancyStatus`, breaking
 * every screen that now reads the new field. Mutates and returns the same
 * object; safe to call on already-current-format data (it's a no-op then).
 */
export function normalizeLegacyBackupRecords(data: Record<string, any>): Record<string, any> {
  if (Array.isArray(data.flats)) {
    data.flats = data.flats.map((f: any) => {
      if (f.occupancyStatus === undefined && f.status !== undefined) {
        const { status, ...rest } = f;
        return { ...rest, occupancyStatus: status === 'occupied' ? 'occupied' : 'vacant', lifecycleStatus: f.lifecycleStatus ?? 'active' };
      }
      return f;
    });
  }
  if (Array.isArray(data.documents)) {
    data.documents = data.documents.map((d: any) => {
      if (d.linkType === 'resident' && d.linkId && d.residentId === undefined) return { ...d, residentId: d.linkId };
      if (d.linkType === 'flat' && d.linkId && d.flatId === undefined) return { ...d, flatId: d.linkId };
      return d;
    });
  }
  return data;
}

/**
 * Validates the overall shape of a backup file before touching the
 * database at all: right format version, and every table that SHOULD be
 * present for that version actually is (as an array). A table that's
 * absent only because it postdates the backup's version is fine and left
 * alone - see restoreFromBackupData, which never clears a table the
 * backup doesn't include.
 */
export function validateBackupShape(data: unknown): string | null {
  if (!isPlainObject(data)) return 'This file is not a valid Propentra backup (not a JSON object).';
  if (typeof data.version !== 'number') return 'This file is missing a version number - it may not be a Propentra backup.';
  if (data.version > BACKUP_FORMAT_VERSION) {
    return `This backup was made with a newer version of Propentra (format v${data.version}, this app supports up to v${BACKUP_FORMAT_VERSION}). Update the app before restoring it.`;
  }
  for (const table of TABLES) {
    const present = table in data;
    if (present && !Array.isArray((data as any)[table])) {
      return `The "${table}" section of this backup is corrupted (expected a list, got something else).`;
    }
    if (!present && TABLE_INTRODUCED_IN[table] <= data.version) {
      return `This backup claims to be format v${data.version} but is missing its "${table}" data. The file is likely incomplete or corrupted - restoring has been stopped before touching your data.`;
    }
  }
  return null;
}

// --- Deep per-record validation ---------------------------------------------
// Shape validation only checks that each table is *an array*. Before ever
// touching the database, we also spot-check that individual records look
// like real records of that type - catching a corrupted file, a backup from
// an unrelated app, or a hand-edited/tampered JSON file - rather than
// discovering the problem midway through a bulkAdd().

type FieldCheck = { field: string; check: (v: unknown) => boolean; label: string };

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isString = (v: unknown): v is string => typeof v === 'string';
const oneOf = (...opts: string[]) => (v: unknown) => typeof v === 'string' && opts.includes(v);

const RECORD_CHECKS: Partial<Record<TableName, FieldCheck[]>> = {
  buildings: [
    { field: 'name', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'totalFlats', check: isFiniteNumber, label: 'a number' },
  ],
  flats: [
    { field: 'buildingId', check: isFiniteNumber, label: 'a number' },
    { field: 'unitNo', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'occupancyStatus', check: oneOf('occupied', 'vacant'), label: '"occupied" or "vacant"' },
  ],
  residents: [
    { field: 'name', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'flatId', check: isFiniteNumber, label: 'a number' },
    { field: 'buildingId', check: isFiniteNumber, label: 'a number' },
    { field: 'type', check: oneOf('Tenant', 'Owner'), label: '"Tenant" or "Owner"' },
    { field: 'status', check: oneOf('current', 'former'), label: '"current" or "former"' },
  ],
  bills: [
    { field: 'invoiceNo', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'buildingId', check: isFiniteNumber, label: 'a number' },
    { field: 'flatId', check: isFiniteNumber, label: 'a number' },
    { field: 'residentId', check: isFiniteNumber, label: 'a number' },
    { field: 'totalAmount', check: isFiniteNumber, label: 'a number' },
    { field: 'paidAmount', check: isFiniteNumber, label: 'a number' },
    { field: 'status', check: oneOf('unpaid', 'partial', 'paid'), label: '"unpaid", "partial" or "paid"' },
  ],
  receipts: [
    { field: 'receiptNo', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'invoiceId', check: isFiniteNumber, label: 'a number' },
    { field: 'residentId', check: isFiniteNumber, label: 'a number' },
    { field: 'amountReceived', check: isFiniteNumber, label: 'a number' },
  ],
  payments: [
    { field: 'invoiceId', check: isFiniteNumber, label: 'a number' },
    { field: 'residentId', check: isFiniteNumber, label: 'a number' },
    { field: 'amount', check: isFiniteNumber, label: 'a number' },
    { field: 'type', check: oneOf('Full', 'Partial'), label: '"Full" or "Partial"' },
  ],
  settings: [
    { field: 'companyName', check: isString, label: 'a string' },
    { field: 'defaultRates', check: (v) => isPlainObject(v), label: 'an object' },
  ],
  depositTransactions: [
    { field: 'residentId', check: isFiniteNumber, label: 'a number' },
    { field: 'buildingId', check: isFiniteNumber, label: 'a number' },
    { field: 'flatId', check: isFiniteNumber, label: 'a number' },
    { field: 'type', check: oneOf('collected', 'applied', 'refunded', 'adjustment'), label: 'a valid deposit type' },
    { field: 'amount', check: isFiniteNumber, label: 'a number' },
  ],
  maintenanceRequests: [
    { field: 'buildingId', check: isFiniteNumber, label: 'a number' },
    { field: 'title', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'priority', check: oneOf('low', 'medium', 'high', 'urgent'), label: 'a valid priority' },
    { field: 'status', check: oneOf('open', 'in_progress', 'completed', 'cancelled'), label: 'a valid status' },
  ],
  expenses: [
    { field: 'buildingId', check: isFiniteNumber, label: 'a number' },
    { field: 'category', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'amount', check: isFiniteNumber, label: 'a number' },
  ],
  reminders: [
    { field: 'title', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'dueDate', check: isNonEmptyString, label: 'a date string' },
    { field: 'priority', check: oneOf('low', 'medium', 'high'), label: 'a valid priority' },
    { field: 'status', check: oneOf('pending', 'done', 'dismissed'), label: 'a valid status' },
    { field: 'linkType', check: oneOf('building', 'flat', 'resident', 'none'), label: 'a valid link type' },
  ],
  documents: [
    { field: 'title', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'category', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'fileName', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'fileType', check: isNonEmptyString, label: 'a non-empty string' },
  ],
  auditLog: [
    { field: 'action', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'entityType', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'summary', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'timestamp', check: isNonEmptyString, label: 'a non-empty string' },
  ],
  importTemplates: [
    { field: 'name', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'entity', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'mapping', check: (v) => isPlainObject(v), label: 'an object' },
  ],
  tenancies: [
    { field: 'residentId', check: isFiniteNumber, label: 'a number' },
    { field: 'flatId', check: isFiniteNumber, label: 'a number' },
    { field: 'buildingId', check: isFiniteNumber, label: 'a number' },
    { field: 'monthlyRent', check: isFiniteNumber, label: 'a number' },
    { field: 'leaseStart', check: isNonEmptyString, label: 'a date string' },
  ],
  ownerships: [
    { field: 'residentId', check: isFiniteNumber, label: 'a number' },
    { field: 'flatId', check: isFiniteNumber, label: 'a number' },
    { field: 'buildingId', check: isFiniteNumber, label: 'a number' },
    { field: 'ownershipPct', check: isFiniteNumber, label: 'a number' },
  ],
  contacts: [
    { field: 'residentId', check: isFiniteNumber, label: 'a number' },
    { field: 'name', check: isNonEmptyString, label: 'a non-empty string' },
  ],
  emergencyContacts: [
    { field: 'residentId', check: isFiniteNumber, label: 'a number' },
    { field: 'name', check: isNonEmptyString, label: 'a non-empty string' },
    { field: 'phone', check: isNonEmptyString, label: 'a non-empty string' },
  ],
  vehicles: [
    { field: 'residentId', check: isFiniteNumber, label: 'a number' },
    { field: 'plate', check: isNonEmptyString, label: 'a non-empty string' },
  ],
  parkingSpaces: [
    { field: 'buildingId', check: isFiniteNumber, label: 'a number' },
    { field: 'spaceNumber', check: isNonEmptyString, label: 'a non-empty string' },
  ],
};

/**
 * Deep, per-record validation - run after validateBackupShape passes, still
 * before any database write. Only checks tables actually present in the
 * file (shape validation already guarantees any table required by the
 * declared version is present). Returns a description of the first invalid
 * record found, or null if everything checked out.
 */
export function validateBackupRecords(data: Record<string, unknown>): string | null {
  for (const table of TABLES) {
    const rows = (data as any)[table];
    if (!Array.isArray(rows)) continue; // not included in this backup - nothing to check
    const checks = RECORD_CHECKS[table];
    if (!checks) continue;
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!isPlainObject(row)) return `Record ${i + 1} in "${table}" is corrupted (expected an object, got something else).`;
      for (const c of checks) {
        if (!c.check(row[c.field])) {
          return `Record ${i + 1} in "${table}" has an invalid "${c.field}" field (must be ${c.label}). Restoring has been stopped before touching your data.`;
        }
      }
    }
  }
  return null;
}

/** Reads every table into a JSON-serializable snapshot (Blobs -> base64). */
export async function buildBackupData(): Promise<{ data: Record<string, unknown>; counts: Record<string, number> }> {
  const data: Record<string, unknown> = {
    version: BACKUP_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appName: 'Propentra',
  };
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const rows = await (db as any)[table].toArray();
    counts[table] = rows.length;
    const blobField = BLOB_FIELDS[table];
    if (blobField) {
      data[table] = await Promise.all(
        rows.map(async (r: any) => ({
          ...r,
          [blobField]: r[blobField] instanceof Blob ? await blobToBase64(r[blobField]) : r[blobField],
        }))
      );
    } else {
      data[table] = rows;
    }
  }
  return { data, counts };
}

/** Counts how many records each table in a (shape-validated) backup payload contains. Tables not present in the file report 0 - use describeBackupTables() to tell that apart from "genuinely zero records". */
export function countBackupRows(data: Record<string, any>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) counts[table] = Array.isArray(data[table]) ? data[table].length : 0;
  return counts;
}

export interface TableBackupStatus { included: boolean; count: number }

/** Per-table breakdown for the restore confirmation screen: whether the table is included in this backup at all (and will be replaced), vs. missing (and will be left completely untouched). */
export function describeBackupTables(data: Record<string, any>): Record<TableName, TableBackupStatus> {
  const out = {} as Record<TableName, TableBackupStatus>;
  for (const table of TABLES) {
    const included = Array.isArray(data[table]);
    out[table] = { included, count: included ? data[table].length : 0 };
  }
  return out;
}

/**
 * Atomically clears and repopulates ONLY the tables actually present in a
 * (shape- and record-validated) backup payload, converting base64 back to
 * Blobs where needed. A table that's absent from the file (e.g. an older
 * backup taken before that table existed) is never cleared and never
 * touched - its existing data survives the restore untouched. Either
 * everything commits or - on any failure partway through - Dexie rolls the
 * whole transaction back, so existing data is never left half-replaced.
 * Logs a fresh audit entry for the restore itself once the transaction
 * (including the restored auditLog rows) has committed.
 */
export async function restoreFromBackupData(data: Record<string, any>): Promise<Record<string, number>> {
  const importedCounts: Record<string, number> = {};
  const presentTables = TABLES.filter((t) => Array.isArray(data[t]));
  const skippedTables = TABLES.filter((t) => !presentTables.includes(t));

  await db.transaction('rw', TABLES.map((t) => (db as any)[t]), async () => {
    for (const table of presentTables) {
      await (db as any)[table].clear();
    }
    for (const table of presentTables) {
      const rows = data[table];
      const blobField = BLOB_FIELDS[table];
      if (rows.length > 0) {
        const toInsert = blobField
          ? rows.map((r: any) => ({ ...r, [blobField]: typeof r[blobField] === 'string' ? base64ToBlob(r[blobField]) : r[blobField] }))
          : rows;
        await (db as any)[table].bulkAdd(toInsert);
      }
      importedCounts[table] = rows.length;
    }
    // Logged as a fresh entry *after* the restored auditLog rows are in
    // place, so it lands as the newest event rather than being wiped by
    // the very clear() this restore just performed.
    await logAudit({
      action: 'restore_performed', entityType: 'backup',
      summary: `Data restored from backup (${presentTables.map((t) => `${t}: ${importedCounts[t]}`).join(', ')})`
        + (skippedTables.length ? `. Not included in this backup (left untouched): ${skippedTables.join(', ')}.` : ''),
    });
  });
  return importedCounts;
}
