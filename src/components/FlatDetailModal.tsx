import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { Link } from 'react-router-dom';
import {
  X, Pencil, Home, Landmark, Users, SquareParking, Warehouse, Wallet, FolderOpen, History as HistoryIcon, ChevronRight,
} from 'lucide-react';
import { money, dateLabel } from '@/lib/format';
import { residentIsResident, residentIsOwner } from '@/lib/roles';
import type { Flat } from '@/types';

/**
 * Aggregated, read-only view of everything tied to one flat - the central
 * context a property manager reaches for most often. Every relationship
 * shown here already exists elsewhere in the app (Owners, Residents,
 * Parking, Billing, Documents, Audit Log); this view just brings them
 * together instead of asking the user to visit six different pages.
 */
export default function FlatDetailModal({
  flatId, onClose, onEdit,
}: { flatId: number; onClose: () => void; onEdit: (flat: Flat) => void }) {
  const flat = useLiveQuery(() => db.flats.get(flatId), [flatId]);
  const building = useLiveQuery(() => (flat ? db.buildings.get(flat.buildingId) : undefined), [flat?.buildingId]);
  const residents = useLiveQuery(() => db.residents.where('flatId').equals(flatId).toArray(), [flatId]) ?? [];
  const ownerships = useLiveQuery(() => db.ownerships.where('flatId').equals(flatId).toArray(), [flatId]) ?? [];
  const parkingSpaces = useLiveQuery(() => db.parkingSpaces.where('flatId').equals(flatId).toArray(), [flatId]) ?? [];
  const bills = useLiveQuery(() => db.bills.where('flatId').equals(flatId).toArray(), [flatId]) ?? [];
  const depositTxns = useLiveQuery(() => db.depositTransactions.where('flatId').equals(flatId).toArray(), [flatId]) ?? [];
  const documents = useLiveQuery(() => db.documents.where('flatId').equals(flatId).toArray(), [flatId]) ?? [];
  // auditLog has no flatId index (append-only trail, not schema we can change here) - filter the ordered set in memory instead.
  const auditEntriesAll = useLiveQuery(() => db.auditLog.orderBy('timestamp').reverse().toArray(), []) ?? [];
  const auditEntries = auditEntriesAll.filter((e) => e.flatId === flatId);
  const allResidents = useLiveQuery(() => db.residents.toArray(), []) ?? [];

  if (!flat) return null;

  const ownerRows = ownerships.map((o) => ({ ownership: o, person: allResidents.find((r) => r.id === o.residentId) }));
  const currentResidents = residents.filter((r) => residentIsResident(r) && (r.status ?? 'current') === 'current' && !r.archived);
  const unpaidBills = bills.filter((b) => b.status !== 'paid' && !b.voided);
  const unpaidTotal = unpaidBills.reduce((s, b) => s + (b.totalAmount - b.paidAmount), 0);
  const depositBalance = depositTxns.filter((t) => !t.voided).reduce((s, t) => {
    if (t.type === 'collected' || t.type === 'adjustment') return s + t.amount;
    return s - t.amount;
  }, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-gray-400">{flat.displayId ?? '—'}</span>
              <h3 className="font-semibold text-gray-800">{flat.unitNo}</h3>
              <span className={flat.occupancyStatus === 'occupied' ? 'badge-paid' : 'badge-unpaid'}>{flat.occupancyStatus}</span>
              {flat.lifecycleStatus && flat.lifecycleStatus !== 'active' && <span className="badge-partial">{flat.lifecycleStatus.replace('_', ' ')}</span>}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{building?.name ?? '—'}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => onEdit(flat)} className="btn-secondary flex items-center gap-2 text-xs !py-1.5"><Pencil size={14} /> Edit</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Overview */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><div className="text-gray-400 text-xs">Type</div><div className="font-medium text-gray-800">{flat.unitType || '—'}</div></div>
            <div><div className="text-gray-400 text-xs">Bed / Bath</div><div className="font-medium text-gray-800">{flat.bedrooms ?? '—'} / {flat.bathrooms ?? '—'}</div></div>
            <div><div className="text-gray-400 text-xs">Floor</div><div className="font-medium text-gray-800">{flat.floor || '—'}</div></div>
            <div><div className="text-gray-400 text-xs">Standard Rent</div><div className="font-medium text-gray-800">{flat.standardRent ? money(flat.standardRent) : '—'}</div></div>
          </div>

          {/* Owners */}
          <section>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2"><Landmark size={14} /> Owners</div>
            <div className="space-y-1.5">
              {ownerRows.map(({ ownership, person }) => (
                <div key={ownership.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium text-gray-800">{person?.name ?? 'Unknown owner'}</span>
                  <span className="text-xs text-gray-400">{ownership.ownershipPct}% · {ownership.ownershipType} · {ownership.status}</span>
                </div>
              ))}
              {ownerRows.length === 0 && <div className="text-xs text-gray-400">No owner on file.</div>}
            </div>
            <Link to="/owners" onClick={onClose} className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium mt-2">Manage owners <ChevronRight size={12} /></Link>
          </section>

          {/* Residents */}
          <section>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2"><Users size={14} /> Residents</div>
            <div className="space-y-1.5">
              {currentResidents.map((r) => (
                <div key={r.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                  <span className="font-medium text-gray-800">{r.name}</span>
                  <span className="text-xs text-gray-400 flex items-center gap-1.5">
                    {residentIsOwner(r) && <span className="badge-partial">Also Owner</span>}
                    Since {r.moveInDate ? dateLabel(r.moveInDate) : '—'}
                  </span>
                </div>
              ))}
              {currentResidents.length === 0 && <div className="text-xs text-gray-400">No current resident - vacant.</div>}
            </div>
            <Link to={`/residents?q=${encodeURIComponent(flat.unitNo)}`} onClick={onClose} className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium mt-2">Manage residents <ChevronRight size={12} /></Link>
          </section>

          {/* Parking & Storage */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2"><SquareParking size={14} /> Parking</div>
              {parkingSpaces.length > 0 ? (
                <div className="space-y-1.5">
                  {parkingSpaces.map((s) => (
                    <div key={s.id} className="bg-gray-50 rounded-lg px-3 py-2 text-sm flex items-center justify-between">
                      <span className="text-gray-800">{s.spaceNumber}</span>
                      <span className="text-xs text-gray-400">{s.type}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-gray-400">{flat.parkingIncluded ? 'Included - no space assigned yet.' : 'No parking assigned.'}</div>
              )}
              <Link to={`/parking?q=${encodeURIComponent(flat.unitNo)}`} onClick={onClose} className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium mt-2">Manage parking <ChevronRight size={12} /></Link>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2"><Warehouse size={14} /> Storage</div>
              <div className="text-xs text-gray-400">{flat.storageIncluded ? 'Storage included with this unit.' : 'No storage included.'}</div>
              <Link to={`/storage?q=${encodeURIComponent(flat.unitNo)}`} onClick={onClose} className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium mt-2">Manage storage <ChevronRight size={12} /></Link>
            </div>
          </section>

          {/* Finance & Documents */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400 flex items-center gap-1"><Wallet size={12} /> Unpaid</div>
              <div className="text-sm font-semibold text-gray-800 mt-0.5">{money(unpaidTotal)}</div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-400 flex items-center gap-1"><Wallet size={12} /> Deposit Held</div>
              <div className="text-sm font-semibold text-gray-800 mt-0.5">{money(depositBalance)}</div>
            </div>
            <Link to="/documents" onClick={onClose} className="bg-gray-50 rounded-xl p-3 hover:bg-gray-100">
              <div className="text-xs text-gray-400 flex items-center gap-1"><FolderOpen size={12} /> Documents</div>
              <div className="text-sm font-semibold text-gray-800 mt-0.5">{documents.length}</div>
            </Link>
            <Link to="/billing/history" onClick={onClose} className="bg-gray-50 rounded-xl p-3 hover:bg-gray-100">
              <div className="text-xs text-gray-400 flex items-center gap-1"><Home size={12} /> Invoices</div>
              <div className="text-sm font-semibold text-gray-800 mt-0.5">{bills.length}</div>
            </Link>
          </section>

          {/* Recent activity */}
          <section>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2"><HistoryIcon size={14} /> Recent Activity</div>
            <div className="divide-y divide-gray-50">
              {auditEntries.slice(0, 5).map((e) => (
                <div key={e.id} className="py-2 text-xs text-gray-500 flex items-center justify-between gap-2">
                  <span className="truncate">{e.summary}</span>
                  <span className="text-gray-400 shrink-0">{dateLabel(e.timestamp.slice(0, 10))}</span>
                </div>
              ))}
              {auditEntries.length === 0 && <div className="text-xs text-gray-400 py-1">No activity recorded yet.</div>}
            </div>
            <Link to="/audit-log" onClick={onClose} className="inline-flex items-center gap-1 text-xs text-brand-600 font-medium mt-2">View full audit log <ChevronRight size={12} /></Link>
          </section>
        </div>
      </div>
    </div>
  );
}
