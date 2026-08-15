import { useRef, useState } from 'react';
import { db } from '@/lib/db';
import { Download, UploadCloud, Info, AlertTriangle } from 'lucide-react';
import { blobToBase64, base64ToBlob } from '@/lib/fileValidation';

// Bump this whenever the backup file's shape changes in a way that affects
// how restore should interpret it. Restore uses this to decide whether it
// can safely import a file (older backups are fine; newer/unknown ones are
// rejected rather than silently importing data restore doesn't understand).
const BACKUP_FORMAT_VERSION = 2;

const TABLES = [
  'buildings', 'flats', 'residents', 'bills', 'receipts', 'payments', 'settings',
  'depositTransactions', 'maintenanceRequests', 'expenses', 'reminders', 'documents',
] as const;

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
function validateBackupShape(data: unknown): string | null {
  if (!isPlainObject(data)) return 'This file is not a valid BuildingBill backup (not a JSON object).';
  if (typeof data.version !== 'number') return 'This file is missing a version number - it may not be a BuildingBill backup.';
  if (data.version > BACKUP_FORMAT_VERSION) {
    return `This backup was made with a newer version of BuildingBill (format v${data.version}, this app supports up to v${BACKUP_FORMAT_VERSION}). Update the app before restoring it.`;
  }
  for (const table of TABLES) {
    if (table in data && !Array.isArray((data as any)[table])) {
      return `The "${table}" section of this backup is corrupted (expected a list, got something else).`;
    }
  }
  return null;
}

export default function BackupRestore() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [confirming, setConfirming] = useState<{ data: Record<string, any[]>; counts: Record<string, number> } | null>(null);

  async function backupNow() {
    const data: Record<string, unknown> = {
      version: BACKUP_FORMAT_VERSION,
      exportedAt: new Date().toISOString(),
      appName: 'BuildingBill',
    };
    for (const table of TABLES) {
      const rows = await (db as any)[table].toArray();
      if (table === 'documents') {
        // JSON can't hold a Blob directly - encode each document's file as
        // base64 just for the backup file. Storage stays Blob-based day to
        // day; this conversion only happens at export/import time.
        data[table] = await Promise.all(
          rows.map(async (r: any) => ({ ...r, fileData: r.fileData instanceof Blob ? await blobToBase64(r.fileData) : r.fileData }))
        );
      } else {
        data[table] = rows;
      }
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buildingbill-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus({ kind: 'ok', message: 'Backup downloaded.' });
  }

  async function pickFile(file: File) {
    setStatus(null);
    if (!file.name.endsWith('.json')) {
      setStatus({ kind: 'error', message: 'Please upload a .json backup file.' });
      return;
    }
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      setStatus({ kind: 'error', message: 'Failed to read this file: it is not valid JSON.' });
      return;
    }
    const shapeError = validateBackupShape(data);
    if (shapeError) {
      setStatus({ kind: 'error', message: shapeError });
      return;
    }
    const obj = data as Record<string, any[]>;
    const counts: Record<string, number> = {};
    for (const table of TABLES) counts[table] = Array.isArray(obj[table]) ? obj[table].length : 0;
    setConfirming({ data: obj, counts });
  }

  async function confirmRestore() {
    if (!confirming) return;
    const { data } = confirming;
    try {
      // Atomic: every table is cleared and repopulated inside one Dexie
      // transaction. If anything fails partway through, Dexie rolls the
      // whole transaction back - you never end up with half-old,
      // half-new data.
      await db.transaction('rw', TABLES.map((t) => (db as any)[t]), async () => {
        for (const table of TABLES) {
          await (db as any)[table].clear();
        }
        for (const table of TABLES) {
          const rows = data[table];
          if (Array.isArray(rows) && rows.length > 0) {
            const toInsert = table === 'documents'
              ? rows.map((r: any) => ({ ...r, fileData: typeof r.fileData === 'string' ? base64ToBlob(r.fileData) : r.fileData }))
              : rows;
            await (db as any)[table].bulkAdd(toInsert);
          }
        }
      });
      setConfirming(null);
      setStatus({ kind: 'ok', message: 'Data restored successfully. Reloading...' });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setConfirming(null);
      setStatus({ kind: 'error', message: 'Restore failed partway through and was rolled back - your existing data is untouched. The backup file may be corrupted.' });
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="card p-6 space-y-3">
        <h3 className="font-semibold text-gray-800">Backup Data</h3>
        <p className="text-sm text-gray-500">Download a backup file of all your data — buildings, flats, residents, bills, receipts, payments, deposits, maintenance, expenses, reminders, and documents. You can restore it later on this or any device.</p>
        <button onClick={backupNow} className="btn-primary flex items-center gap-2"><Download size={16} /> Backup Now</button>
      </div>

      <div className="card p-6 space-y-3">
        <h3 className="font-semibold text-gray-800">Restore Data</h3>
        <p className="text-sm text-gray-500">Upload a previously backed-up file to restore your data. Current data will be replaced.</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}
          onClick={() => fileRef.current?.click()}
        >
          <UploadCloud className="mx-auto text-brand-500 mb-2" size={28} />
          <div className="text-sm text-gray-600">Click to upload or drag and drop</div>
          <div className="text-xs text-gray-400 mt-1">JSON file only</div>
          <button className="btn-secondary mt-3 text-sm" type="button">Browse File</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
        </div>
        {status && (
          <div className={`text-sm ${status.kind === 'error' ? 'text-red-500' : 'text-brand-700'}`}>{status.message}</div>
        )}
      </div>

      {confirming && (
        <div className="md:col-span-2 card p-6 border-amber-200 space-y-3">
          <div className="flex items-center gap-2 text-amber-600 font-medium">
            <AlertTriangle size={18} /> Confirm Restore
          </div>
          <p className="text-sm text-gray-600">
            This will permanently replace all current data with the contents of this backup. This cannot be undone
            (unless you have another, more recent backup). Here's what will be imported:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {TABLES.map((t) => (
              <div key={t} className="bg-gray-50 rounded-lg px-3 py-2">
                <div className="text-gray-400">{t}</div>
                <div className="font-semibold text-gray-800">{confirming.counts[t]}</div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={confirmRestore} className="btn-primary flex-1">Yes, Replace All Data</button>
            <button onClick={() => setConfirming(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      )}

      <div className="md:col-span-2 flex items-start gap-2 bg-brand-50 text-brand-700 text-sm rounded-xl p-4">
        <Info size={18} className="mt-0.5 shrink-0" />
        <div>All data is stored locally in your browser (IndexedDB). Please back up your data regularly to prevent data loss — clearing browser data or switching devices/browsers will lose unsaved data if not backed up.</div>
      </div>
    </div>
  );
}
