import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Pencil, Trash2, Home, Landmark, Users, Car, ShieldAlert, X } from 'lucide-react';
import { db } from '@/lib/db';
import { dateLabel, money } from '@/lib/format';
import { logAudit } from '@/lib/audit';
import { nextDisplayId } from '@/lib/ids';
import { validateOwnershipPct } from '@/lib/ownership';
import { suggestRentForFlat } from '@/lib/tenancy';
import {
  LEASE_TYPES, PAYMENT_FREQUENCIES, TENANCY_OCCUPANCY_STATUSES,
  OWNERSHIP_TYPES, OWNERSHIP_STATUSES,
  CONTACT_TYPES, VEHICLE_TYPES, VEHICLE_STATUSES,
  type Tenancy, type Ownership, type Contact, type EmergencyContact, type Vehicle, type ResidentType,
} from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

function Section({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div className="pt-3 border-t border-gray-100">
      <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 mb-2">
        <Icon size={14} /> {title}
      </div>
      {children}
    </div>
  );
}

// --- Tenancy -----------------------------------------------------------

function TenancyPanel({ residentId, flatId, buildingId }: { residentId: number; flatId: number; buildingId: number }) {
  const tenancies = useLiveQuery(() => db.tenancies.where('residentId').equals(residentId).toArray(), [residentId]) ?? [];
  const [editing, setEditing] = useState<Tenancy | null>(null);

  function openNew() {
    suggestRentForFlat(flatId).then((rent) => {
      setEditing({
        residentId, flatId, buildingId, leaseType: 'Fixed Term', leaseStart: todayISO(), leaseEnd: '',
        moveIn: todayISO(), moveOut: '', monthlyRent: rent, currency: 'USD', deposit: 0,
        paymentFrequency: 'Monthly', occupancyStatus: 'active', notes: '',
      });
    });
  }

  async function save() {
    if (!editing) return;
    if (editing.id) {
      await db.tenancies.update(editing.id, editing);
      await logAudit({ action: 'tenancy_updated', entityType: 'tenancy', entityId: editing.id, residentId, buildingId, flatId, summary: `Updated tenancy for resident #${residentId}` });
    } else {
      const id = (await db.tenancies.add({ ...editing, displayId: await nextDisplayId('tenancies') })) as number;
      await logAudit({ action: 'tenancy_created', entityType: 'tenancy', entityId: id, residentId, buildingId, flatId, summary: `Created tenancy for resident #${residentId}` });
    }
    setEditing(null);
  }

  async function remove(id?: number) {
    if (!id || !confirm('Delete this tenancy record?')) return;
    await db.tenancies.delete(id);
    await logAudit({ action: 'tenancy_deleted', entityType: 'tenancy', entityId: id, residentId, buildingId, flatId, summary: `Deleted tenancy for resident #${residentId}` });
  }

  return (
    <Section icon={Home} title="Tenancy / Lease">
      <div className="space-y-2">
        {tenancies.map((t) => (
          <div key={t.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
            <div>
              <span className={t.occupancyStatus === 'active' ? 'badge-paid' : t.occupancyStatus === 'upcoming' ? 'badge-partial' : 'badge-unpaid'}>{t.occupancyStatus}</span>
              <span className="ml-2 text-[10px] text-gray-400 font-mono">{t.displayId ?? ''}</span>
              <span className="ml-2 text-gray-700">{money(t.monthlyRent)}/{t.paymentFrequency?.toLowerCase()}</span>
              <div className="text-[11px] text-gray-400">{dateLabel(t.leaseStart)} → {t.leaseEnd ? dateLabel(t.leaseEnd) : 'Ongoing'} · {t.leaseType}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setEditing(t)} className="icon-btn text-brand-500"><Pencil size={14} /></button>
              <button onClick={() => remove(t.id)} className="icon-btn text-red-400"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {tenancies.length === 0 && !editing && <div className="text-xs text-gray-400">No tenancy on file yet.</div>}
        {!editing && (
          <button onClick={openNew} className="flex items-center gap-1 text-xs text-brand-600 font-medium"><Plus size={13} /> Add Tenancy</button>
        )}
      </div>

      {editing && (
        <div className="mt-2 bg-brand-50/50 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Lease Type</label>
              <select className="input" value={editing.leaseType} onChange={(e) => setEditing({ ...editing, leaseType: e.target.value })}>
                {LEASE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select></div>
            <div><label className="label">Status</label>
              <select className="input" value={editing.occupancyStatus} onChange={(e) => setEditing({ ...editing, occupancyStatus: e.target.value })}>
                {TENANCY_OCCUPANCY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Lease Start</label>
              <input type="date" className="input" value={editing.leaseStart} onChange={(e) => setEditing({ ...editing, leaseStart: e.target.value })} /></div>
            <div><label className="label">Lease End</label>
              <input type="date" className="input" value={editing.leaseEnd ?? ''} onChange={(e) => setEditing({ ...editing, leaseEnd: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Move-In</label>
              <input type="date" className="input" value={editing.moveIn} onChange={(e) => setEditing({ ...editing, moveIn: e.target.value })} /></div>
            <div><label className="label">Move-Out</label>
              <input type="date" className="input" value={editing.moveOut ?? ''} onChange={(e) => setEditing({ ...editing, moveOut: e.target.value })} /></div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="label">Monthly Rent</label>
              <input type="number" min={0} step={0.01} className="input" value={editing.monthlyRent} onChange={(e) => setEditing({ ...editing, monthlyRent: Number(e.target.value) })} /></div>
            <div><label className="label">Deposit</label>
              <input type="number" min={0} step={0.01} className="input" value={editing.deposit} onChange={(e) => setEditing({ ...editing, deposit: Number(e.target.value) })} /></div>
            <div><label className="label">Currency</label>
              <input className="input" value={editing.currency} onChange={(e) => setEditing({ ...editing, currency: e.target.value.toUpperCase() })} /></div>
          </div>
          <div><label className="label">Payment Frequency</label>
            <select className="input" value={editing.paymentFrequency} onChange={(e) => setEditing({ ...editing, paymentFrequency: e.target.value })}>
              {PAYMENT_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select></div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} className="btn-primary flex-1 !py-1.5 !text-xs">Save Tenancy</button>
            <button onClick={() => setEditing(null)} className="btn-secondary flex-1 !py-1.5 !text-xs">Cancel</button>
          </div>
        </div>
      )}
    </Section>
  );
}

// --- Ownership -----------------------------------------------------------

function OwnershipPanel({ residentId, flatId, buildingId }: { residentId: number; flatId: number; buildingId: number }) {
  const ownerships = useLiveQuery(() => db.ownerships.where('residentId').equals(residentId).toArray(), [residentId]) ?? [];
  const [editing, setEditing] = useState<Ownership | null>(null);
  const [pctError, setPctError] = useState('');

  function openNew() {
    setEditing({ residentId, flatId, buildingId, status: 'active', ownershipPct: 100, purchaseDate: todayISO(), ownershipType: 'Sole', notes: '' });
    setPctError('');
  }

  async function save() {
    if (!editing) return;
    const err = await validateOwnershipPct(flatId, editing.ownershipPct, editing.id);
    if (err) { setPctError(err); return; }
    if (editing.id) {
      await db.ownerships.update(editing.id, editing);
      await logAudit({ action: 'ownership_updated', entityType: 'ownership', entityId: editing.id, residentId, buildingId, flatId, summary: `Updated ownership for resident #${residentId}` });
    } else {
      const id = (await db.ownerships.add({ ...editing, displayId: await nextDisplayId('ownerships') })) as number;
      await logAudit({ action: 'ownership_created', entityType: 'ownership', entityId: id, residentId, buildingId, flatId, summary: `Created ownership for resident #${residentId}` });
    }
    setEditing(null);
    setPctError('');
  }

  async function remove(id?: number) {
    if (!id || !confirm('Delete this ownership record?')) return;
    await db.ownerships.delete(id);
    await logAudit({ action: 'ownership_deleted', entityType: 'ownership', entityId: id, residentId, buildingId, flatId, summary: `Deleted ownership for resident #${residentId}` });
  }

  return (
    <Section icon={Landmark} title="Ownership">
      <div className="space-y-2">
        {ownerships.map((o) => (
          <div key={o.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
            <div>
              <span className={o.status === 'active' ? 'badge-paid' : 'badge-unpaid'}>{o.status}</span>
              <span className="ml-2 text-[10px] text-gray-400 font-mono">{o.displayId ?? ''}</span>
              <span className="ml-2 text-gray-700">{o.ownershipPct}% · {o.ownershipType}</span>
              <div className="text-[11px] text-gray-400">Purchased {dateLabel(o.purchaseDate)}</div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => { setEditing(o); setPctError(''); }} className="icon-btn text-brand-500"><Pencil size={14} /></button>
              <button onClick={() => remove(o.id)} className="icon-btn text-red-400"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {ownerships.length === 0 && !editing && <div className="text-xs text-gray-400">No ownership on file yet.</div>}
        {!editing && (
          <button onClick={openNew} className="flex items-center gap-1 text-xs text-brand-600 font-medium"><Plus size={13} /> Add Ownership</button>
        )}
      </div>

      {editing && (
        <div className="mt-2 bg-brand-50/50 rounded-xl p-3 space-y-2">
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
            <div><label className="label">Status</label>
              <select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {OWNERSHIP_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select></div>
            <div><label className="label">Purchase Date</label>
              <input type="date" className="input" value={editing.purchaseDate} onChange={(e) => setEditing({ ...editing, purchaseDate: e.target.value })} /></div>
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={save} className="btn-primary flex-1 !py-1.5 !text-xs">Save Ownership</button>
            <button onClick={() => { setEditing(null); setPctError(''); }} className="btn-secondary flex-1 !py-1.5 !text-xs">Cancel</button>
          </div>
        </div>
      )}
    </Section>
  );
}

// --- Contacts & Emergency Contacts -----------------------------------------

function ContactsPanel({ residentId }: { residentId: number }) {
  const contacts = useLiveQuery(() => db.contacts.where('residentId').equals(residentId).toArray(), [residentId]) ?? [];
  const emergency = useLiveQuery(() => db.emergencyContacts.where('residentId').equals(residentId).toArray(), [residentId]) ?? [];
  const [newContact, setNewContact] = useState<Contact | null>(null);
  const [newEmergency, setNewEmergency] = useState<EmergencyContact | null>(null);

  async function saveContact() {
    if (!newContact || !newContact.name.trim()) return;
    if (newContact.preferred) await db.contacts.where('residentId').equals(residentId).modify({ preferred: false });
    await db.contacts.add({ ...newContact, displayId: await nextDisplayId('contacts') });
    setNewContact(null);
  }
  async function saveEmergency() {
    if (!newEmergency || !newEmergency.name.trim() || !newEmergency.phone.trim()) return;
    if (newEmergency.isPrimary) await db.emergencyContacts.where('residentId').equals(residentId).modify({ isPrimary: false });
    await db.emergencyContacts.add({ ...newEmergency, displayId: await nextDisplayId('emergencyContacts') });
    setNewEmergency(null);
  }

  return (
    <>
      <Section icon={Users} title="Additional Contacts">
        <div className="space-y-1.5">
          {contacts.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
              <div><span className="text-gray-700 font-medium">{c.name}</span> <span className="text-gray-400 text-xs">{c.type}{c.preferred ? ' · Preferred' : ''}</span>
                <div className="text-[11px] text-gray-400">{c.displayId ? `${c.displayId} · ` : ''}{[c.phone, c.email, c.relationship].filter(Boolean).join(' · ')}</div></div>
              <button onClick={() => db.contacts.delete(c.id!)} className="icon-btn text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
          {!newContact && <button onClick={() => setNewContact({ residentId, type: 'Personal', name: '', email: '', phone: '', relationship: '', preferred: false })} className="flex items-center gap-1 text-xs text-brand-600 font-medium"><Plus size={13} /> Add Contact</button>}
          {newContact && (
            <div className="bg-brand-50/50 rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Name" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                <select className="input" value={newContact.type} onChange={(e) => setNewContact({ ...newContact, type: e.target.value })}>
                  {CONTACT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Phone" value={newContact.phone ?? ''} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
                <input className="input" placeholder="Email" value={newContact.email ?? ''} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
              </div>
              <input className="input" placeholder="Relationship (optional)" value={newContact.relationship ?? ''} onChange={(e) => setNewContact({ ...newContact, relationship: e.target.value })} />
              <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={newContact.preferred} onChange={(e) => setNewContact({ ...newContact, preferred: e.target.checked })} /> Preferred contact</label>
              <div className="flex gap-2"><button onClick={saveContact} className="btn-primary flex-1 !py-1.5 !text-xs">Save</button><button onClick={() => setNewContact(null)} className="btn-secondary flex-1 !py-1.5 !text-xs">Cancel</button></div>
            </div>
          )}
        </div>
      </Section>

      <Section icon={ShieldAlert} title="Emergency Contacts">
        <div className="space-y-1.5">
          {emergency.map((c) => (
            <div key={c.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
              <div><span className="text-gray-700 font-medium">{c.name}</span> <span className="text-gray-400 text-xs">{c.relationship}{c.isPrimary ? ' · Primary' : ''}</span>
                <div className="text-[11px] text-gray-400">{c.displayId ? `${c.displayId} · ` : ''}{[c.phone, c.email].filter(Boolean).join(' · ')}</div></div>
              <button onClick={() => db.emergencyContacts.delete(c.id!)} className="icon-btn text-red-400"><Trash2 size={13} /></button>
            </div>
          ))}
          {!newEmergency && <button onClick={() => setNewEmergency({ residentId, name: '', relationship: '', phone: '', email: '', isPrimary: emergency.length === 0 })} className="flex items-center gap-1 text-xs text-brand-600 font-medium"><Plus size={13} /> Add Emergency Contact</button>}
          {newEmergency && (
            <div className="bg-brand-50/50 rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Name *" value={newEmergency.name} onChange={(e) => setNewEmergency({ ...newEmergency, name: e.target.value })} />
                <input className="input" placeholder="Relationship *" value={newEmergency.relationship} onChange={(e) => setNewEmergency({ ...newEmergency, relationship: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input className="input" placeholder="Phone *" value={newEmergency.phone} onChange={(e) => setNewEmergency({ ...newEmergency, phone: e.target.value })} />
                <input className="input" placeholder="Email" value={newEmergency.email ?? ''} onChange={(e) => setNewEmergency({ ...newEmergency, email: e.target.value })} />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600"><input type="checkbox" checked={newEmergency.isPrimary} onChange={(e) => setNewEmergency({ ...newEmergency, isPrimary: e.target.checked })} /> Primary emergency contact</label>
              <div className="flex gap-2"><button onClick={saveEmergency} className="btn-primary flex-1 !py-1.5 !text-xs">Save</button><button onClick={() => setNewEmergency(null)} className="btn-secondary flex-1 !py-1.5 !text-xs">Cancel</button></div>
            </div>
          )}
        </div>
      </Section>
    </>
  );
}

// --- Vehicles -----------------------------------------------------------

function VehiclesPanel({ residentId, flatId, buildingId }: { residentId: number; flatId: number; buildingId: number }) {
  const vehicles = useLiveQuery(() => db.vehicles.where('residentId').equals(residentId).toArray(), [residentId]) ?? [];
  const [editing, setEditing] = useState<Vehicle | null>(null);

  async function save() {
    if (!editing || !editing.plate.trim()) return;
    if (editing.id) await db.vehicles.update(editing.id, editing);
    else await db.vehicles.add({ ...editing, displayId: await nextDisplayId('vehicles') });
    setEditing(null);
  }

  return (
    <Section icon={Car} title="Vehicles">
      <div className="space-y-1.5">
        {vehicles.map((v) => (
          <div key={v.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
            <div><span className="text-gray-700 font-medium">{v.plate}</span> <span className="text-gray-400 text-xs">{[v.type, v.make, v.model, v.year].filter(Boolean).join(' ')}</span>
              {v.displayId && <span className="block text-[10px] text-gray-400 font-mono">{v.displayId}</span>}</div>
            <div className="flex items-center gap-1">
              <span className={v.status === 'active' ? 'badge-paid' : 'badge-unpaid'}>{v.status}</span>
              <button onClick={() => db.vehicles.delete(v.id!)} className="icon-btn text-red-400"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
        {!editing && <button onClick={() => setEditing({ residentId, flatId, buildingId, type: 'Car', make: '', model: '', year: undefined, plate: '', state: '', status: 'active' })} className="flex items-center gap-1 text-xs text-brand-600 font-medium"><Plus size={13} /> Add Vehicle</button>}
        {editing && (
          <div className="bg-brand-50/50 rounded-xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="Plate *" value={editing.plate} onChange={(e) => setEditing({ ...editing, plate: e.target.value.toUpperCase() })} />
              <select className="input" value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                {VEHICLE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input className="input" placeholder="Make" value={editing.make ?? ''} onChange={(e) => setEditing({ ...editing, make: e.target.value })} />
              <input className="input" placeholder="Model" value={editing.model ?? ''} onChange={(e) => setEditing({ ...editing, model: e.target.value })} />
              <input type="number" className="input" placeholder="Year" value={editing.year ?? ''} onChange={(e) => setEditing({ ...editing, year: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input className="input" placeholder="State/Province" value={editing.state ?? ''} onChange={(e) => setEditing({ ...editing, state: e.target.value })} />
              <select className="input" value={editing.status} onChange={(e) => setEditing({ ...editing, status: e.target.value })}>
                {VEHICLE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex gap-2"><button onClick={save} className="btn-primary flex-1 !py-1.5 !text-xs">Save</button><button onClick={() => setEditing(null)} className="btn-secondary flex-1 !py-1.5 !text-xs">Cancel</button></div>
          </div>
        )}
      </div>
    </Section>
  );
}

export default function ResidentExtras({ residentId, flatId, buildingId, type }: { residentId: number; flatId: number; buildingId: number; type: ResidentType }) {
  return (
    <div>
      {type === 'Tenant' && <TenancyPanel residentId={residentId} flatId={flatId} buildingId={buildingId} />}
      {type === 'Owner' && <OwnershipPanel residentId={residentId} flatId={flatId} buildingId={buildingId} />}
      <ContactsPanel residentId={residentId} />
      <VehiclesPanel residentId={residentId} flatId={flatId} buildingId={buildingId} />
    </div>
  );
}
