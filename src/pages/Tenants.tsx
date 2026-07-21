import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, Search } from 'lucide-react';
import Modal from '@/components/Modal';
import type { Tenant } from '@/types';

export default function Tenants() {
  const tenants = useLiveQuery(() => db.tenants.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Tenant>({
    name: '', mobile: '', email: '', flatId: flats[0]?.id ?? 0, buildingId: flats[0]?.buildingId ?? 0, unitLabel: flats[0]?.unitNo ?? '',
  });

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';

  const filtered = tenants.filter((t) =>
    t.name.toLowerCase().includes(query.toLowerCase()) || t.email.toLowerCase().includes(query.toLowerCase())
  );

  function openAdd() {
    const f = flats[0];
    setForm({ name: '', mobile: '', email: '', flatId: f?.id ?? 0, buildingId: f?.buildingId ?? 0, unitLabel: f?.unitNo ?? '' });
    setOpen(true);
  }
  function openEdit(t: Tenant) { setForm(t); setOpen(true); }

  function onFlatChange(flatId: number) {
    const f = flats.find((x) => x.id === flatId);
    setForm({ ...form, flatId, buildingId: f?.buildingId ?? 0, unitLabel: f?.unitNo ?? '' });
  }

  async function save() {
    if (!form.name.trim() || !form.mobile.trim()) return;
    if (form.id) await db.tenants.update(form.id, form);
    else await db.tenants.add(form);
    setOpen(false);
  }

  async function remove(id?: number) {
    if (!id) return;
    if (!confirm('Delete this tenant?')) return;
    await db.tenants.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search tenants..." className="input pl-9" />
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 justify-center" disabled={flats.length === 0}>
          <Plus size={16} /> Add Tenant
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">#</th>
              <th className="table-th">Tenant Name</th>
              <th className="table-th">Mobile</th>
              <th className="table-th">Email</th>
              <th className="table-th">Flat</th>
              <th className="table-th text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((t, i) => (
              <tr key={t.id}>
                <td className="table-td">{i + 1}</td>
                <td className="table-td font-medium text-gray-800">{t.name}</td>
                <td className="table-td">{t.mobile}</td>
                <td className="table-td">{t.email}</td>
                <td className="table-td">{buildingName(t.buildingId)} · {t.unitLabel}</td>
                <td className="table-td text-right">
                  <button onClick={() => openEdit(t)} className="text-brand-500 hover:text-brand-700 mr-3"><Pencil size={16} /></button>
                  <button onClick={() => remove(t.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-8">No tenants found</td></tr>
            )}
          </tbody>
        </table>
        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">Total: {filtered.length} tenants</div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit Tenant' : 'Add Tenant'}>
        <div className="space-y-3">
          <div><label className="label">Full Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Mobile</label>
            <input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div><label className="label">Email</label>
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
