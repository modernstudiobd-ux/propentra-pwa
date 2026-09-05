import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { X, Pencil, Mail, Phone, Home, Landmark } from 'lucide-react';
import { dateLabel } from '@/lib/format';
import { residentIsResident, residentIsOwner, roleLabel } from '@/lib/roles';
import type { Resident } from '@/types';

/**
 * Read-only "Person" profile - a Resident record is really a person who can
 * be a Resident, an Owner, or both. Shown from both the Residents and
 * Owners pages so the two relationships are always visible together,
 * regardless of which list the person was opened from.
 */
export default function PersonDetailModal({
  residentId, onClose, onEdit,
}: { residentId: number; onClose: () => void; onEdit: (resident: Resident) => void }) {
  const resident = useLiveQuery(() => db.residents.get(residentId), [residentId]);
  const ownerships = useLiveQuery(() => db.ownerships.where('residentId').equals(residentId).toArray(), [residentId]) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];

  if (!resident) return null;

  const buildingName = (id?: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const residenceFlat = resident.flatId ? flats.find((f) => f.id === resident.flatId) : undefined;
  const isRes = residentIsResident(resident);
  const isOwn = residentIsOwner(resident);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-mono text-gray-400">{resident.displayId ?? '—'}</span>
              <h3 className="font-semibold text-gray-800">{resident.name}</h3>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">{roleLabel(resident)}{resident.archived ? ' · Archived' : ''}</div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <button onClick={() => onEdit(resident)} className="btn-secondary flex items-center gap-2 text-xs !py-1.5"><Pencil size={14} /> Edit</button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {/* Contact details */}
          <section>
            <div className="text-sm font-semibold text-gray-700 mb-2">Contact Details</div>
            <div className="space-y-1.5 text-sm text-gray-600">
              <div className="flex items-center gap-2"><Phone size={13} className="text-gray-400" /> {resident.mobile || '—'}</div>
              <div className="flex items-center gap-2"><Mail size={13} className="text-gray-400" /> {resident.email || '—'}</div>
            </div>
          </section>

          {/* Roles */}
          <section>
            <div className="text-sm font-semibold text-gray-700 mb-2">Status</div>
            <div className="flex gap-2">
              <span className={isOwn ? 'badge-partial' : 'badge-unpaid'}>{isOwn ? 'Owner' : 'Not an owner'}</span>
              <span className={isRes ? 'badge-paid' : 'badge-unpaid'}>{isRes ? 'Resident' : 'Not a resident'}</span>
            </div>
          </section>

          {/* Residence */}
          <section>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2"><Home size={14} /> Residence</div>
            {isRes && residenceFlat ? (
              <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                <div className="font-medium text-gray-800">{buildingName(residenceFlat.buildingId)} · {residenceFlat.unitNo}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {resident.status === 'former' ? 'Former resident' : 'Current resident'}
                  {resident.moveInDate ? ` · Since ${dateLabel(resident.moveInDate)}` : ''}
                  {resident.moveOutDate ? ` · Moved out ${dateLabel(resident.moveOutDate)}` : ''}
                </div>
              </div>
            ) : (
              <div className="text-xs text-gray-400">Does not reside in a flat.</div>
            )}
          </section>

          {/* Owned flats */}
          <section>
            <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 mb-2"><Landmark size={14} /> Owned Flats</div>
            <div className="space-y-1.5">
              {ownerships.map((o) => {
                const f = flats.find((x) => x.id === o.flatId);
                return (
                  <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                    <span className="font-medium text-gray-800">{f ? `${buildingName(f.buildingId)} · ${f.unitNo}` : 'Unknown flat'}</span>
                    <span className="text-xs text-gray-400">{o.ownershipPct}% · {o.ownershipType} · {o.status}</span>
                  </div>
                );
              })}
              {ownerships.length === 0 && <div className="text-xs text-gray-400">No flats owned.</div>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
