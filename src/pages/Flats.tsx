import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, Search, Layers, Eye } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import BulkToolbar from '@/components/BulkToolbar';
import BulkAddModal, { type BulkAddField } from '@/components/BulkAddModal';
import FlatDetailModal from '@/components/FlatDetailModal';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import type { Flat } from '@/types';
import { UNIT_TYPES, FLAT_LIFECYCLE_STATUSES } from '@/types';
import { nextDisplayId, nextDisplayIds } from '@/lib/ids';

const emptyFlat = (buildingId: number): Flat => ({
  buildingId, unitNo: '', occupancyStatus: 'vacant', lifecycleStatus: 'active',
  unitType: '', bedrooms: undefined, bathrooms: undefined, sqft: undefined, standardRent: undefined,
});

type BulkFlatRow = { unitNo: string; unitType: string; bedrooms: number | ''; bathrooms: number | ''; standardRent: number | '' };
const bulkFlatFields: BulkAddField<BulkFlatRow>[] = [
  { key: 'unitNo', label: 'Unit No', type: 'text', required: true, placeholder: 'A-3' },
  { key: 'unitType', label: 'Type', type: 'select', options: ['', ...UNIT_TYPES] },
  { key: 'bedrooms', label: 'Bedrooms', type: 'number' },
  { key: 'bathrooms', label: 'Bathrooms', type: 'number' },
  { key: 'standardRent', label: 'Standard Rent', type: 'number' },
];
const bulkFlatEmptyRow = (): BulkFlatRow => ({ unitNo: '', unitType: '', bedrooms: '', bathrooms: '', standardRent: '' });

