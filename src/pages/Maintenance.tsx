import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import { Plus, Pencil, Trash2, Search, Wrench } from 'lucide-react';
import Modal from '@/components/Modal';
import type { MaintenanceRequest, MaintenancePriority, MaintenanceStatus } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

const emptyForm = (buildingId: number): MaintenanceRequest => ({
  buildingId, flatId: undefined, title: '', description: '', priority: 'medium', status: 'open',
  vendorName: '', vendorContact: '', cost: 0, reportedDate: todayISO(), completedDate: '', notes: '',
});

const PRIORITY_BADGE: Record<MaintenancePriority, string> = {
  low: 'badge-paid', medium: 'badge-partial', high: 'badge-unpaid', urgent: 'badge-unpaid',
};
const STATUS_BADGE: Record<MaintenanceStatus, string> = {
  open: 'badge-unpaid', in_progress: 'badge-partial', completed: 'badge-paid', cancelled: 'badge-partial',
};
const STATUS_LABEL: Record<MaintenanceStatus, string> = {
  open: 'Open', in_progress: 'In Progress', completed: 'Completed', cancelled: 'Cancelled',
};

export default function Maintenance() {
  const requests = useLiveQuery(() => db.maintenanceRequests.orderBy('id').reverse().toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | MaintenanceStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | MaintenancePriority>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<MaintenanceRequest>(emptyForm(buildings[0]?.id ?? 0));

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const flatLabel = (id?: number) => (id ? flats.find((f) => f.id === id)?.unitNo : null);
  const buildingFlats = flats.filter((f) => f.buildingId === form.buildingId);

  const filtered = requests.filter((r) =>
    (statusFilter === 'all' || r.status === statusFilter) &&
    (priorityFilter === 'all' || r.priority === priorityFilter) &&
    r.title.toLowerCase().includes(query.toLowerCase())
  );

  function openAdd() { setForm(emptyForm(buildings[0]?.id ?? 0)); setOpen(true); }
  function openEdit(r: MaintenanceRequest) { setForm(r); setOpen(true); }

  async function save() {
    if (!form.title.trim() || !form.buildingId) return;
    const payload = { ...form, completedDate: form.status === 'completed' ? (form.completedDate || todayISO()) : form.completedDate };
    if (form.id) await db.maintenanceRequests.update(form.id, payload);
    else await db.maintenanceRequests.add(payload);
    setOpen(false);
  }

  async function remove(id?: number) {
    if (!id) return;
    if (!confirm('Delete this maintenance record?')) return;
    await db.maintenanceRequests.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto flex-wrap">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search maintenance..." className="input pl-9" />
          </div>
          <select className="input sm:w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="all">All Status</option>
            <option value="open">Open</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <select className="input sm:w-32" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as any)}>
            <option value="all">All Priority</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 justify-center shrink-0" disabled={buildings.length === 0}>
          <Plus size={16} /> Add Request
        </button>
      </div>

      <div className="card overflow-hidden divide-y divide-gray-100">
        {filtered.map((r) => (
          <div key={r.id} className="p-4 flex items-start justify-between gap-3">
            <div className="min-w-0 flex items-start gap-3">
              <Wrench size={16} className="text-gray-300 mt-0.5 shrink-0" />
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">{r.title}</span>
                  <span className={PRIORITY_BADGE[r.priority]}>{r.priority}</span>
                  <span className={STATUS_BADGE[r.status]}>{STATUS_LABEL[r.status]}</span>
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {buildingName(r.buildingId)}{flatLabel(r.flatId) ? ` · Flat ${flatLabel(r.flatId)}` : ''} · Reported {dateLabel(r.reportedDate)}
                  {r.vendorName ? ` · ${r.vendorName}` : ''}
                </div>
                {r.description && <div className="text-xs text-gray-500 mt-1">{r.description}</div>}
              </div>
            </div>
            <div className="flex items-center shrink-0 gap-2">
              {r.cost ? <span className="text-sm font-semibold text-gray-800">{money(r.cost)}</span> : null}
              <button onClick={() => openEdit(r)} className="icon-btn text-brand-500"><Pencil size={16} /></button>
              <button onClick={() => remove(r.id)} className="icon-btn text-red-400"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No maintenance records found</div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit Maintenance Request' : 'Add Maintenance Request'}>
        <div className="space-y-3">
          <div><label className="label">Title *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Leaking pipe in kitchen" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Building</label>
              <select className="input" value={form.buildingId} onChange={(e) => setForm({ ...form, buildingId: Number(e.target.value), flatId: undefined })}>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className="label">Flat (optional)</label>
              <select className="input" value={form.flatId ?? ''} onChange={(e) => setForm({ ...form, flatId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">Building-wide</option>
                {buildingFlats.map((f) => <option key={f.id} value={f.id}>{f.unitNo}</option>)}
              </select></div>
          </div>
          <div><label className="label">Description</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Priority</label>
              <select className="input" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as MaintenancePriority })}>
                <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select></div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as MaintenanceStatus })}>
                <option value="open">Open</option><option value="in_progress">In Progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Vendor / Contractor</label>
              <input className="input" value={form.vendorName} onChange={(e) => setForm({ ...form, vendorName: e.target.value })} /></div>
            <div><label className="label">Vendor Contact</label>
              <input className="input" value={form.vendorContact} onChange={(e) => setForm({ ...form, vendorContact: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Cost</label>
              <input type="number" className="input" value={form.cost || ''} placeholder="0" onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} /></div>
            <div><label className="label">Reported Date</label>
              <input type="date" className="input" value={form.reportedDate} onChange={(e) => setForm({ ...form, reportedDate: e.target.value })} /></div>
          </div>
          {form.status === 'completed' && (
            <div><label className="label">Completed Date</label>
              <input type="date" className="input" value={form.completedDate ?? ''} onChange={(e) => setForm({ ...form, completedDate: e.target.value })} /></div>
          )}
          <div><label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
