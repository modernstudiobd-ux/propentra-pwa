import { useRef, useState } from 'react';
import { Download, UploadCloud, Info, AlertTriangle } from 'lucide-react';
import { logAudit } from '@/lib/audit';
import {
  TABLES, validateBackupShape, buildBackupData, countBackupRows, restoreFromBackupData,
} from '@/lib/backup';

export default function BackupRestore() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [confirming, setConfirming] = useState<{ data: Record<string, any[]>; counts: Record<string, number> } | null>(null);

  async function backupNow() {
    const { data, counts } = await buildBackupData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buildingbill-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    await logAudit({
      action: 'backup_created', entityType: 'backup',
      summary: `Backup downloaded (${TABLES.map((t) => `${t}: ${counts[t]}`).join(', ')})`,
    });
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
    setConfirming({ data: obj, counts: countBackupRows(obj) });
  }

  async function confirmRestore() {
    if (!confirming) return;
    try {
      // Atomic: every table is cleared and repopulated inside one Dexie
      // transaction. If anything fails partway through, Dexie rolls the
      // whole transaction back - you never end up with half-old,
      // half-new data.
      await restoreFromBackupData(confirming.data);
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