export default function Flats() {
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [vacantOnly, setVacantOnly] = useState(false);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState<Flat>(emptyFlat(buildings[0]?.id ?? 0));
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [viewFlatId, setViewFlatId] = useState<number | null>(null);

  // Prefill from the global search bar (e.g. /flats?q=A-3) - one-time on load.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';

  const filtered = flats.filter((f) =>
    (buildingFilter === 'all' || f.buildingId === buildingFilter) &&
    (!vacantOnly || f.occupancyStatus === 'vacant') &&
    (f.unitNo.toLowerCase().includes(query.toLowerCase()) || (f.displayId ?? '').toLowerCase().includes(query.toLowerCase()))
  );
  const bulk = useBulkSelection(filtered);

  function openAdd() { setForm(emptyFlat(buildings[0]?.id ?? 0)); setOpen(true); }
  function openEdit(f: Flat) { setForm({ ...f, lifecycleStatus: f.lifecycleStatus ?? 'active' }); setOpen(true); }

  async function save() {
    if (!form.unitNo.trim() || !form.buildingId) return;
    if (form.id) await db.flats.update(form.id, form);
    else await db.flats.add({ ...form, displayId: await nextDisplayId('flats') });
    setOpen(false);
  }

  async function remove(id: number) {
    await db.flats.delete(id);
  }

  async function bulkDelete() {
    await db.flats.bulkDelete(bulk.selectedIds());
    bulk.clear();
    setConfirmBulkDelete(false);
  }

  async function bulkCommit(rows: BulkFlatRow[]) {
    const targetBuildingId = buildingFilter !== 'all' ? buildingFilter : buildings[0]?.id;
    if (!targetBuildingId) return;
    const displayIds = await nextDisplayIds('flats', rows.length);
    await db.flats.bulkAdd(rows.map((r, i) => ({
      buildingId: targetBuildingId, unitNo: r.unitNo.trim(), unitType: r.unitType || undefined,
      bedrooms: r.bedrooms === '' ? undefined : Number(r.bedrooms), bathrooms: r.bathrooms === '' ? undefined : Number(r.bathrooms),
      standardRent: r.standardRent === '' ? undefined : Number(r.standardRent),
      occupancyStatus: 'vacant', lifecycleStatus: 'active', displayId: displayIds[i],
    })));
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
          <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap px-1">
            <input type="checkbox" checked={vacantOnly} onChange={(e) => setVacantOnly(e.target.checked)} /> Vacant only
          </label>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setBulkOpen(true)} className="btn-secondary flex items-center gap-2 justify-center" disabled={buildings.length === 0}>
            <Layers size={16} /> Bulk Add
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 justify-center" disabled={buildings.length === 0}>
            <Plus size={16} /> Add Flat
          </button>
        </div>
      </div>

      <BulkToolbar count={bulk.count} onDelete={() => setConfirmBulkDelete(true)} onClear={bulk.clear} />

      <div className="flex items-center gap-2 px-1">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} disabled={filtered.length === 0} />
          Select all {filtered.length} flat{filtered.length === 1 ? '' : 's'}
        </label>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th w-8"><input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} /></th>
                <th className="table-th">ID</th>
                <th className="table-th">Unit No</th>
                <th className="table-th">Building</th>
                <th className="table-th">Type</th>
                <th className="table-th">Occupancy</th>
                <th className="table-th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((f) => (
                <tr key={f.id} className={bulk.isSelected(f.id) ? 'bg-brand-50/40' : ''}>
                  <td className="table-td"><input type="checkbox" checked={bulk.isSelected(f.id)} onChange={() => bulk.toggle(f.id)} /></td>
                  <td className="table-td font-mono text-xs text-gray-500">{f.displayId ?? '—'}</td>
                  <td className="table-td font-medium text-gray-800">
                    <button onClick={() => setViewFlatId(f.id!)} className="hover:text-brand-600 hover:underline">{f.unitNo}</button>
                  </td>
                  <td className="table-td">{buildingName(f.buildingId)}</td>
                  <td className="table-td text-gray-500">{f.unitType || '—'}</td>
                  <td className="table-td">
                    <span className={f.occupancyStatus === 'occupied' ? 'badge-paid' : 'badge-unpaid'}>{f.occupancyStatus}</span>
                    {f.lifecycleStatus && f.lifecycleStatus !== 'active' && (
                      <span className="badge-partial ml-1">{f.lifecycleStatus.replace('_', ' ')}</span>
                    )}
                  </td>
                  <td className="table-td text-right">
                    <button onClick={() => setViewFlatId(f.id!)} className="icon-btn text-gray-400 mr-1" title="View details"><Eye size={16} /></button>
                    <button onClick={() => openEdit(f)} className="icon-btn text-brand-500 mr-1"><Pencil size={16} /></button>
                    <button onClick={() => setConfirmDeleteId(f.id!)} className="icon-btn text-red-400"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-8">No flats found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filtered.map((f) => (
            <div key={f.id} className={`p-4 flex items-center justify-between gap-3 ${bulk.isSelected(f.id) ? 'bg-brand-50/40' : ''}`}>
              <div className="flex items-center gap-3 min-w-0">
                <input type="checkbox" checked={bulk.isSelected(f.id)} onChange={() => bulk.toggle(f.id)} />
                <div className="min-w-0">
                  <div className="text-[10px] font-mono text-gray-400">{f.displayId ?? '—'}</div>
                  <button onClick={() => setViewFlatId(f.id!)} className="font-medium text-gray-800 hover:text-brand-600 hover:underline">{f.unitNo}</button>
                  <div className="text-sm text-gray-500">{buildingName(f.buildingId)}</div>
                  <span className={`inline-block mt-1 ${f.occupancyStatus === 'occupied' ? 'badge-paid' : 'badge-unpaid'}`}>{f.occupancyStatus}</span>
                </div>
              </div>
              <div className="flex items-center shrink-0 gap-1">
                <button onClick={() => setViewFlatId(f.id!)} className="icon-btn text-gray-400" title="View details"><Eye size={18} /></button>
                <button onClick={() => openEdit(f)} className="icon-btn text-brand-500"><Pencil size={18} /></button>
                <button onClick={() => setConfirmDeleteId(f.id!)} className="icon-btn text-red-400"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">No flats found</div>
          )}
        </div>

        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">Total: {filtered.length} flat{filtered.length === 1 ? '' : 's'}{vacantOnly ? ' (vacant only)' : ''}</div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit Flat' : 'Add Flat'}>
        <div className="space-y-3">
          {form.displayId && <div className="text-xs font-mono text-gray-400">{form.displayId}</div>}
          <div><label className="label">Building</label>
            <select className="input" value={form.buildingId} onChange={(e) => setForm({ ...form, buildingId: Number(e.target.value) })}>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></div>
          <div><label className="label">Unit No (e.g. A-3)</label>
            <input className="input" value={form.unitNo} onChange={(e) => setForm({ ...form, unitNo: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Occupancy</label>
              <select className="input" value={form.occupancyStatus} onChange={(e) => setForm({ ...form, occupancyStatus: e.target.value as any })}>
                <option value="vacant">Vacant</option>
                <option value="occupied">Occupied</option>
              </select></div>
            <div><label className="label">Unit Status</label>
              <select className="input" value={form.lifecycleStatus ?? 'active'} onChange={(e) => setForm({ ...form, lifecycleStatus: e.target.value })}>
                {FLAT_LIFECYCLE_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Unit Type</label>
              <select className="input" value={form.unitType ?? ''} onChange={(e) => setForm({ ...form, unitType: e.target.value })}>
                <option value="">—</option>
                {UNIT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="label">Floor</label>
              <input className="input" value={form.floor ?? ''} onChange={(e) => setForm({ ...form, floor: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Bedrooms</label>
              <input type="number" min={0} className="input" value={form.bedrooms ?? ''} onChange={(e) => setForm({ ...form, bedrooms: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
            <div><label className="label">Bathrooms</label>
              <input type="number" min={0} step={0.5} className="input" value={form.bathrooms ?? ''} onChange={(e) => setForm({ ...form, bathrooms: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
            <div><label className="label">Sq. Ft.</label>
              <input type="number" min={0} className="input" value={form.sqft ?? ''} onChange={(e) => setForm({ ...form, sqft: e.target.value === '' ? undefined : Number(e.target.value) })} /></div>
          </div>
          <div><label className="label">Standard Rent (optional)</label>
            <input type="number" min={0} step={0.01} className="input" value={form.standardRent ?? ''}
              onChange={(e) => setForm({ ...form, standardRent: e.target.value === '' ? undefined : Number(e.target.value) })} />
            <div className="text-[11px] text-gray-400 mt-1">Used to auto-fill the rent when you create a new tenancy for this unit.</div>
          </div>
          <div className="flex gap-4 text-sm text-gray-700 pt-1">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.parkingIncluded} onChange={(e) => setForm({ ...form, parkingIncluded: e.target.checked })} /> Parking included
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!form.storageIncluded} onChange={(e) => setForm({ ...form, storageIncluded: e.target.checked })} /> Storage included
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      <BulkAddModal<BulkFlatRow>
        open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Add Flats" entityLabel="flat"
        fields={bulkFlatFields} makeEmptyRow={bulkFlatEmptyRow}
        isRowBlank={(r) => !r.unitNo.trim()}
        onCommit={bulkCommit}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this flat?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (confirmDeleteId !== null) remove(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${bulk.count} flat${bulk.count === 1 ? '' : 's'}?`}
        message="This cannot be undone."
        confirmLabel="Delete All Selected"
        requireTypedConfirmation="DELETE"
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />

      {viewFlatId !== null && (
        <FlatDetailModal
          flatId={viewFlatId}
          onClose={() => setViewFlatId(null)}
          onEdit={(f) => { setViewFlatId(null); openEdit(f); }}
        />
      )}
    </div>
  );
}
