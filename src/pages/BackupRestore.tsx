import { useRef, useState } from 'react';
import { Download, UploadCloud, Info, AlertTriangle, Lock, KeyRound } from 'lucide-react';
import { logAudit } from '@/lib/audit';
import {
  TABLES, validateBackupShape, validateBackupRecords, buildBackupData, describeBackupTables,
  restoreFromBackupData, type TableName, type TableBackupStatus,
} from '@/lib/backup';
import { encryptText, decryptText, isEncryptedEnvelope, DecryptionError, type EncryptedEnvelope } from '@/lib/crypto';

export default function BackupRestore() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; message: string } | null>(null);
  const [confirming, setConfirming] = useState<{ data: Record<string, any[]>; tables: Record<TableName, TableBackupStatus> } | null>(null);

  // Backup export - optional password encryption
  const [encryptEnabled, setEncryptEnabled] = useState(false);
  const [encryptPassword, setEncryptPassword] = useState('');
  const [encryptConfirm, setEncryptConfirm] = useState('');
  const [backupError, setBackupError] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);

  // Restore import - password prompt for encrypted files
  const [passwordPrompt, setPasswordPrompt] = useState<{ envelope: EncryptedEnvelope } | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);

  async function backupNow() {
    setBackupError('');
    if (encryptEnabled) {
      if (!encryptPassword) { setBackupError('Enter a password to encrypt this backup.'); return; }
      if (encryptPassword.length < 6) { setBackupError('Use a password of at least 6 characters.'); return; }
      if (encryptPassword !== encryptConfirm) { setBackupError('Passwords do not match.'); return; }
    }
    setBackupBusy(true);
    try {
      const { data, counts } = await buildBackupData();
      const json = JSON.stringify(data, null, 2);
      const payload = encryptEnabled ? JSON.stringify(await encryptText(json, encryptPassword)) : json;
      const blob = new Blob([payload], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `propentra-backup-${new Date().toISOString().slice(0, 10)}${encryptEnabled ? '-encrypted' : ''}.json`;
      a.click();
      URL.revokeObjectURL(url);
      await logAudit({
        action: 'backup_created', entityType: 'backup',
        summary: `Backup downloaded${encryptEnabled ? ' (password-encrypted)' : ''} (${TABLES.map((t) => `${t}: ${counts[t]}`).join(', ')})`,
      });
      setStatus({ kind: 'ok', message: 'Backup downloaded.' });
      setEncryptPassword('');
      setEncryptConfirm('');
    } finally {
      setBackupBusy(false);
    }
  }

  function proceedWithParsedBackup(data: unknown) {
    const shapeError = validateBackupShape(data);
    if (shapeError) {
      setStatus({ kind: 'error', message: shapeError });
      return;
    }
    const recordError = validateBackupRecords(data as Record<string, unknown>);
    if (recordError) {
      setStatus({ kind: 'error', message: recordError });
      return;
    }
    const obj = data as Record<string, any[]>;
    setConfirming({ data: obj, tables: describeBackupTables(obj) });
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
    if (isEncryptedEnvelope(data)) {
      setPasswordInput('');
      setPasswordError('');
      setPasswordPrompt({ envelope: data });
      return;
    }
    proceedWithParsedBackup(data);
  }

  async function submitPassword() {
    if (!passwordPrompt) return;
    setPasswordError('');
    setPasswordBusy(true);
    try {
      const plainText = await decryptText(passwordPrompt.envelope, passwordInput);
      let parsed: unknown;
      try {
        parsed = JSON.parse(plainText);
      } catch {
        setPasswordError('This file decrypted, but does not contain a valid backup. It may be corrupted.');
        return;
      }
      setPasswordPrompt(null);
      proceedWithParsedBackup(parsed);
    } catch (e) {
      setPasswordError(e instanceof DecryptionError ? e.message : 'Could not decrypt this file.');
    } finally {
      setPasswordBusy(false);
    }
  }

  async function confirmRestore() {
    if (!confirming) return;
    try {
      // Atomic: every table INCLUDED in this backup is cleared and
      // repopulated inside one Dexie transaction. Tables absent from an
      // older backup are left completely untouched. If anything fails
      // partway through, Dexie rolls the whole transaction back - you
      // never end up with half-old, half-new data.
      await restoreFromBackupData(confirming.data);
      setConfirming(null);
      setStatus({ kind: 'ok', message: 'Data restored successfully. Reloading...' });
      setTimeout(() => window.location.reload(), 1200);
    } catch (e) {
      setConfirming(null);
      setStatus({ kind: 'error', message: 'Restore failed partway through and was rolled back - your existing data is untouched. The backup file may be corrupted.' });
    }
  }

  const skippedCount = confirming ? TABLES.filter((t) => !confirming.tables[t].included).length : 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="card p-6 space-y-3">
        <h3 className="font-semibold text-gray-800">Backup Data</h3>
        <p className="text-sm text-gray-500">Download a backup file of all your data — buildings, flats, residents, bills, receipts, payments, deposits, maintenance, expenses, reminders, documents, and the audit log. You can restore it later on this or any device.</p>

        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={encryptEnabled} onChange={(e) => { setEncryptEnabled(e.target.checked); setBackupError(''); }} />
          <Lock size={14} /> Password-protect this backup
        </label>
        {encryptEnabled && (
          <div className="space-y-2 pl-1">
            <input type="password" className="input" placeholder="Password (min. 6 characters)"
              value={encryptPassword} onChange={(e) => setEncryptPassword(e.target.value)} />
            <input type="password" className="input" placeholder="Confirm password"
              value={encryptConfirm} onChange={(e) => setEncryptConfirm(e.target.value)} />
            <div className="text-[11px] text-gray-400">Encrypted with AES-256-GCM. There's no password recovery — if you forget it, this backup can never be opened again.</div>
          </div>
        )}
        {backupError && <div className="text-sm text-red-500">{backupError}</div>}
        <button onClick={backupNow} disabled={backupBusy} className="btn-primary flex items-center gap-2 disabled:opacity-60">
          <Download size={16} /> {backupBusy ? 'Preparing…' : 'Backup Now'}
        </button>
      </div>

      <div className="card p-6 space-y-3">
        <h3 className="font-semibold text-gray-800">Restore Data</h3>
        <p className="text-sm text-gray-500">Upload a previously backed-up file to restore your data. Current data in tables included in the backup will be replaced; everything else is left untouched.</p>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) pickFile(f); }}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-gray-200'}`}
          onClick={() => fileRef.current?.click()}
        >
          <UploadCloud className="mx-auto text-brand-500 mb-2" size={28} />
          <div className="text-sm text-gray-600">Click to upload or drag and drop</div>
          <div className="text-xs text-gray-400 mt-1">JSON file only (encrypted backups supported)</div>
          <button className="btn-secondary mt-3 text-sm" type="button">Browse File</button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }} />
        </div>
        {status && (
          <div className={`text-sm ${status.kind === 'error' ? 'text-red-500' : 'text-brand-700'}`}>{status.message}</div>
        )}
      </div>

      {passwordPrompt && (
        <div className="md:col-span-2 card p-6 border-brand-200 space-y-3">
          <div className="flex items-center gap-2 text-brand-700 font-medium">
            <KeyRound size={18} /> This backup is password-protected
          </div>
          <p className="text-sm text-gray-600">Enter the password it was encrypted with to continue.</p>
          <input
            type="password" autoFocus className="input max-w-xs"
            value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitPassword(); }}
            placeholder="Password"
          />
          {passwordError && <div className="text-sm text-red-500">{passwordError}</div>}
          <div className="flex gap-2 pt-1">
            <button onClick={submitPassword} disabled={passwordBusy || !passwordInput} className="btn-primary disabled:opacity-60">
              {passwordBusy ? 'Decrypting…' : 'Decrypt & Continue'}
            </button>
            <button onClick={() => setPasswordPrompt(null)} className="btn-secondary">Cancel</button>
          </div>
        </div>
      )}

      {confirming && (
        <div className="md:col-span-2 card p-6 border-amber-200 space-y-3">
          <div className="flex items-center gap-2 text-amber-600 font-medium">
            <AlertTriangle size={18} /> Confirm Restore
          </div>
          <p className="text-sm text-gray-600">
            This will permanently replace current data in every table included below. This cannot be undone
            (unless you have another, more recent backup). Here's what will happen:
          </p>
          {skippedCount > 0 && (
            <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
              This is an older backup. {skippedCount} table{skippedCount > 1 ? 's' : ''} not included in it (marked "unchanged" below) will keep your current data exactly as-is.
            </div>
          )}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {TABLES.map((t) => {
              const info = confirming.tables[t];
              return (
                <div key={t} className={`rounded-lg px-3 py-2 ${info.included ? 'bg-gray-50' : 'bg-gray-50/50 border border-dashed border-gray-200'}`}>
                  <div className="text-gray-400">{t}</div>
                  {info.included
                    ? <div className="font-semibold text-gray-800">{info.count}</div>
                    : <div className="font-medium text-gray-400 italic">unchanged</div>}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={confirmRestore} className="btn-primary flex-1">Yes, Replace Data</button>
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
