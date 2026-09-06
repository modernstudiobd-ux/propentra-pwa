import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, Search, Landmark, Archive, ArchiveRestore, Eye, EyeOff, Layers } from 'lucide-react';
import Modal from '@/components/Modal';
import ConfirmDialog from '@/components/ConfirmDialog';
import BulkAddModal, { type BulkAddField } from '@/components/BulkAddModal';
import PersonDetailModal from '@/components/PersonDetailModal';
import { dateLabel } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { nextDisplayId, nextDisplayIds } from '@/lib/ids';
import { residentIsResident, residentIsOwner } from '@/lib/roles';
import { validateOwnershipPct } from '@/lib/ownership';
import { OWNERSHIP_TYPES, OWNERSHIP_STATUSES } from '@/types';
import { RESIDENTS_DEF, OWNERSHIPS_DEF, fieldAliases } from '@/lib/import/schemas';
import type { Resident, Ownership } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

interface BulkOwnerRow {
  firstName: string; lastName: string; mobile: string; email: string;
  alsoResident: boolean; flatId: string; ownershipPct: number | ''; purchaseDate: string; ownershipType: string;
}

interface OwnerFormState {
  id?: number;
  firstName: string; lastName: string; mobile: string; email: string;
  alsoResident: boolean;
  flatId: number; // the flat this ownership is created/edited for
  ownershipPct: number; purchaseDate: string; ownershipType: string; ownershipId?: number;
}

const emptyOwnerForm = (flats: { id?: number }[]): OwnerFormState => ({
  firstName: '', lastName: '', mobile: '', email: '', alsoResident: false,
  flatId: flats[0]?.id ?? 0, ownershipPct: 100, purchaseDate: todayISO(), ownershipType: 'Sole',
});

