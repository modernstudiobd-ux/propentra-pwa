import { db } from '@/lib/db';
import { blobToBase64, base64ToBlob } from '@/lib/fileValidation';
import { logAudit } from '@/lib/audit';

// Bump this whenever the backup file's shape changes in a way that affects
// how restore should interpret it. Restore uses this to decide whether it
// can safely import a file (older backups are fine; newer/unknown ones are
// rejected rather than silently importing data restore doesn't understand).
export const BACKUP_FORMAT_VERSION = 3;

export const TABLES = [
  'buildings', 'flats', 'residents', 'bills', 'receipts', 'payments', 'settings',
  'depositTransactions', 'maintenanceRequests', 'expenses', 'reminders', 'documents', 'auditLog',
] as const;

export type TableName = (typeof TABLES)[number];

// Tables whose records carry a Blob field that must round-trip through
// base64 for JSON compatibility, and the field name to convert.
export const BLOB_FIELDS: Partial<Record<TableName, string>> = {
  documents: 'fileData',
  residents: 'idDocumentBlob',
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Validates the overall shape of a backup file before touching the
 * database at all: right format version, and every table present is
 * actually an array of plain objects. This is intentionally not deep
 * per-record validation (a backup is trusted data you made yourself) - it's
 * a guard against corrupted files, wrong file types, and future format
 * changes, not a full schema validator.
 */
export function validateBackupShape(data: unknown): string | null {
  if (!isPlainObject(data)) return 'This file is not a valid Propentra backup (not a JSON object).';
  if (typeof data.version !== 'number') return 'This file is missing a version number - it may not be a Propentra backup.';
  if (data.version > BACKUP_FORMAT_VERSION) {
    return `This backup was made with a newer version of Propentra (format v${data.version}, this app supports up to v${BACKUP_FORMAT_VERSION}). Update the app before restoring it.`;
  }
  for (const table of TABLES) {
    if (table in data && !Array.isArray((data as any)[table])) {
      return `The "${table}" section of this backup is corrupted (expected a list, got something else).`;
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

/** Counts how many records each table in a (shape-validated) backup payload contains. */
export function countBackupRows(data: Record<string, any>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) counts[table] = Array.isArray(data[table]) ? data[table].length : 0;
  return counts;
}

/**
 * Atomically clears every table and repopulates it from a (shape-validated)
 * backup payload, converting base64 back to Blobs where needed. Either
 * everything commits or - on any failure partway through - Dexie rolls the
 * whole transaction back, so existing data is never left half-replaced.
 * Logs a fresh audit entry for the restore itself once the transaction
 * (including the restored auditLog rows) has committed.
 */
export async function restoreFromBackupData(data: Record<string, any>): Promise<Record<string, number>> {
  const importedCounts: Record<string, number> = {};
  await db.transaction('rw', TABLES.map((t) => (db as any)[t]), async () => {
    for (const table of TABLES) {
      await (db as any)[table].clear();
    }
    for (const table of TABLES) {
      const rows = data[table];
      const blobField = BLOB_FIELDS[table];
      if (Array.isArray(rows) && rows.length > 0) {
        const toInsert = blobField
          ? rows.map((r: any) => ({ ...r, [blobField]: typeof r[blobField] === 'string' ? base64ToBlob(r[blobField]) : r[blobField] }))
          : rows;
        await (db as any)[table].bulkAdd(toInsert);
      }
      importedCounts[table] = Array.isArray(rows) ? rows.length : 0;
    }
    await logAudit({
      action: 'restore_performed', entityType: 'backup',
      summary: `Data restored from backup (${TABLES.map((t) => `${t}: ${importedCounts[t]}`).join(', ')})`,
    });
  });
  return importedCounts;
}
