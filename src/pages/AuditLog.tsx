import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money } from '@/lib/format';
import { Search, ShieldCheck, Ban, PlusCircle, Pencil, Trash2, PiggyBank, DatabaseBackup, UploadCloud, Archive, FolderOpen, FileSpreadsheet } from 'lucide-react';
import type { AuditAction } from '@/types';

const ACTION_META: Record<AuditAction, { label: string; icon: any; color: string }> = {
  payment_recorded: { label: 'Payment Recorded', icon: PlusCircle, color: 'text-emerald-500' },
  payment_voided: { label: 'Payment Voided', icon: Ban, color: 'text-red-400' },
  payment_deleted: { label: 'Payment Deleted', icon: Trash2, color: 'text-red-500' },
  deposit_collected: { label: 'Deposit Collected', icon: PiggyBank, color: 'text-teal-500' },
  deposit_applied: { label: 'Deposit Applied', icon: PiggyBank, color: 'text-teal-500' },
  deposit_refunded: { label: 'Deposit Refunded', icon: PiggyBank, color: 'text-amber-500' },
  deposit_adjusted: { label: 'Deposit Adjusted', icon: PiggyBank, color: 'text-amber-500' },
  deposit_voided: { label: 'Deposit Voided', icon: Ban, color: 'text-red-400' },
  deposit_deleted: { label: 'Deposit Deleted', icon: Trash2, color: 'text-red-500' },
  bill_voided: { label: 'Invoice Voided', icon: Ban, color: 'text-red-400' },
  bill_deleted: { label: 'Invoice Deleted', icon: Trash2, color: 'text-red-500' },
  resident_created: { label: 'Resident Added', icon: PlusCircle, color: 'text-brand-500' },
  resident_updated: { label: 'Resident Updated', icon: Pencil, color: 'text-brand-500' },
  resident_deleted: { label: 'Resident Deleted', icon: Trash2, color: 'text-red-500' },
  resident_archived: { label: 'Resident Archived', icon: Archive, color: 'text-gray-400' },
  resident_unarchived: { label: 'Resident Unarchived', icon: Archive, color: 'text-gray-400' },
  document_uploaded: { label: 'Document Uploaded', icon: FolderOpen, color: 'text-brand-500' },
  document_deleted: { label: 'Document Deleted', icon: Trash2, color: 'text-red-500' },
  backup_created: { label: 'Backup Created', icon: DatabaseBackup, color: 'text-brand-500' },
  restore_performed: { label: 'Data Restored', icon: UploadCloud, color: 'text-amber-600' },
  data_imported: { label: 'Data Imported', icon: FileSpreadsheet, color: 'text-brand-500' },
  tenancy_created: { label: 'Tenancy Added', icon: PlusCircle, color: 'text-brand-500' },
  tenancy_updated: { label: 'Tenancy Updated', icon: Pencil, color: 'text-brand-500' },
  tenancy_deleted: { label: 'Tenancy Deleted', icon: Trash2, color: 'text-red-500' },
  ownership_created: { label: 'Ownership Added', icon: PlusCircle, color: 'text-brand-500' },
  ownership_updated: { label: 'Ownership Updated', icon: Pencil, color: 'text-brand-500' },
  ownership_deleted: { label: 'Ownership Deleted', icon: Trash2, color: 'text-red-500' },
};

export default function AuditLog() {
  const entries = useLiveQuery(() => db.auditLog.orderBy('timestamp').reverse().toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];

  const [query, setQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<'all' | AuditAction>('all');
  const [entityFilter, setEntityFilter] = useState<'all' | string>('all');

  const buildingName = (id?: number) => buildings.find((b) => b.id === id)?.name;
  const residentName = (id?: number) => residents.find((r) => r.id === id)?.name;

  const filtered = entries.filter((e) =>
    (actionFilter === 'all' || e.action === actionFilter) &&
    (entityFilter === 'all' || e.entityType === entityFilter) &&
    (e.summary.toLowerCase().includes(query.toLowerCase()) || (e.details ?? '').toLowerCase().includes(query.toLowerCase()))
  );

  const entityTypes = Array.from(new Set(entries.map((e) => e.entityType)));

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 bg-brand-50 text-brand-700 text-sm rounded-xl p-4">
        <ShieldCheck size={18} className="mt-0.5 shrink-0" />
        <div>An append-only record of every payment, deposit, invoice void, resident change, and backup/restore. Entries can never be edited or deleted here.</div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search audit log..." className="input pl-9" />
        </div>
        <select className="input sm:w-52" value={actionFilter} onChange={(e) => setActionFilter(e.target.value as any)}>
          <option value="all">All Actions</option>
          {Object.entries(ACTION_META).map(([key, m]) => <option key={key} value={key}>{m.label}</option>)}
        </select>
        <select className="input sm:w-40" value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
          <option value="all">All Types</option>
          {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="card overflow-hidden divide-y divide-gray-100">
        {filtered.map((e) => {
          const meta = ACTION_META[e.action] ?? { label: e.action, icon: ShieldCheck, color: 'text-gray-400' };
          const Icon = meta.icon;
          return (
            <div key={e.id} className="p-4 flex items-start gap-3">
              <div className={`w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center shrink-0 ${meta.color}`}>
                <Icon size={15} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{e.summary}</span>
                  {e.amount !== undefined && <span className="text-sm font-semibold text-gray-700 shrink-0">{money(e.amount)}</span>}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {new Date(e.timestamp).toLocaleString()}
                  {buildingName(e.buildingId) ? ` · ${buildingName(e.buildingId)}` : ''}
                  {residentName(e.residentId) ? ` · ${residentName(e.residentId)}` : ''}
                  {' · '}{e.performedBy}
                </div>
                {e.details && <div className="text-xs text-gray-500 mt-1">{e.details}</div>}
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No audit entries found</div>}
      </div>
    </div>
  );
}