/** Manages the Ownership relationship rows (one per owned flat) for a single, already-saved owner. Lets an owner hold multiple flats independently - each with its own %, type, and status. */
function OwnedFlatsPanel({ residentId, flats, buildingName }: { residentId: number; flats: { id?: number; buildingId: number; unitNo: string }[]; buildingName: (id: number) => string }) {
  const ownerships = useLiveQuery(() => db.ownerships.where('residentId').equals(residentId).toArray(), [residentId]) ?? [];
  const [editing, setEditing] = useState<Ownership | null>(null);
  const [pctError, setPctError] = useState('');

  function openNew() {
    const f = flats[0];
    if (!f?.id) return;
    setEditing({ residentId, flatId: f.id, buildingId: f.buildingId, status: 'active', ownershipPct: 100, purchaseDate: todayISO(), ownershipType: 'Sole', notes: '' });
    setPctError('');
  }

  async function save() {
    if (!editing) return;
    const err = await validateOwnershipPct(editing.flatId, editing.ownershipPct, editing.id);
    if (err) { setPctError(err); return; }
    if (editing.id) {
      await db.ownerships.update(editing.id, editing);
      await logAudit({ action: 'ownership_updated', entityType: 'ownership', entityId: editing.id, residentId, buildingId: editing.buildingId, flatId: editing.flatId, summary: `Updated ownership for owner #${residentId}` });
    } else {
      const id = (await db.ownerships.add({ ...editing, displayId: await nextDisplayId('ownerships') })) as number;
      await logAudit({ action: 'ownership_created', entityType: 'ownership', entityId: id, residentId, buildingId: editing.buildingId, flatId: editing.flatId, summary: `Created ownership for owner #${residentId}` });
    }
    setEditing(null);
    setPctError('');
  }

  async function remove(o: Ownership) {
    if (!o.id || !confirm('Remove ownership of this flat?')) return;
    await db.ownerships.delete(o.id);
    await logAudit({ action: 'ownership_deleted', entityType: 'ownership', entityId: o.id, residentId, buildingId: o.buildingId, flatId: o.flatId, summary: `Deleted ownership for owner #${residentId}` });
  }

  return (
    <div className="pt-2 border-t border-gray-100">
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 pt-3 mb-2">
        <Landmark size={14} /> Flats Owned
      </div>
      <div className="space-y-2">
        {ownerships.map((o) => {
          const flat = flats.find((f) => f.id === o.flatId);
          return (
            <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
              <div>
                <span className={o.status === 'active' ? 'badge-paid' : 'badge-unpaid'}>{o.status}</span>
                <span className="ml-2 text-[10px] text-gray-400 font-mono">{o.displayId ?? ''}</span>
                <span className="ml-2 text-gray-700">{flat ? `${buildingName(flat.buildingId)} · ${flat.unitNo}` : 'Unknown flat'}</span>
                <div className="text-[11px] text-gray-400">{o.ownershipPct}% · {o.ownershipType} · Purchased {dateLabel(o.purchaseDate)}</div>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setEditing(o); setPctError(''); }} className="icon-btn text-brand-500"><Pencil size={14} /></button>
                <button onClick={() => remove(o)} className="icon-btn text-red-400"><Trash2 size={14} /></button>
              </div>
            </div>
          );
        })}
        {ownerships.length === 0 && !editing && <div className="text-xs text-gray-400">No flats on file yet.</div>}
        {!editing && flats.length > 0 && (
          <button onClick={openNew} className="flex items-center gap-1 text-xs text-brand-600 font-medium"><Plus size={13} /> Add Flat</button>
        )}
      </div>

      {editing && (
        <div className="mt-2 bg-brand-50/50 rounded-xl p-3 space-y-2">
          <div><label className="label">Flat</label>
            <select className="input" value={editing.flatId} onChange={(e) => {
              const flatId = Number(e.target.value);
              const f = flats.find((x) => x.id === flatId);
              setEditing({ ...editing, flatId, buildingId: f?.buildingId ?? editing.buildingId });
            }}>
              {flats.map((f) => <option key={f.id} value={f.id}>{buildingName(f.buildingId)} · {f.unitNo}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Ownership %</label>
              <input type="number" min={0} max={100} step={0.1} className="input" value={editing.ownershipPct}
                onChange={(e) => setEditing({ ...editing, ownershipPct: Number(e.target.value) })} /></div>
            <div><label className="label">Type</label>
              <select className="input" value={editing.ownershipType} onChange={(e) => setEditing({ ...editing, ownershipType: e.target.value })}>
                {OWNERSHIP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
          </div>
          {pctError && <div className="text-xs text-red-500">{pctError}</div>}
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Purchase Date</label>
              <input type="date" className="input" value={editing.purchaseDate} onChange={(e) => setEditing({ ...editing, purchaseDate: e.target.value })} /></div>
            <div><label className="label">Status</label>
              <select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {OWNERSHIP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} className="btn-primary flex-1 !py-1.5 !text-xs">Save</button>
            <button onClick={() => setEditing(null)} className="btn-secondary flex-1 !py-1.5 !text-xs">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Owners() {
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const ownerships = useLiveQuery(() => db.ownerships.toArray(), []) ?? [];
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState('');
  const [flatFilter, setFlatFilter] = useState<number | 'all'>('all');
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [form, setForm] = useState<OwnerFormState>(emptyOwnerForm([]));
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [viewPersonId, setViewPersonId] = useState<number | null>(null);

  // Prefill from the global search bar (e.g. /owners?q=Jane) - one-time on load.
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';

  // Owners ONLY - people with an Ownership relationship. An owner who does
  // not also live in their flat still shows up here (that's the whole
  // point - ownership never implies residency), and never appears on the
  // Residents page or counts toward a resident headcount.
  const owners = residents.filter((r) => residentIsOwner(r) && (showArchived || !r.archived));

  const ownershipsByResident = (residentId?: number) => ownerships.filter((o) => o.residentId === residentId);

  const filtered = owners.filter((r) => {
    if (query && !r.name.toLowerCase().includes(query.toLowerCase()) && !r.email.toLowerCase().includes(query.toLowerCase())) return false;
    if (flatFilter !== 'all') {
      const owned = ownershipsByResident(r.id).map((o) => o.flatId);
      const hasDirect = r.flatId === flatFilter; // legacy single-flat owners with no Ownership row yet
      if (!owned.includes(flatFilter) && !hasDirect) return false;
    }
    return true;
  });

  function openAdd() { setForm(emptyOwnerForm(flats)); setOpen(true); }

  function openEdit(r: Resident) {
    setForm({
      id: r.id, firstName: r.firstName ?? '', lastName: r.lastName ?? '', mobile: r.mobile, email: r.email,
      alsoResident: residentIsResident(r), flatId: r.flatId || flats[0]?.id || 0,
      ownershipPct: 100, purchaseDate: todayISO(), ownershipType: 'Sole',
    });
    setOpen(true);
  }

  async function save() {
    const name = [form.firstName, form.lastName].filter((s) => s.trim()).join(' ').trim();
    if (!name) return;

    if (form.id) {
      // Editing contact info / residency toggle of an existing owner - flat
      // ownership rows themselves are managed in the panel below, once saved.
      await db.residents.update(form.id, {
        name, firstName: form.firstName, lastName: form.lastName, mobile: form.mobile, email: form.email,
        isOwner: true, isResident: form.alsoResident, type: form.alsoResident ? 'Tenant' : 'Owner',
      });
      await logAudit({
        action: 'resident_updated', entityType: 'resident', entityId: form.id,
        residentId: form.id, summary: `Updated owner ${name}`,
      });
      setOpen(false);
      return;
    }

    if (!form.flatId) { alert('Choose a flat for this owner.'); return; }
    const flat = flats.find((f) => f.id === form.flatId);
    if (!flat) return;
    const pctError = await validateOwnershipPct(form.flatId, form.ownershipPct);
    if (pctError) { alert(pctError); return; }

    await db.transaction('rw', [db.residents, db.ownerships, db.auditLog, db.sequences], async () => {
      const displayId = await nextDisplayId('residents');
      const residentId = (await db.residents.add({
        name, firstName: form.firstName, lastName: form.lastName, mobile: form.mobile, email: form.email,
        flatId: form.flatId, buildingId: flat.buildingId, unitLabel: flat.unitNo,
        type: form.alsoResident ? 'Tenant' : 'Owner', isOwner: true, isResident: form.alsoResident,
        status: 'current', moveInDate: form.alsoResident ? todayISO() : undefined, isBillingContact: false,
        displayId,
      } as Resident)) as number;

      const ownershipDisplayId = await nextDisplayId('ownerships');
      await db.ownerships.add({
        residentId, flatId: form.flatId, buildingId: flat.buildingId, status: 'active',
        ownershipPct: form.ownershipPct, purchaseDate: form.purchaseDate, ownershipType: form.ownershipType,
        displayId: ownershipDisplayId,
      });

      await logAudit({
        action: 'resident_created', entityType: 'resident', entityId: residentId,
        buildingId: flat.buildingId, flatId: form.flatId, residentId,
        summary: `Added owner ${name}${form.alsoResident ? ' (also resident)' : ''}`,
      });
    });
    setOpen(false);
  }

  async function remove(id: number) {
    const r = residents.find((x) => x.id === id);
    await db.transaction('rw', [db.residents, db.ownerships, db.auditLog], async () => {
      await db.ownerships.where('residentId').equals(id).delete();
      await db.residents.delete(id);
      await logAudit({
        action: 'resident_deleted', entityType: 'resident', entityId: id,
        residentId: id, summary: `Permanently deleted owner ${r?.name ?? '#' + id}`,
      });
    });
    setConfirmDeleteId(null);
  }

  async function archive(r: Resident) {
    if (!r.id) return;
    await db.residents.update(r.id, { archived: true, archivedAt: new Date().toISOString() });
    await logAudit({ action: 'resident_archived', entityType: 'resident', entityId: r.id, residentId: r.id, summary: `Archived owner ${r.name}` });
  }
  async function unarchive(r: Resident) {
    if (!r.id) return;
    await db.residents.update(r.id, { archived: false, archivedAt: undefined });
    await logAudit({ action: 'resident_unarchived', entityType: 'resident', entityId: r.id, residentId: r.id, summary: `Unarchived owner ${r.name}` });
  }

  const BULK_FIELDS: BulkAddField<BulkOwnerRow>[] = [
    { key: 'firstName', label: 'First Name', type: 'text', required: true, placeholder: 'Jane', aliases: fieldAliases(RESIDENTS_DEF, 'firstName') },
    { key: 'lastName', label: 'Last Name', type: 'text', placeholder: 'Doe', aliases: fieldAliases(RESIDENTS_DEF, 'lastName') },
    { key: 'mobile', label: 'Mobile', type: 'text', aliases: fieldAliases(RESIDENTS_DEF, 'mobile') },
    { key: 'email', label: 'Email', type: 'text', aliases: fieldAliases(RESIDENTS_DEF, 'email') },
    { key: 'flatId', label: 'Flat', type: 'select', options: flats.map((f) => ({ value: String(f.id), label: `${buildingName(f.buildingId)} · ${f.unitNo}` })), required: true, aliases: fieldAliases(OWNERSHIPS_DEF, 'flatRef') },
    { key: 'ownershipPct', label: 'Ownership %', type: 'number', aliases: fieldAliases(OWNERSHIPS_DEF, 'ownershipPct') },
    { key: 'ownershipType', label: 'Type', type: 'select', options: [...OWNERSHIP_TYPES], aliases: fieldAliases(OWNERSHIPS_DEF, 'ownershipType') },
    { key: 'purchaseDate', label: 'Purchase Date', type: 'date', aliases: fieldAliases(OWNERSHIPS_DEF, 'purchaseDate') },
    { key: 'alsoResident', label: 'Also Resident', type: 'checkbox', aliases: fieldAliases(RESIDENTS_DEF, 'isResident') },
  ];
  const bulkOwnerEmptyRow = (): BulkOwnerRow => ({
    firstName: '', lastName: '', mobile: '', email: '', alsoResident: false,
    flatId: String(flats[0]?.id ?? ''), ownershipPct: 100, purchaseDate: todayISO(), ownershipType: 'Sole',
  });

  // Each row creates one Resident (owner, optionally also resident) plus
  // its own Ownership record for the chosen flat - mirroring what the
  // single Add Owner form does, just for many rows at once.
  async function commitBulkAdd(rows: BulkOwnerRow[]) {
    const validRows = rows.filter((r) => flats.some((f) => String(f.id) === r.flatId));
    if (validRows.length === 0) return;
    const residentIds = await nextDisplayIds('residents', validRows.length);
    const ownershipIds = await nextDisplayIds('ownerships', validRows.length);
    await db.transaction('rw', [db.residents, db.ownerships, db.auditLog], async () => {
      for (let i = 0; i < validRows.length; i++) {
        const r = validRows[i];
        const flat = flats.find((f) => String(f.id) === r.flatId)!;
        const name = [r.firstName, r.lastName].filter((s) => s.trim()).join(' ').trim();
        const pct = r.ownershipPct === '' ? 100 : Number(r.ownershipPct);
        const residentId = (await db.residents.add({
          name, firstName: r.firstName.trim(), lastName: r.lastName.trim(), mobile: r.mobile.trim(), email: r.email.trim(),
          flatId: flat.id!, buildingId: flat.buildingId, unitLabel: flat.unitNo,
          type: r.alsoResident ? 'Tenant' : 'Owner', isOwner: true, isResident: r.alsoResident,
          status: 'current', moveInDate: r.alsoResident ? todayISO() : undefined, isBillingContact: false,
          displayId: residentIds[i],
        } as Resident)) as number;

        await db.ownerships.add({
          residentId, flatId: flat.id!, buildingId: flat.buildingId, status: 'active',
          ownershipPct: pct, purchaseDate: r.purchaseDate || todayISO(), ownershipType: r.ownershipType || 'Sole',
          displayId: ownershipIds[i],
        });

        await logAudit({
          action: 'resident_created', entityType: 'resident', entityId: residentId,
          buildingId: flat.buildingId, flatId: flat.id, residentId,
          summary: `Added owner ${name}${r.alsoResident ? ' (also resident)' : ''} (bulk import)`,
        });
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search owners..." className="input pl-9" />
          </div>
          <select className="input sm:w-52" value={flatFilter} onChange={(e) => setFlatFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All Flats</option>
            {flats.map((f) => <option key={f.id} value={f.id}>{buildingName(f.buildingId)} · {f.unitNo}</option>)}
          </select>
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border shrink-0 flex items-center gap-1.5 ${showArchived ? 'bg-gray-100 border-gray-200 text-gray-700' : 'border-gray-200 text-gray-500'}`}
          >
            {showArchived ? <EyeOff size={14} /> : <Eye size={14} />} {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setBulkOpen(true)} className="btn-secondary flex items-center gap-2 justify-center" disabled={flats.length === 0}>
            <Layers size={16} /> Bulk Add
          </button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2 justify-center" disabled={flats.length === 0}
            title={flats.length === 0 ? 'Add a flat first before adding owners' : undefined}>
            <Plus size={16} /> Add Owner
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[720px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">ID</th>
                <th className="table-th">Owner</th>
                <th className="table-th">Contact</th>
                <th className="table-th">Flats</th>
                <th className="table-th">Status</th>
                <th className="table-th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => {
                const owned = ownershipsByResident(r.id);
                const flatLabels = owned.length > 0
                  ? owned.map((o) => { const f = flats.find((x) => x.id === o.flatId); return f ? `${f.unitNo} (${o.ownershipPct}%)` : null; }).filter(Boolean)
                  : (r.flatId ? [r.unitLabel] : []);
                return (
                  <tr key={r.id} className={r.archived ? 'opacity-60' : ''}>
                    <td className="table-td font-mono text-xs text-gray-500">{r.displayId ?? '—'}</td>
                    <td className="table-td font-medium text-gray-800">
                      <button onClick={() => setViewPersonId(r.id!)} className="hover:text-brand-600 hover:underline">{r.name}</button>
                    </td>
                    <td className="table-td text-gray-500">{r.mobile || r.email || '—'}</td>
                    <td className="table-td text-gray-600">{flatLabels.length > 0 ? flatLabels.join(', ') : 'No flat on file'}</td>
                    <td className="table-td">
                      <span className={residentIsResident(r) ? 'badge-paid' : 'badge-partial'}>{residentIsResident(r) ? 'Owner + Resident' : 'Owner only'}</span>
                      {r.archived && <span className="badge-unpaid ml-1">Archived</span>}
                    </td>
                    <td className="table-td text-right">
                      <button onClick={() => setViewPersonId(r.id!)} className="icon-btn text-gray-400 mr-1" title="View profile"><Eye size={16} /></button>
                      <button onClick={() => openEdit(r)} className="icon-btn text-brand-500 mr-1"><Pencil size={16} /></button>
                      {r.archived ? (
                        <button onClick={() => unarchive(r)} className="icon-btn text-brand-500 mr-1" title="Unarchive"><ArchiveRestore size={16} /></button>
                      ) : (
                        <button onClick={() => archive(r)} className="icon-btn text-gray-400 mr-1" title="Archive"><Archive size={16} /></button>
                      )}
                      <button onClick={() => setConfirmDeleteId(r.id!)} className="icon-btn text-red-400" title="Permanently delete"><Trash2 size={16} /></button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-8">No owners found</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filtered.map((r) => {
            const owned = ownershipsByResident(r.id);
            const flatLabels = owned.length > 0
              ? owned.map((o) => { const f = flats.find((x) => x.id === o.flatId); return f ? `${buildingName(f.buildingId)} · ${f.unitNo} (${o.ownershipPct}%)` : null; }).filter(Boolean)
              : (r.flatId ? [`${buildingName(r.buildingId)} · ${r.unitLabel}`] : []);
            return (
              <div key={r.id} className={`p-4 flex items-start justify-between gap-3 ${r.archived ? 'opacity-60' : ''}`}>
                <button onClick={() => setViewPersonId(r.id!)} className="min-w-0 text-left">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-gray-400 font-mono">{r.displayId ?? '—'}</span>
                    <span className="font-medium text-gray-800">{r.name}</span>
                    <span className={residentIsResident(r) ? 'badge-paid' : 'badge-partial'}>{residentIsResident(r) ? 'Owner + Resident' : 'Owner only'}</span>
                    {r.archived && <span className="badge-unpaid">Archived</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{r.mobile || '—'} · {r.email || '—'}</div>
                  <div className="text-[11px] text-gray-500 mt-1">{flatLabels.length > 0 ? flatLabels.join(', ') : 'No flat on file'}</div>
                </button>
                <div className="flex items-center shrink-0 gap-1">
                  <button onClick={() => openEdit(r)} className="icon-btn text-brand-500"><Pencil size={18} /></button>
                  {r.archived ? (
                    <button onClick={() => unarchive(r)} className="icon-btn text-brand-500" title="Unarchive"><ArchiveRestore size={18} /></button>
                  ) : (
                    <button onClick={() => archive(r)} className="icon-btn text-gray-400" title="Archive"><Archive size={18} /></button>
                  )}
                  <button onClick={() => setConfirmDeleteId(r.id!)} className="icon-btn text-red-400" title="Permanently delete"><Trash2 size={18} /></button>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No owners found</div>}
        </div>

        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">Total: {filtered.length} owner{filtered.length !== 1 ? 's' : ''}</div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit Owner' : 'Add Owner'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">First Name *</label>
              <input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></div>
            <div><label className="label">Last Name</label>
              <input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></div>
          </div>
          <div><label className="label">Mobile (optional)</label>
            <input className="input" value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          <div><label className="label">Email (optional)</label>
            <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={form.alsoResident} onChange={(e) => setForm({ ...form, alsoResident: e.target.checked })} />
            Also lives in one of their flats
          </label>
          <div className="text-[11px] text-gray-400 -mt-2">Leave unchecked for an offsite owner who does not live here - they'll never appear on the Residents page or count toward a resident total.</div>

          {!form.id && (
            <div className="pt-2 border-t border-gray-100 space-y-3">
              <div className="text-sm font-medium text-gray-700 pt-2">First Flat Owned</div>
              <div><label className="label">Flat</label>
                <select className="input" value={form.flatId} onChange={(e) => setForm({ ...form, flatId: Number(e.target.value) })}>
                  {flats.map((f) => <option key={f.id} value={f.id}>{buildingName(f.buildingId)} · {f.unitNo}</option>)}
                </select></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Ownership %</label>
                  <input type="number" min={0} max={100} step={0.1} className="input" value={form.ownershipPct} onChange={(e) => setForm({ ...form, ownershipPct: Number(e.target.value) })} /></div>
                <div><label className="label">Type</label>
                  <select className="input" value={form.ownershipType} onChange={(e) => setForm({ ...form, ownershipType: e.target.value })}>
                    {OWNERSHIP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select></div>
              </div>
              <div><label className="label">Purchase Date</label>
                <input type="date" className="input" value={form.purchaseDate} onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })} /></div>
              <div className="text-[11px] text-gray-400">Additional flats can be added after saving.</div>
            </div>
          )}

          {form.id && <OwnedFlatsPanel residentId={form.id} flats={flats} buildingName={buildingName} />}

          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>

      <BulkAddModal<BulkOwnerRow>
        open={bulkOpen} onClose={() => setBulkOpen(false)} title="Bulk Add Owners" entityLabel="owner"
        fields={BULK_FIELDS} makeEmptyRow={bulkOwnerEmptyRow}
        isRowBlank={(r) => !r.firstName.trim() && !r.lastName.trim()}
        onCommit={commitBulkAdd}
      />

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="Permanently delete this owner?"
        message="This removes the person and every ownership record for their flats. This cannot be undone."
        onConfirm={() => confirmDeleteId !== null && remove(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />

      {viewPersonId !== null && (
        <PersonDetailModal
          residentId={viewPersonId}
          onClose={() => setViewPersonId(null)}
          onEdit={(r) => { setViewPersonId(null); openEdit(r); }}
        />
      )}
    </div>
  );
}
