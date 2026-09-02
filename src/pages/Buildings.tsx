import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, Search, Layers } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import BulkToolbar from '@/components/BulkToolbar';
import BulkAddModal, { type BulkAddField } from '@/components/BulkAddModal';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import type { Building } from '@/types';
import { PROPERTY_TYPES, BUILDING_STATUSES } from '@/types';
import { nextDisplayId, nextDisplayIds } from '@/lib/ids';

function nowIso() { return new Date().toISOString(); }
const empty = (): Building => ({
  name: '', address: '', addressLine2: '', locality: '', adminArea: '', postalCode: '', countryCode: '',
  propertyType: '', status: 'active', totalFlats: 0,
});

type BulkRow = { name: string; address: string; locality: string; propertyType: string; totalFlats: number | '' };
const bulkFields: BulkAddField<BulkRow>[] = [
  { key: 'name', label: 'Building Name', type: 'text', required: true, placeholder: 'Oakwood Residences' },
  { key: 'address', label: 'Address', type: 'text', required: true, placeholder: '1200 Oakwood Avenue' },
  { key: 'locality', label: 'City', type: 'text' },
  { key: 'propertyType', label: 'Type', type: 'select', options: ['', ...PROPERTY_TYPES] },
  { key: 'totalFlats', label: 'Total Flats', type: 'number' },
];
const bulkEmptyRow = (): BulkRow => ({ name: '', address: '', locality: '', propertyType: '', totalFlats: '' });

