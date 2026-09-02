import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { dateLabel } from '@/lib/format';
import { Plus, Pencil, Trash2, Search, Bell, Check, X, Layers } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import BulkToolbar from '@/components/BulkToolbar';
import BulkAddModal, { type BulkAddField } from '@/components/BulkAddModal';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import { nextDisplayId, nextDisplayIds } from '@/lib/ids';
import type { Reminder, ReminderPriority, ReminderStatus, ReminderLinkType } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

const emptyForm = (): Reminder => ({
  title: '', notes: '', dueDate: todayISO(), priority: 'medium', status: 'pending', linkType: 'none',
});

const PRIORITY_BADGE: Record<ReminderPriority, string> = { low: 'badge-paid', medium: 'badge-partial', high: 'badge-unpaid' };

interface BulkRow { title: string; dueDate: string; priority: ReminderPriority }

export default function Reminders() {
  const reminders = useLiveQuery(() => db.reminders.orderBy('dueDate').toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];

  const [statusFilter, setStatusFilter] = useState<'pending' | 'all'>('pending');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState<Reminder>(emptyForm());
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const linkLabel = (r: Reminder) => {
    if (r.linkType === 'building' && r.linkId) return buildings.find((b) => b.id === r.linkId)?.name;
    if (r.linkType === 'flat' && r.linkId) return flats.find((f) => f.id === r.linkId)?.unitNo;
    if (r.linkType === 'resident' && r.linkId) return residents.find((res) => res.id === r.linkId)?.name;
    return null;
  };

  const today = todayISO();
  const filtered = reminders.filter((r) =>
    (statusFilter === 'all' || r.status === 'pending') &&
    r.title.toLowerCase().includes(query.toLowerCase())
  );

  const bulk = useBulkSelection(filtered);

  function openAdd() { setForm(emptyForm()); setOpen(true); }
  function openEdit(r: Reminder) { setForm(r); setOpen(true); }

  function linkOptions(linkType: ReminderLinkType) {
    if (linkType === 'building') return buildings.map((b) => ({ id: b.id!, label: b.name }));
    if (linkType === 'flat') return flats.map((f) => ({ id: f.id!, label: f.unitNo }));
    if (linkType === 'resident') return residents.map((r) => ({ id: r.id!, label: r.name }));
    return [];
  }

  async function save() {
    if (!form.title.trim() || !form.dueDate) return;
    if (form.id) await db.reminders.update(form.id, form);
    else await db.reminders.add({ ...form, displayId: await nextDisplayId('reminders') });
    setOpen(false);
  }

  async function setStatus(r: Reminder, status: ReminderStatus) {
    if (!r.id) return;
    await db.reminders.update(r.id, { status });
  }

  async function remove(id: number) {
    await db.reminders.delete(id);
    setConfirmDeleteId(null);
  }

  async function bulkDelete() {
    await db.reminders.bulkDelete(bulk.selectedIds());
    bulk.clear();
    setConfirmBulkDelete(false);
  }

  const BULK_FIELDS: BulkAddField<BulkRow>[] = [
    { key: 'title', label: 'Title', type: 'text', required: true, placeholder: 'e.g. Renew fire insurance' },
    { key: 'dueDate', label: 'Due Date', type: 'date', required: true },
    { key: 'priority', label: 'Priority', type: 'select', options: ['low', 'medium', 'high'] },
  ];

  async function commitBulkAdd(rows: BulkRow[]) {
    const ids = await nextDisplayIds('reminders', rows.length);
    await db.reminders.bulkAdd(rows.map((r, i) => ({
      title: r.title.trim(), notes: '', dueDate: r.dueDate, priority: r.priority,
      status: 'pending' as ReminderStatus, linkType: 'none' as ReminderLinkType, displayId: ids[i],
    })));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reminders..." className="input pl-9" />
          </div>
          <select className="input sm:w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="pending">Pending</option>
            <option value="all">All</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setBulkOpen(true)} className="btn-secondary flex items-center gap-2 justify-center"><Layers size={16} /> Bulk Add</button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 justify-center"><Plus size={16} /> Add Reminder</button>
        </div>
      </div>

      <BulkToolbar count={bulk.count} onDelete={() => setConfirmBulkDelete(true)} onClear={bulk.clear} />

      <div className="card overflow-hidden divide-y divide-gray-100">
        {filtered.map((r) => {
          const overdue = r.status === 'pending' && r.dueDate < today;
          const link = linkLabel(r);
          return (
            <div key={r.id} className={`p-4 flex items-start justify-between gap-3 ${bulk.isSelected(r.id) ? 'bg-brand-50/40' : ''}`}>
              <div className="min-w-0 flex items-start gap-3">
                <input type="checkbox" className="mt-1" checked={bulk.isSelected(r.id)} onChange={() => bulk.toggle(r.id)} />
                <Bell size={16} className={`mt-0.5 shrink-0 ${overdue ? 'text-red-500' : 'text-gray-300'}`} />
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-mono">{r.displayId ?? '—'}</span>
                    <span className={`font-medium ${r.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>{r.title}</span>
                    <span className={PRIORITY_BADGE[r.priority]}>{r.priority}</span>
                    {overdue && <span className="badge-unpaid">Overdue</span>}
                    {r.status === 'done' && <span className="badge-paid">Done</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">Due {dateLabel(r.dueDate)}{link ? ` · ${link}` : ''}</div>
                  {r.notes && <div className="text-xs text-gray-500 mt-1">{r.notes}</div>}
                </div>
              </div>
              <div className="flex items-center shrink-0 gap-1">
                {r.status === 'pending' && (
                  <>
                    <button onClick={() => setStatus(r, 'done')} className="icon-btn text-emerald-500" title="Mark done"><Check size={16} /></button>
                    <button onClick={() => setStatus(r, 'dismissed')} className="icon-btn text-gray-400" title="Dismiss"><X size={16} /></button>
                  </>
                )}
                <button onClick={() => openEdit(r)} className="icon-btn text-brand-500"><Pencil size={16} /></button>
                <button onClick={() => setConfirmDeleteId(r.id!)} className="icon-btn text-red-400"><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No reminders found</div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit Reminder' : 'Add Reminder'}>
        <div className="space-y-3">
          <div><label className="label">Title *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Renew fire insurance" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Due Date *</label>
              <input type="date" className="input" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            <div><label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as ReminderPriority })}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Link To</label>
              <select className="input" value={form.linkType} onChange={(e) => setForm({ ...form, linkType: e.target.value as ReminderLinkType, linkId: undefined })}>
                <option value="none">Nothing specific</option>
                <option value="building">Building</option>
                <option value="flat">Flat</option>
                <option value="resident">Resident</option>
              </select></div>
            {form.linkType !== 'none' && (
              <div><label className="label">&nbsp;</label>
                <select className="input" value={form.linkId ?? ''} onChange={(e) => setForm({ ...form, linkId: Number(e.target.value) })}>
                  <option value="">Select...</option>
                  {linkOptions(form.linkType).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select></div>
            )}
          </div>
          <div><label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      <BulkAddModal<BulkRow>
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        title="Bulk Add Reminders"
        entityLabel="reminder"
        fields={BULK_FIELDS}
        makeEmptyRow={() => ({ title: '', dueDate: todayISO(), priority: 'medium' })}
        isRowBlank={(r) => !r.title.trim()}
        onCommit={commitBulkAdd}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this reminder?"
        message="This cannot be undone."
        onConfirm={() => confirmDeleteId !== null && remove(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${bulk.count} reminder${bulk.count === 1 ? '' : 's'}?`}
        message="This cannot be undone."
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
}
