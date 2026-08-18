import { db } from '@/lib/db';
import type { AuditLogEntry } from '@/types';

/**
 * Appends one entry to the audit log. Never throws on its own - a logging
 * failure should never block the real operation it's recording. Call this
 * from *inside* the same Dexie transaction as the action being logged where
 * possible (pass db.auditLog in the transaction's table list) so the log
 * entry and the action it describes commit or roll back together.
 */
export async function logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'performedBy'>) {
  await db.auditLog.add({
    ...entry,
    timestamp: new Date().toISOString(),
    performedBy: 'Local User',
  });
}