export default function Buildings() {
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState<Building>(empty());
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const filtered = buildings.filter((b) =>
    b.name.toLowerCase().includes(query.toLowerCase()) || b.address.toLowerCase().includes(query.toLowerCase()) ||
    (b.displayId ?? '').toLowerCase().includes(query.toLowerCase())
  );
  const bulk = useBulkSelection(filtered);

  function openAdd() { setForm(empty()); setOpen(true); }
  function openEdit(b: Building) { setForm({ ...empty(), ...b }); setOpen(true); }

  async function save() {
    if (!form.name.trim() || !form.address.trim()) return;
    if (form.id) await db.buildings.update(form.id, { ...form, updatedAt: nowIso() });
    else await db.buildings.add({ ...form, displayId: await nextDisplayId('buildings'), createdAt: nowIso(), updatedAt: nowIso() });
    setOpen(false);
  }

  async function remove(id: number) {
    await db.buildings.delete(id);
  }

  async function bulkDelete() {
    await db.buildings.bulkDelete(bulk.selectedIds());
    bulk.clear();
    setConfirmBulkDelete(false);
  }

  async function bulkCommit(rows: BulkRow[]) {
    const displayIds = await nextDisplayIds('buildings', rows.length);
    const now = nowIso();
    await db.buildings.bulkAdd(rows.map((r, i) => ({
      name: r.name.trim(), address: r.address.trim(), locality: r.locality.trim() || undefined,
      propertyType: r.propertyType || undefined, totalFlats: r.totalFlats === '' ? 0 : Number(r.totalFlats),
      status: 'active', displayId: displayIds[i], createdAt: now, updatedAt: now,
    })));
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search buildings..."
            className="input pl-9" />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setBulkOpen(true)} className="btn-secondary flex items-center gap-2 justify-center">
            <Layers size={16} /> Bulk Add
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 justify-center">
            <Plus size={16} /> Add Building
          </button>
        </div>
      </div>

      <BulkToolbar count={bulk.count} onDelete={() => setConfirmBulkDelete(true)} onClear={bulk.clear} />

      <div className="card overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th w-8"><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} /></th>
                <th className="table-th">ID</th>
                <th className="table-th">Building Name</th>
                <th className="table-th">Address</th>
                <th className="table-th">Type</th>
                <th className="table-th">Total Flats</th>
                <th className="table-th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((b) => (
                <tr key={b.id} className={bulk.isSelected(b.id) ? 'bg-brand-50/40' : ''}>
                  <td className="table-td"><input type="checkbox" checked={bulk.isSelected(b.id)} onChange={() => bulk.toggle(b.id)} /></td>
                  <td className="table-td font-mono text-xs text-gray-500">{b.displayId ?? '—'}</td>
                  <td className="table-td font-medium text-gray-800">{b.name}</td>
                  <td className="table-td">{b.address}{b.locality ? `, ${b.locality}` : ''}</td>
                  <td className="table-td text-gray-500">{b.propertyType || '—'}</td>
                  <td className="table-td">{b.totalFlats}</td>
                  <td className="table-td text-right">
                    <button onClick={() => openEdit(b)} className="icon-btn text-brand-500 mr-1"><Pencil size={16} /></button>
                    <button onClick={() => setConfirmDeleteId(b.id!)} className="icon-btn text-red-400"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-8">No buildings found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filtered.map((b) => (
            <div key={b.id} className={`p-4 flex items-start justify-between gap-3 ${bulk.isSelected(b.id) ? 'bg-brand-50/40' : ''}`}>
              <div className="flex items-start gap-3 min-w-0">
                <input type="checkbox" className="mt-1" checked={bulk.isSelected(b.id)} onChange={() => bulk.toggle(b.id)} />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-gray-400">{b.displayId ?? '—'}</div>
                  <div className="font-medium text-gray-800">{b.name}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{b.address}</div>
                  <div className="text-xs text-gray-400 mt-1">{b.totalFlats} flats {b.propertyType ? `· ${b.propertyType}` : ''}</div>
                </div>
              </div>
              <div className="flex items-center shrink-0 gap-1">
                <button onClick={() => openEdit(b)} className="icon-btn text-brand-500"><Pencil size={18} /></button>
                <button onClick={() => setConfirmDeleteId(b.id!)} className="icon-btn text-red-400"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">No buildings found</div>
          )}
        </div>

        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">Total: {filtered.length} buildings</div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit Building' : 'Add Building'}>
        <div className="space-y-3">
          {form.displayId && <div className="text-xs font-mono text-gray-400">{form.displayId}</div>}
          <div><label className="label">Building Name</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label className="label">Address</label>
            <input className="input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
          <div><label className="label">Address Line 2 (optional)</label>
            <input className="input" value={form.addressLine2 ?? ''} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">City / Locality</label>
              <input className="input" value={form.locality ?? ''} onChange={(e) => setForm({ ...form, locality: e.target.value })} /></div>
            <div><label className="label">State / Region</label>
              <input className="input" value={form.adminArea ?? ''} onChange={(e) => setForm({ ...form, adminArea: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Postal Code</label>
              <input className="input" value={form.postalCode ?? ''} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} /></div>
            <div><label className="label">Country Code</label>
              <input className="input" placeholder="e.g. US, BD, GB" maxLength={2} value={form.countryCode ?? ''} onChange={(e) => setForm({ ...form, countryCode: e.target.value.toUpperCase() })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Property Type</label>
              <select className="input" value={form.propertyType ?? ''} onChange={(e) => setForm({ ...form, propertyType: e.target.value })}>
                <option value="">—</option>
                {PROPERTY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="label">Status</label>
              <select className="input" value={form.status ?? 'active'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {BUILDING_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select></div>
          </div>
          <div><label className="label">Total Flats</label>
            <input type="number" className="input" value={form.totalFlats}
              onChange={(e) => setForm({ ...form, totalFlats: Number(e.target.value) })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      <BulkAddModal<BulkRow>
        open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Add Buildings" entityLabel="building"
        fields={bulkFields} makeEmptyRow={bulkEmptyRow}
        isRowBlank={(r) => !r.name.trim() && !r.address.trim()}
        onCommit={bulkCommit}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this building?"
        message="This cannot be undone. Flats, residents, and records linked to this building will remain but no longer reference a valid building."
        confirmLabel="Delete"
        onConfirm={() => { if (confirmDeleteId !== null) remove(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${bulk.count} building${bulk.count === 1 ? '' : 's'}?`}
        message="This cannot be undone. Flats, residents, and records linked to these buildings will remain but no longer reference a valid building."
        confirmLabel="Delete All Selected"
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
}
