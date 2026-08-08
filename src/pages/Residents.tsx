import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '@/components/Modal';
import { dateLabel } from '@/lib/format';
import type { Resident, ResidentType, ResidentStatus } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

const emptyForm = (flats: { id?: number; buildingId: number; unitNo: string }[]): Resident => {
  const f = flats[0];
  return {
    name: '', mobile: '', email: '', flatId: f?.id ?? 0, buildingId: f?.buildingId ?? 0, unitLabel: f?.unitNo ?? '',
    type: 'Tenant', status: 'current', moveInDate: todayISO(), moveOutDate: '', isBillingContact: true,
  };
};

export default function Residents() {
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ResidentType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ResidentStatus>('current');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Resident>(emptyForm([]));

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  // Existing data from before this feature won't have status/isBillingContact set - default sensibly.
  const statusOf = (r: Resident): ResidentStatus => r.status ?? 'current';
  const isBillingContactOf = (r: Resident): boolean => r.isBillingContact ?? true;

  const filtered = residents.filter((r) =>
    (typeFilter === 'all' || r.type === typeFilter) &&
    (statusFilter === 'all' || statusOf(r) === statusFilter) &&
    (r.name.toLowerCase().includes(query.toLowerCase()) || r.email.toLowerCase().includes(query.toLowerCase()))
  );

  function openAdd() { setForm(emptyForm(flats)); setOpen(true); }
  function openEdit(r: Resident) {
    setForm({ ...r, status: statusOf(r), isBillingContact: isBillingContactOf(r), moveInDate: r.moveInDate ?? '', moveOutDate: r.moveOutDate ?? '' });
    setOpen(true);
  }

  function onFlatChange(flatId: number) {
    const f = flats.find((x) => x.id === flatId);
    setForm({ ...form, flatId, buildingId: f?.buildingId ?? 0, unitLabel: f?.unitNo ?? '' });
  }

  async function save() {
    if (!form.name.trim()) return;
    // Only one billing contact per flat - unmark any other current billing
    // contact on the same flat when this one is set as the contact.
    if (form.isBillingContact) {
      const others = residents.filter((r) => r.flatId === form.flatId && r.id !== form.id && isBillingContactOf(r));
      await Promise.all(others.map((r) => r.id && db.residents.update(r.id, { isBillingContact: false })));
    }
    if (form.id) await db.residents.update(form.id, form);
    else await db.residents.add(form);
    setOpen(false);
  }

  async function remove(id?: number) {
    if (!id) return;
    if (!confirm('Delete this resident? Their billing/payment history will remain but no longer link to a name.')) return;
    await db.residents.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search residents..." className="input pl-9" />
          </div>
          <select className="input sm:w-36" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
            <option value="current">Current</option>
            <option value="former">Former</option>
            <option value="all">All</option>
          </select>
          <select className="input sm:w-40" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
            <option value="all">All Types</option>
            <option value="Tenant">Tenant</option>
            <option value="Owner">Flat Owner</option>
          </select>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={openAdd}
            className="btn-primary flex items-center gap-2 justify-center"
            disabled={flats.length === 0}
            title={flats.length === 0 ? 'Add a flat first before adding residents' : undefined}
          >
            <Plus size={16} /> Add Resident
          </button>
          {flats.length === 0 && (
            <span className="text-xs text-gray-400">
              No flats yet — <Link to="/flats" className="text-brand-500 hover:underline">add one first</Link>.
            </span>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[850px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">#</th><th className="table-th">Resident Name</th><th className="table-th">Type</th><th className="table-th">Status</th>
                <th className="table-th">Mobile</th><th className="table-th">Email</th><th className="table-th">Flat</th>
                <th className="table-th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r, i) => (
                <tr key={r.id}>
                  <td className="table-td">{i + 1}</td>
                  <td className="table-td font-medium text-gray-800">
                    {r.name}
                    {isBillingContactOf(r) && statusOf(r) === 'current' && (
                      <span className="ml-2 text-[10px] text-brand-500 font-normal align-middle">● billed</span>
                    )}
                  </td>
                  <td className="table-td">
                    <span className={r.type === 'Owner' ? 'badge-partial' : 'badge-paid'}>{r.type === 'Owner' ? 'Flat Owner' : 'Tenant'}</span>
                  </td>
                  <td className="table-td">
                    <span className={statusOf(r) === 'current' ? 'badge-paid' : 'badge-unpaid'}>{statusOf(r) === 'current' ? 'Current' : 'Former'}</span>
                    {statusOf(r) === 'former' && r.moveOutDate && <div className="text-[10px] text-gray-400 mt-0.5">Moved out {dateLabel(r.moveOutDate)}</div>}
                    {statusOf(r) === 'current' && r.moveInDate && <div className="text-[10px] text-gray-400 mt-0.5">Since {dateLabel(r.moveInDate)}</div>}
                  </td>
                  <td className="table-td">{r.mobile || '—'}</td>
                  <td className="table-td">{r.email || '—'}</td>
                  <td className="table-td">{buildingName(r.buildingId)} · {r.unitLabel}</td>
                  <td className="table-td text-right">
                    <button onClick={() => openEdit(r)} className="icon-btn text-brand-500 mr-1"><Pencil size={16} /></button>
                    <button onClick={() => remove(r.id)} className="icon-btn text-red-400"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-8">No residents found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filtered.map((r) => (
            <div key={r.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">{r.name}</span>
                  <span className={r.type === 'Owner' ? 'badge-partial' : 'badge-paid'}>{r.type === 'Owner' ? 'Flat Owner' : 'Tenant'}</span>
                  <span className={statusOf(r) === 'current' ? 'badge-paid' : 'badge-unpaid'}>{statusOf(r) === 'current' ? 'Current' : 'Former'}</span>
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{buildingName(r.buildingId)} · {r.unitLabel}</div>
                <div className="text-xs text-gray-400 mt-1">{r.mobile || '—'} · {r.email || '—'}</div>
                {statusOf(r) === 'former' && r.moveOutDate && <div className="text-[10px] text-gray-400 mt-0.5">Moved out {dateLabel(r.moveOutDate)}</div>}
                {statusOf(r) === 'current' && r.moveInDate && <div className="text-[10px] text-gray-400 mt-0.5">Since {dateLabel(r.moveInDate)}</div>}
              </div>
              <div className="flex items-center shrink-0 gap-1">
                <button onClick={() => openEdit(r)} className="icon-btn text-brand-500"><Pencil size={18} /></button>
                <button onClick={() => remove(r.id)} className="icon-btn text-red-400"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">No residents found</div>
          )}
        </div>

        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">Total: {filtered.length} residents</div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit Resident' : 'Add Resident'}>
        <div className="space-y-3">
          <div><label className="label">Full Name *</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Type</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as ResidentType })}>
              <option value="Tenant">Tenant</option>
              <option value="Owner">Flat Owner</option>
            </select></div>
          <div><label className="label">Mobile (optional)</label>
            <input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div><label className="label">Email (optional)</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <div><label className="label">Flat</label>
            <select className="input" value={form.flatId} onChange={(e) => onFlatChange(Number(e.target.value))}>
              {flats.map((f) => <option key={f.id} value={f.id}>{buildingName(f.buildingId)} · {f.unitNo}</option>)}
            </select></div>

          <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
            <div className="pt-3"><label className="label">Status</label>
              <select className="input" value={form.status} onChange={(e) => {
                const status = e.target.value as ResidentStatus;
                setForm({ ...form, status, moveOutDate: status === 'former' ? (form.moveOutDate || todayISO()) : '' });
              }}>
                <option value="current">Current</option>
                <option value="former">Former</option>
              </select></div>
            <div className="pt-3"><label className="label">Move-in Date</label>
              <input type="date" className="input" value={form.moveInDate ?? ''} onChange={(e) => setForm({ ...form, moveInDate: e.target.value })} /></div>
          </div>
          {form.status === 'former' && (
            <div><label className="label">Move-out Date</label>
              <input type="date" className="input" value={form.moveOutDate ?? ''} onChange={(e) => setForm({ ...form, moveOutDate: e.target.value })} /></div>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.isBillingContact} onChange={(e) => setForm({ ...form, isBillingContact: e.target.checked })} />
            Bill this resident by default for this flat
          </label>
          <div className="text-[11px] text-gray-400 -mt-2">Only one resident per flat can be the default billing contact — marking this one will unmark any other.</div>

          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
