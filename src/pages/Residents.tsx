import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '@/components/Modal';
import type { Resident, ResidentType } from '@/types';

export default function Residents() {
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ResidentType>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Resident>({
    name: '', mobile: '', email: '', flatId: flats[0]?.id ?? 0, buildingId: flats[0]?.buildingId ?? 0,
    unitLabel: flats[0]?.unitNo ?? '', type: 'Tenant',
  });

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';

  const filtered = residents.filter((r) =>
    (typeFilter === 'all' || r.type === typeFilter) &&
    (r.name.toLowerCase().includes(query.toLowerCase()) || r.email.toLowerCase().includes(query.toLowerCase()))
  );

  function openAdd() {
    const f = flats[0];
    setForm({ name: '', mobile: '', email: '', flatId: f?.id ?? 0, buildingId: f?.buildingId ?? 0, unitLabel: f?.unitNo ?? '', type: 'Tenant' });
    setOpen(true);
  }
  function openEdit(r: Resident) { setForm(r); setOpen(true); }

  function onFlatChange(flatId: number) {
    const f = flats.find((x) => x.id === flatId);
    setForm({ ...form, flatId, buildingId: f?.buildingId ?? 0, unitLabel: f?.unitNo ?? '' });
  }

  async function save() {
    if (!form.name.trim()) return;
    if (form.id) await db.residents.update(form.id, form);
    else await db.residents.add(form);
    setOpen(false);
  }

  async function remove(id?: number) {
    if (!id) return;
    if (!confirm('Delete this resident?')) return;
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
          <table className="w-full min-w-[750px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">#</th><th className="table-th">Resident Name</th><th className="table-th">Type</th>
                <th className="table-th">Mobile</th><th className="table-th">Email</th><th className="table-th">Flat</th>
                <th className="table-th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r, i) => (
                <tr key={r.id}>
                  <td className="table-td">{i + 1}</td>
                  <td className="table-td font-medium text-gray-800">{r.name}</td>
                  <td className="table-td">
                    <span className={r.type === 'Owner' ? 'badge-partial' : 'badge-paid'}>{r.type === 'Owner' ? 'Flat Owner' : 'Tenant'}</span>
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
                <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-8">No residents found</td></tr>
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
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{buildingName(r.buildingId)} · {r.unitLabel}</div>
                <div className="text-xs text-gray-400 mt-1">{r.mobile || '—'} · {r.email || '—'}</div>
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
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
