import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, Search, SquareParking } from 'lucide-react';
import Modal from '@/components/Modal';
import type { Flat, ParkingSpace } from '@/types';
import { UNIT_TYPES, FLAT_LIFECYCLE_STATUSES, PARKING_TYPES, PARKING_STATUSES } from '@/types';

const emptyFlat = (buildingId: number): Flat => ({
  buildingId, unitNo: '', occupancyStatus: 'vacant', lifecycleStatus: 'active',
  unitType: '', bedrooms: undefined, bathrooms: undefined, sqft: undefined, standardRent: undefined,
});

export default function Flats() {
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Flat>(emptyFlat(buildings[0]?.id ?? 0));

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';

  const filtered = flats.filter((f) =>
    (buildingFilter === 'all' || f.buildingId === buildingFilter) &&
    f.unitNo.toLowerCase().includes(query.toLowerCase())
  );

  function openAdd() { setForm(emptyFlat(buildings[0]?.id ?? 0)); setOpen(true); }
  function openEdit(f: Flat) { setForm({ ...f, lifecycleStatus: f.lifecycleStatus ?? 'active' }); setOpen(true); }

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

      <div className="card overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">#</th>
                <th className="table-th">Unit No</th>
                <th className="table-th">Building</th>
                <th className="table-th">Type</th>
                <th className="table-th">Occupancy</th>
                <th className="table-th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((f, i) => (
                <tr key={f.id}>
                  <td className="table-td">{i + 1}</td>
                  <td className="table-td font-medium text-gray-800">{f.unitNo}</td>
                  <td className="table-td">{buildingName(f.buildingId)}</td>
                  <td className="table-td text-gray-500">{f.unitType || '—'}</td>
                  <td className="table-td">
                    <span className={f.occupancyStatus === 'occupied' ? 'badge-paid' : 'badge-unpaid'}>{f.occupancyStatus}</span>
                    {f.lifecycleStatus && f.lifecycleStatus !== 'active' && (
                      <span className="badge-partial ml-1">{f.lifecycleStatus.replace('_', ' ')}</span>
                    )}
                  </td>
                  <td className="table-td text-right">
                    <button onClick={() => openEdit(f)} className="icon-btn text-brand-500 mr-1"><Pencil size={16} /></button>
                    <button onClick={() => remove(f.id)} className="icon-btn text-red-400"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-8">No flats found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filtered.map((f) => (
            <div key={f.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium text-gray-800">{f.unitNo}</div>
                <div className="text-sm text-gray-500">{buildingName(f.buildingId)}</div>
                <span className={`inline-block mt-1 ${f.occupancyStatus === 'occupied' ? 'badge-paid' : 'badge-unpaid'}`}>{f.occupancyStatus}</span>
              </div>
              <div className="flex items-center shrink-0 gap-1">
                <button onClick={() => openEdit(f)} className="icon-btn text-brand-500"><Pencil size={18} /></button>
                <button onClick={() => remove(f.id)} className="icon-btn text-red-400"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">No flats found</div>
          )}
        </div>

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

      <ParkingPanel buildings={buildings} flats={flats} buildingFilter={buildingFilter} />
    </div>
  );
}

function ParkingPanel({ buildings, flats, buildingFilter }: { buildings: { id?: number; name: string }[]; flats: Flat[]; buildingFilter: number | 'all' }) {
  const spaces = useLiveQuery(() => db.parkingSpaces.toArray(), []) ?? [];
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<ParkingSpace | null>(null);

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const filtered = spaces.filter((s) => buildingFilter === 'all' || s.buildingId === buildingFilter);

  function openAdd() {
    setForm({ buildingId: (buildingFilter !== 'all' ? buildingFilter : buildings[0]?.id) ?? 0, spaceNumber: '', type: 'Uncovered', status: 'vacant', assignedDate: '' });
    setOpen(true);
  }
  function openEdit(s: ParkingSpace) { setForm(s); setOpen(true); }

  async function save() {
    if (!form || !form.spaceNumber.trim() || !form.buildingId) return;
    if (form.id) await db.parkingSpaces.update(form.id, form);
    else await db.parkingSpaces.add(form);
    setOpen(false);
  }

  async function remove(id?: number) {
    if (!id || !confirm('Delete this parking space?')) return;
    await db.parkingSpaces.delete(id);
  }

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700"><SquareParking size={15} /> Parking Spaces</div>
        <button onClick={openAdd} className="btn-primary !py-1.5 !px-3 text-xs flex items-center gap-1.5" disabled={buildings.length === 0}>
          <Plus size={14} /> Add Space
        </button>
      </div>
      <div className="divide-y divide-gray-100">
        {filtered.map((s) => (
          <div key={s.id} className="p-3 flex items-center justify-between gap-3">
            <div>
              <span className="font-medium text-gray-800">{s.spaceNumber}</span>
              <span className="text-xs text-gray-400 ml-2">{buildingName(s.buildingId)} · {s.type}</span>
              {s.flatId && <span className="text-xs text-gray-400 ml-1">· Unit {flats.find((f) => f.id === s.flatId)?.unitNo ?? '—'}</span>}
            </div>
            <div className="flex items-center gap-2">
              <span className={s.status === 'assigned' ? 'badge-paid' : s.status === 'reserved' ? 'badge-partial' : 'badge-unpaid'}>{s.status}</span>
              <button onClick={() => openEdit(s)} className="icon-btn text-brand-500"><Pencil size={15} /></button>
              <button onClick={() => remove(s.id)} className="icon-btn text-red-400"><Trash2 size={15} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-center text-sm text-gray-400 py-6">No parking spaces yet</div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form?.id ? 'Edit Parking Space' : 'Add Parking Space'}>
        {form && (
          <div className="space-y-3">
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
    </div>
  );
}
