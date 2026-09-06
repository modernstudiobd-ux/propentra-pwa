import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, SquareParking, Layers } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import BulkToolbar from '@/components/BulkToolbar';
import BulkAddModal, { type BulkAddField } from '@/components/BulkAddModal';
import { useBulkSelection } from '@/hooks/useBulkSelection';
import type { Flat, ParkingSpace } from '@/types';
import { PARKING_TYPES, PARKING_STATUSES } from '@/types';
import { nextDisplayId, nextDisplayIds } from '@/lib/ids';
import { PARKING_SPACES_DEF, fieldAliases } from '@/lib/import/schemas';

type BulkParkingRow = { spaceNumber: string; type: string };
const bulkParkingFields: BulkAddField<BulkParkingRow>[] = [
  { key: 'spaceNumber', label: 'Space Number', type: 'text', required: true, placeholder: 'P-12', aliases: fieldAliases(PARKING_SPACES_DEF, 'spaceNumber') },
  { key: 'type', label: 'Type', type: 'select', options: [...PARKING_TYPES], aliases: fieldAliases(PARKING_SPACES_DEF, 'type') },
];
const bulkParkingEmptyRow = (): BulkParkingRow => ({ spaceNumber: '', type: 'Uncovered' });

/** Manages Parking Space records (which also cover Garage spaces - Garage is just a `type`, not a separate table). Reused on the dedicated Parking page and, in read-only summary form, from the Flat detail view. */
export default function ParkingPanel({
  buildings, flats, buildingFilter, flatFilter, query,
}: {
  buildings: { id?: number; name: string }[];
  flats: Flat[];
  buildingFilter: number | 'all';
  flatFilter?: number | 'all';
  query?: string;
}) {
  const spaces = useLiveQuery(() => db.parkingSpaces.toArray(), []) ?? [];
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState<ParkingSpace | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [vacantOnly, setVacantOnly] = useState(false);

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const q = (query ?? '').trim().toLowerCase();
  const filtered = spaces.filter((s) =>
    (buildingFilter === 'all' || s.buildingId === buildingFilter) &&
    (!flatFilter || flatFilter === 'all' || s.flatId === flatFilter) &&
    (!vacantOnly || s.status === 'vacant') &&
    (!q || `${s.spaceNumber} ${s.displayId ?? ''}`.toLowerCase().includes(q))
  );
  const bulk = useBulkSelection(filtered);

  function openAdd() {
    setForm({ buildingId: (buildingFilter !== 'all' ? buildingFilter : buildings[0]?.id) ?? 0, flatId: flatFilter && flatFilter !== 'all' ? flatFilter : undefined, spaceNumber: '', type: 'Uncovered', status: 'vacant', assignedDate: '' });
    setOpen(true);
  }
  function openEdit(s: ParkingSpace) { setForm(s); setOpen(true); }

  async function save() {
    if (!form || !form.spaceNumber.trim() || !form.buildingId) return;
    if (form.id) await db.parkingSpaces.update(form.id, form);
    else await db.parkingSpaces.add({ ...form, displayId: await nextDisplayId('parkingSpaces') });
    setOpen(false);
  }

  async function remove(id: number) {
    await db.parkingSpaces.delete(id);
  }

  async function bulkDelete() {
    await db.parkingSpaces.bulkDelete(bulk.selectedIds());
    bulk.clear();
    setConfirmBulkDelete(false);
  }

  async function bulkCommit(rows: BulkParkingRow[]) {
    const targetBuildingId = buildingFilter !== 'all' ? buildingFilter : buildings[0]?.id;
    if (!targetBuildingId) return;
    const displayIds = await nextDisplayIds('parkingSpaces', rows.length);
    await db.parkingSpaces.bulkAdd(rows.map((r, i) => ({
      buildingId: targetBuildingId, spaceNumber: r.spaceNumber.trim(), type: r.type, status: 'vacant', displayId: displayIds[i],
    })));
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700"><SquareParking size={15} /> Parking Spaces (incl. Garages)</div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-gray-600 whitespace-nowrap px-1">
            <input type="checkbox" checked={vacantOnly} onChange={(e) => setVacantOnly(e.target.checked)} /> Vacant only
          </label>
          <button onClick={() => setBulkOpen(true)} className="btn-secondary !py-1.5 !px-3 text-xs flex items-center gap-1.5" disabled={buildings.length === 0}>
            <Layers size={14} /> Bulk Add
          </button>
          <button onClick={openAdd} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5" disabled={buildings.length === 0}>
            <Plus size={14} /> Add Space
          </button>
        </div>
      </div>
      <div className="px-4 pt-3 space-y-2">
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={bulk.allSelected} onChange={bulk.toggleAll} disabled={filtered.length === 0} />
          Select all {filtered.length} space{filtered.length === 1 ? '' : 's'}
        </label>
        <BulkToolbar count={bulk.count} onDelete={() => setConfirmBulkDelete(true)} onClear={bulk.clear} />
      </div>
      <div className="divide-y divide-gray-100">
        {filtered.map((s) => (
          <div key={s.id} className={`p-3 flex items-center justify-between gap-3 ${bulk.isSelected(s.id) ? 'bg-brand-50/40' : ''}`}>
            <div className="flex items-center gap-3">
              <input type="checkbox" checked={bulk.isSelected(s.id)} onChange={() => bulk.toggle(s.id)} />
              <div>
                <span className="text-[10px] font-mono text-gray-400 mr-1.5">{s.displayId ?? '—'}</span>
                <span className="font-medium text-gray-800">{s.spaceNumber}</span>
                <span className="text-xs text-gray-400 ml-2">{buildingName(s.buildingId)} · {s.type}</span>
                {s.flatId && <span className="text-xs text-gray-400 ml-1">· Unit {flats.find((f) => f.id === s.flatId)?.unitNo ?? '—'}</span>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className={s.status === 'assigned' ? 'badge-paid' : s.status === 'reserved' ? 'badge-partial' : 'badge-unpaid'}>{s.status}</span>
              <button onClick={() => openEdit(s)} className="icon-btn text-brand-500"><Pencil size={15} /></button>
              <button onClick={() => setConfirmDeleteId(s.id!)} className="icon-btn text-red-400"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-6">{vacantOnly ? 'No vacant parking spaces' : 'No parking spaces yet'}</div>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form?.id ? 'Edit Parking Space' : 'Add Parking Space'}>
        {form && (
          <div className="space-y-3">
            {form.displayId && <div className="text-xs font-mono text-gray-400">{form.displayId}</div>}
            <div><label className="label">Building</label>
              <select className="input" value={form.buildingId} onChange={(e) => setForm({ ...form, buildingId: Number(e.target.value) })}>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className="label">Space Number</label>
              <input className="input" value={form.spaceNumber} onChange={(e) => setForm({ ...form, spaceNumber: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Type</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {PARKING_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select></div>
              <div><label className="label">Status</label>
                <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {PARKING_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select></div>
            </div>
            <div><label className="label">Assigned Unit (optional)</label>
              <select className="input" value={form.flatId ?? ''} onChange={(e) => setForm({ ...form, flatId: e.target.value === '' ? undefined : Number(e.target.value) })}>
                <option value="">— None —</option>
                {flats.filter((f) => f.buildingId === form.buildingId).map((f) => <option key={f.id} value={f.id}>{f.unitNo}</option>)}
              </select></div>
            <div className="flex gap-2 pt-2">
              <button onClick={save} className="btn-primary flex-1">Save</button>
              <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      <BulkAddModal<BulkParkingRow>
        open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Add Parking Spaces" entityLabel="parking space"
        fields={bulkParkingFields} makeEmptyRow={bulkParkingEmptyRow}
        isRowBlank={(r) => !r.spaceNumber.trim()}
        onCommit={bulkCommit}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Delete this parking space?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={() => { if (confirmDeleteId !== null) remove(confirmDeleteId); setConfirmDeleteId(null); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmDialog
        open={confirmBulkDelete}
        title={`Delete ${bulk.count} parking space${bulk.count === 1 ? '' : 's'}?`}
        message="This cannot be undone."
        confirmLabel="Delete All Selected"
        requireTypedConfirmation="DELETE"
        onConfirm={bulkDelete}
        onCancel={() => setConfirmBulkDelete(false)}
      />
    </div>
  );
}
