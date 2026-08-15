import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Plus, Pencil, Trash2, Search, IdCard, Wallet, Building2, Eye, EyeOff, Archive, ArchiveRestore } from 'lucide-react';
import { Link } from 'react-router-dom';
import Modal from '@/components/Modal';
import { dateLabel } from '@/lib/format';
import { validateImageFile, fileToBase64 } from '@/lib/fileValidation';
import type { Resident, ResidentType, ResidentStatus } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

const emptyForm = (flats: { id?: number; buildingId: number; unitNo: string }[]): Resident => {
  const f = flats[0];
  return {
    name: '', mobile: '', email: '', flatId: f?.id ?? 0, buildingId: f?.buildingId ?? 0, unitLabel: f?.unitNo ?? '',
    type: 'Tenant', status: 'current', moveInDate: todayISO(), moveOutDate: '', isBillingContact: true,
    idType: '', idNumber: '', idIssueDate: '', idExpiryDate: '', idDocumentImage: '',
  };
};

export default function Residents() {
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const depositTxns = useLiveQuery(() => db.depositTransactions.toArray(), []) ?? [];
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | ResidentType>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | ResidentStatus>('current');
  const [showArchived, setShowArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Resident>(emptyForm([]));
  const [revealId, setRevealId] = useState(false);
  const [revealDoc, setRevealDoc] = useState(false);
  const [idFileError, setIdFileError] = useState('');

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const statusOf = (r: Resident): ResidentStatus => r.status ?? 'current';
  const isBillingContactOf = (r: Resident): boolean => r.isBillingContact ?? true;
  const depositBalance = (residentId?: number) => {
    if (!residentId) return 0;
    return depositTxns.filter((t) => t.residentId === residentId && !t.voided).reduce((sum, t) => {
      if (t.type === 'collected') return sum + t.amount;
      if (t.type === 'applied' || t.type === 'refunded') return sum - t.amount;
      if (t.type === 'adjustment') return sum + t.amount;
      return sum;
    }, 0);
  };

  const filtered = residents.filter((r) =>
    (showArchived || !r.archived) &&
    (typeFilter === 'all' || r.type === typeFilter) &&
    (statusFilter === 'all' || statusOf(r) === statusFilter) &&
    (r.name.toLowerCase().includes(query.toLowerCase()) || r.email.toLowerCase().includes(query.toLowerCase()))
  );

  // Group filtered residents by flat, so multiple residents on one flat
  // (owner + tenant, or resident history) are visually grouped together
  // instead of scattered across an undifferentiated list.
  const groups = flats
    .map((f) => ({ flat: f, residents: filtered.filter((r) => r.flatId === f.id) }))
    .filter((g) => g.residents.length > 0)
    .sort((a, b) => buildingName(a.flat.buildingId).localeCompare(buildingName(b.flat.buildingId)) || a.flat.unitNo.localeCompare(b.flat.unitNo));

  function openAdd() { setForm(emptyForm(flats)); setIdFileError(''); setRevealId(false); setRevealDoc(false); setOpen(true); }
  function openEdit(r: Resident) {
    setRevealId(false); setRevealDoc(false);
    setForm({
      ...r, status: statusOf(r), isBillingContact: isBillingContactOf(r),
      moveInDate: r.moveInDate ?? '', moveOutDate: r.moveOutDate ?? '',
      idType: r.idType ?? '', idNumber: r.idNumber ?? '', idIssueDate: r.idIssueDate ?? '', idExpiryDate: r.idExpiryDate ?? '',
    });
    setIdFileError('');
    setOpen(true);
  }

  function onFlatChange(flatId: number) {
    const f = flats.find((x) => x.id === flatId);
    setForm({ ...form, flatId, buildingId: f?.buildingId ?? 0, unitLabel: f?.unitNo ?? '' });
  }

  async function onIdFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setIdFileError(err); return; }
    setIdFileError('');
    const data = await fileToBase64(file);
    setForm({ ...form, idDocumentImage: data });
  }

  async function save() {
    if (!form.name.trim()) return;

    if (form.idIssueDate && form.idExpiryDate && form.idExpiryDate < form.idIssueDate) {
      alert('ID expiry date must be after the issue date.');
      return;
    }

    // Adding a new current resident to a flat that already has one is often
    // intentional (owner + tenant, roommates) but sometimes a mistake
    // (duplicate entry) - confirm rather than silently allowing either way.
    if (!form.id && form.status === 'current') {
      const existingCurrent = residents.filter((r) => r.flatId === form.flatId && statusOf(r) === 'current');
      if (existingCurrent.length > 0) {
        const names = existingCurrent.map((r) => r.name).join(', ');
        const ok = confirm(`This flat already has ${existingCurrent.length} current resident(s): ${names}.\n\nAdd ${form.name} as another current resident on the same flat?`);
        if (!ok) return;
      }
    }

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
    if (!confirm('Permanently delete this resident? This cannot be undone - their billing/payment history will remain but no longer link to a name.\n\nConsider Archiving instead if you just want them out of the way while keeping the record.')) return;
    await db.residents.delete(id);
  }

  async function archive(r: Resident) {
    if (!r.id) return;
    await db.residents.update(r.id, { archived: true, archivedAt: new Date().toISOString() });
  }

  async function unarchive(r: Resident) {
    if (!r.id) return;
    await db.residents.update(r.id, { archived: false, archivedAt: undefined });
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
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`px-3 py-2 rounded-lg text-sm font-medium border shrink-0 flex items-center gap-1.5 ${showArchived ? 'bg-gray-100 border-gray-200 text-gray-700' : 'border-gray-200 text-gray-500'}`}
          >
            {showArchived ? <EyeOff size={14} /> : <Eye size={14} />} {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
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

      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.flat.id} className="card overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                <Building2 size={14} className="text-gray-400" />
                {buildingName(g.flat.buildingId)} · Flat {g.flat.unitNo}
              </div>
              <span className="text-xs text-gray-400">{g.residents.length} resident{g.residents.length > 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {g.residents.map((r) => {
                const bal = depositBalance(r.id);
                return (
                  <div key={r.id} className={`p-4 flex items-start justify-between gap-3 ${r.archived ? 'opacity-60' : ''}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-800">{r.name}</span>
                        <span className={r.type === 'Owner' ? 'badge-partial' : 'badge-paid'}>{r.type === 'Owner' ? 'Flat Owner' : 'Tenant'}</span>
                        <span className={statusOf(r) === 'current' ? 'badge-paid' : 'badge-unpaid'}>{statusOf(r) === 'current' ? 'Current' : 'Former'}</span>
                        {r.archived && <span className="badge-partial">Archived</span>}
                        {isBillingContactOf(r) && statusOf(r) === 'current' && (
                          <span className="text-[10px] text-brand-500 font-medium">● billed</span>
                        )}
                        {r.idNumber && <IdCard size={13} className="text-gray-400" aria-label="ID on file" />}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{r.mobile || '—'} · {r.email || '—'}</div>
                      {statusOf(r) === 'former' && r.moveOutDate && <div className="text-[10px] text-gray-400 mt-0.5">Moved out {dateLabel(r.moveOutDate)}</div>}
                      {statusOf(r) === 'current' && r.moveInDate && <div className="text-[10px] text-gray-400 mt-0.5">Since {dateLabel(r.moveInDate)}</div>}
                      {bal !== 0 && (
                        <div className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                          <Wallet size={11} /> Deposit balance: {bal.toFixed(2)}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center shrink-0 gap-1">
                      <button onClick={() => openEdit(r)} className="icon-btn text-brand-500"><Pencil size={18} /></button>
                      {r.archived ? (
                        <button onClick={() => unarchive(r)} className="icon-btn text-brand-500" title="Unarchive"><ArchiveRestore size={18} /></button>
                      ) : (
                        <button onClick={() => archive(r)} className="icon-btn text-gray-400" title="Archive (hide, but keep the record)"><Archive size={18} /></button>
                      )}
                      <button onClick={() => remove(r.id)} className="icon-btn text-red-400" title="Permanently delete"><Trash2 size={18} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {groups.length === 0 && (
          <div className="card p-8 text-center text-sm text-gray-400">No residents found</div>
        )}
        <div className="text-xs text-gray-400 px-1">Total: {filtered.length} resident{filtered.length !== 1 ? 's' : ''} across {groups.length} flat{groups.length !== 1 ? 's' : ''}</div>
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

          <div className="pt-2 border-t border-gray-100">
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 pt-3 mb-2">
              <IdCard size={14} /> ID Verification (optional)
            </div>
            <div className="text-[11px] text-gray-400 mb-2">Some jurisdictions require landlords to keep a copy of tenant ID on file. Stored locally only — nothing leaves this device.</div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">ID Type</label>
                <input className="input" placeholder="e.g. Passport, National ID" value={form.idType ?? ''} onChange={(e) => setForm({ ...form, idType: e.target.value })} /></div>
              <div><label className="label">ID Number</label>
                <div className="relative">
                  <input
                    type={revealId ? 'text' : 'password'}
                    className="input pr-9"
                    value={form.idNumber ?? ''}
                    onChange={(e) => setForm({ ...form, idNumber: e.target.value })}
                  />
                  <button type="button" onClick={() => setRevealId((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {revealId ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div><label className="label">Issue Date</label>
                <input type="date" className="input" value={form.idIssueDate ?? ''} onChange={(e) => setForm({ ...form, idIssueDate: e.target.value })} /></div>
              <div><label className="label">Expiry Date</label>
                <input type="date" className="input" value={form.idExpiryDate ?? ''} onChange={(e) => setForm({ ...form, idExpiryDate: e.target.value })} />
                {form.idExpiryDate && form.idExpiryDate < todayISO() && (
                  <div className="text-xs text-red-500 mt-1">This ID has expired.</div>
                )}
              </div>
            </div>
            <div className="mt-3">
              <label className="label">ID Document (photo/scan)</label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden shrink-0">
                  {form.idDocumentImage ? (
                    revealDoc ? (
                      <img src={form.idDocumentImage} className="w-full h-full object-cover" />
                    ) : (
                      <button type="button" onClick={() => setRevealDoc(true)} className="flex flex-col items-center gap-0.5 text-gray-400 hover:text-brand-500" title="Click to view">
                        <Eye size={16} /><span className="text-[9px]">View</span>
                      </button>
                    )
                  ) : <IdCard className="text-gray-300" size={20} />}
                </div>
                <label className="btn-secondary cursor-pointer text-xs">
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={onIdFileChange} />
                </label>
                {form.idDocumentImage && (
                  <button onClick={() => { setForm({ ...form, idDocumentImage: '' }); setRevealDoc(false); }} className="text-red-400 hover:text-red-600 text-xs">Remove</button>
                )}
              </div>
              {idFileError && <div className="text-xs text-red-500 mt-1">{idFileError}</div>}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
