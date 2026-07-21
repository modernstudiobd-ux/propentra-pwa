import { useRef, useState } from 'react';
import { db } from '@/lib/db';
import { Download, UploadCloud, Info } from 'lucide-react';

export default function BackupRestore() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  async function backupNow() {
    const data = {
      version: 1,
      exportedAt: new Date().toISOString(),
      buildings: await db.buildings.toArray(),
      flats: await db.flats.toArray(),
      tenants: await db.tenants.toArray(),
      bills: await db.bills.toArray(),
      receipts: await db.receipts.toArray(),
      payments: await db.payments.toArray(),
      settings: await db.settings.toArray(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `buildingbill-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function restoreFromFile(file: File) {
    if (!file.name.endsWith('.json')) { setStatus('Please upload a .json backup file.'); return; }
    if (!confirm('Restoring will replace ALL current data. Continue?')) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await db.transaction('rw', [db.buildings, db.flats, db.tenants, db.bills, db.receipts, db.payments, db.settings], async () => {
        await Promise.all([
          db.buildings.clear(), db.flats.clear(), db.tenants.clear(),
          db.bills.clear(), db.receipts.clear(), db.payments.clear(), db.settings.clear(),
        ]);
        if (data.buildings) await db.buildings.bulkAdd(data.buildings);
        if (data.flats) await db.flats.bulkAdd(data.flats);
        if (data.tenants) await db.tenants.bulkAdd(data.tenants);
        if (data.bills) await db.bills.bulkAdd(data.bills);
        if (data.receipts) await db.receipts.bulkAdd(data.receipts);
        if (data.payments) await db.payments.bulkAdd(data.payments);
        if (data.settings) await db.settings.bulkAdd(data.settings);
      });
      setStatus('Data restored successfully. Reloading...');
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setStatus('Failed to restore: invalid or corrupted backup file.');
    }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="card p-6 space-y-3">
        <h3 className="font-semibold text-gray-800">Backup Data</h3>
        <p className="text-sm text-gray-500">Download a backup file of all your data. You can restore it later on this or any device.</p>
        <button onClick={backupNow} className="btn-primary flex items-center gap-2"><Download size={16} /> Backup Now</button>
      </div>

      <div className="card p-6 space-y-3">
        <h3 className="font-semibold text-gray-800">Restore Data</h3>
        <p className="text-sm text-gray-500">Upload a previously backed-up file to restore your data. Current data will be replaced.</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) restoreFromFile(f); }}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}
          onClick={() => fileRef.current?.click()}
        >
          <UploadCloud className="mx-auto text-brand-500 mb-2" size={28} />
          <div className="text-sm text-gray-600">Click to upload or drag and drop</div>
          <div className="text-xs text-gray-400 mt-1">JSON file only</div>
          <button className="btn-secondary mt-3 text-sm" type="button">Browse File</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) restoreFromFile(f); }} />
        </div>
        {status && <div className="text-sm text-brand-700">{status}</div>}
      </div>

      <div className="md:col-span-2 flex items-start gap-2 bg-brand-50 text-brand-700 text-sm rounded-xl p-4">
        <Info size={18} className="mt-0.5 shrink-0" />
        <div>All data is stored locally in your browser (IndexedDB). Please back up your data regularly to prevent data loss — clearing browser data or switching devices/browsers will lose unsaved data if not backed up.</div>
      </div>
    </div>
  );
}
