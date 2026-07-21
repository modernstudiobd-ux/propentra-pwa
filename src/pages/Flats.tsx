import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import Modal from '@/components/Modal';
import type { Flat } from '@/types';

export default function Flats() {
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Flat>({ buildingId: buildings[0]?.id ?? 0, unitNo: '', status: 'vacant' });

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';

  const filtered = flats.filter((f) =>
    (buildingFilter === 'all' || f.buildingId === buildingFilter) &&
    f.unitNo.toLowerCase().includes(query.toLowerCase())
  );

  function openAdd() { setForm({ buildingId: buildings[0]?.id ?? 0, unitNo: '', status: 'vacant' }); setOpen(true); }
  function openEdit(f: Flat) { setForm(f); setOpen(true); }

  async function save() {
    if (!form.unitNo.trim() || !form.buildingId) return;
    if (form.id) await db.flats.update(form.id, form);
    else await db.flats.add(form);
    setOpen(false);
  }

  async function remove(id?: number) {
    if (!id) return;
    if (!confirm('Delete this flat?')) return;
    await db.flats.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search unit..." className="input pl-9" />
          </div>
          <select className="input sm:w-48" value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All Buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 justify-center" disabled={buildings.length === 0}>
          <Plus size={16} /> Add Flat
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">#</th>
              <th className="table-th">Unit No</th>
              <th className="table-th">Building</th>
              <th className="table-th">Status</th>
              <th className="table-th text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((f, i) => (
              <tr key={f.id}>
                <td className="table-td">{i + 1}</td>
                <td className="table-td font-medium text-gray-800">{f.unitNo}</td>
                <td className="table-td">{buildingName(f.buildingId)}</td>
                <td className="table-td">
                  <span className={f.status === 'occupied' ? 'badge-paid' : 'badge-unpaid'}>{f.status}</span>
                </td>
                <td className="table-td text-right">
                  <button onClick={() => openEdit(f)} className="text-brand-500 hover:text-brand-700 mr-3"><Pencil size={16} /></button>
                  <button onClick={() => remove(f.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-8">No flats found</td></tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">Total: {filtered.length} flats</div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit Flat' : 'Add Flat'}>
        <div className="space-y-3">
          <div><label className="label">Building</label>
            <select className="input" value={form.buildingId} onChange={(e) => setForm({ ...form, buildingId: Number(e.target.value) })}>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
          <div><label className="label">Unit No (e.g. A-3)</label>
            <input className="input" value={form.unitNo} onChange={(e) => setForm({ ...form, unitNo: e.target.value })} /></div>
          <div><label className="label">Status</label>
            <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })}>
              <option value="vacant">Vacant</option>
              <option value="occupied">Occupied</option>
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
