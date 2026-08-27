import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

export default function Reports() {
  const bills = useLiveQuery(() => db.bills.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const tenancies = useLiveQuery(() => db.tenancies.toArray(), []) ?? [];
  const ownerships = useLiveQuery(() => db.ownerships.toArray(), []) ?? [];
  const payments = useLiveQuery(() => db.payments.toArray(), []) ?? [];
  const expenses = useLiveQuery(() => db.expenses.toArray(), []) ?? [];
  const documents = useLiveQuery(() => db.documents.toArray(), []) ?? [];

  const [tab, setTab] = useState<'collection' | 'outstanding' | 'monthly' | 'rentroll' | 'occupancy' | 'leaseexp' | 'ownerstatement' | 'compliance'>('collection');

  const buildingName = (id?: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const flatLabel = (id?: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';
  const residentName = (id?: number) => residents.find((r) => r.id === id)?.name ?? '—';

  const monthMap = new Map<string, { collected: number; due: number; count: number; paid: number }>();
  bills.forEach((b) => {
    const cur = monthMap.get(b.billingMonth) ?? { collected: 0, due: 0, count: 0, paid: 0 };
    cur.collected += b.paidAmount;
    cur.due += b.totalAmount - b.paidAmount;
    cur.count += 1;
    if (b.status === 'paid') cur.paid += 1;
    monthMap.set(b.billingMonth, cur);
  });
  const monthly = Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v }));

  const paidCount = bills.filter((b) => b.status === 'paid').length;
  const unpaidCount = bills.filter((b) => b.status === 'unpaid').length;
  const partialCount = bills.filter((b) => b.status === 'partial').length;
  const statusData = [
    { name: 'Paid', value: paidCount, color: '#10b981' },
    { name: 'Unpaid', value: unpaidCount, color: '#ef4444' },
    { name: 'Partial', value: partialCount, color: '#f59e0b' },
  ];

  // --- Rent Roll: every active tenancy, with its monthly rent -------------
  const activeTenancies = tenancies.filter((t) => t.occupancyStatus === 'active');
  const rentRollTotal = activeTenancies.reduce((s, t) => s + t.monthlyRent, 0);

  // --- Occupancy: per building, vacant vs occupied ------------------------
  const occupancyRows = buildings.map((b) => {
    const bFlats = flats.filter((f) => f.buildingId === b.id);
    const occupied = bFlats.filter((f) => f.occupancyStatus === 'occupied').length;
    const total = bFlats.length;
    return { building: b, total, occupied, vacant: total - occupied, rate: total > 0 ? Math.round((occupied / total) * 100) : 0 };
  });
  const totalUnits = flats.length;
  const totalOccupied = flats.filter((f) => f.occupancyStatus === 'occupied').length;

  // --- Lease Expiration: active tenancies with a leaseEnd, soonest first --
  const [leaseWindow, setLeaseWindow] = useState(90);
  const leaseRows = activeTenancies
    .filter((t) => t.leaseEnd)
    .map((t) => ({ tenancy: t, days: daysUntil(t.leaseEnd as string) }))
    .filter((r) => r.days <= leaseWindow)
    .sort((a, b) => a.days - b.days);

  // --- Owner Statement: active ownership x flat financials ----------------
  const activeOwnerships = ownerships.filter((o) => o.status === 'active');
  const ownerRows = activeOwnerships.map((o) => {
    const flatPayments = payments.filter((p) => p.flatId === o.flatId && !p.voided);
    const flatExpenses = expenses.filter((e) => e.flatId === o.flatId);
    const income = flatPayments.reduce((s, p) => s + p.amount, 0);
    const expenseTotal = flatExpenses.reduce((s, e) => s + e.amount, 0);
    const share = o.ownershipPct / 100;
    return {
      ownership: o,
      income: income * share,
      expenseTotal: expenseTotal * share,
      net: (income - expenseTotal) * share,
    };
  });

  // --- Compliance: ID + document expiry/verification status --------------
  const today = todayISO();
  const idComplianceRows = residents
    .filter((r) => (r.status ?? 'current') === 'current' && !r.archived)
    .map((r) => ({
      resident: r,
      idStatus: !r.idExpiryDate ? 'none' : r.idExpiryDate < today ? 'expired' : daysUntil(r.idExpiryDate) <= 30 ? 'expiring' : 'ok',
    }))
    .filter((r) => r.idStatus === 'expired' || r.idStatus === 'expiring' || r.idStatus === 'none');
  const docComplianceRows = documents.filter((d) => d.verificationStatus === 'unverified' || d.verificationStatus === 'rejected' || (d.expiryDate && d.expiryDate < today));

  const tabs = [
    { key: 'collection', label: 'Collection' },
    { key: 'outstanding', label: 'Outstanding' },
    { key: 'monthly', label: 'Monthly Summary' },
    { key: 'rentroll', label: 'Rent Roll' },
    { key: 'occupancy', label: 'Occupancy' },
    { key: 'leaseexp', label: 'Lease Expiration' },
    { key: 'ownerstatement', label: 'Owner Statement' },
    { key: 'compliance', label: 'Compliance' },
  ] as const;

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {(tab === 'collection' || tab === 'outstanding') && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <div className="card p-5 xl:col-span-2">
            <h3 className="font-semibold text-gray-800 mb-4">
              {tab === 'outstanding' ? 'Outstanding by Month' : 'Collection Overview (This Year)'}
            </h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthly}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => money(v)} />
                <Legend />
                {tab === 'outstanding' ? (
                  <Bar dataKey="due" fill="#ef4444" name="Due" radius={[4, 4, 0, 0]} />
                ) : (
                  <>
                    <Bar dataKey="collected" fill="#10b981" name="Collection" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="due" fill="#94a3b8" name="Due" radius={[4, 4, 0, 0]} />
                  </>
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-800 mb-4">Payment Status</h3>
            <div className="relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" innerRadius={55} outerRadius={80} paddingAngle={3}>
                    {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute text-center">
                <div className="text-2xl font-bold text-gray-800">{bills.length}</div>
                <div className="text-xs text-gray-400">Total</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {(tab === 'collection' || tab === 'outstanding' || tab === 'monthly') && (
        <div className="card overflow-x-auto">
          <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">Summary</div>
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Month</th><th className="table-th">Total Invoices</th>
                <th className="table-th">Paid Amount</th><th className="table-th">Due Amount</th><th className="table-th">Collection %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {monthly.map((m) => (
                <tr key={m.month}>
                  <td className="table-td font-medium text-gray-800">{m.month}</td>
                  <td className="table-td">{m.count}</td>
                  <td className="table-td">{money(m.collected)}</td>
                  <td className="table-td">{money(m.due)}</td>
                  <td className="table-td">{m.collected + m.due > 0 ? Math.round((m.collected / (m.collected + m.due)) * 100) : 0}%</td>
                </tr>
              ))}
              {monthly.length === 0 && <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-8">No data yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'rentroll' && (
        <div className="card overflow-x-auto">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-800">Rent Roll — Active Tenancies</span>
            <span className="text-sm text-gray-500">Total: <b className="text-gray-800">{money(rentRollTotal)}</b>/mo</span>
          </div>
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Building</th><th className="table-th">Unit</th><th className="table-th">Resident</th>
                <th className="table-th">Lease Type</th><th className="table-th">Rent</th><th className="table-th">Frequency</th><th className="table-th">Lease End</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {activeTenancies.map((t) => (
                <tr key={t.id}>
                  <td className="table-td">{buildingName(t.buildingId)}</td>
                  <td className="table-td">{flatLabel(t.flatId)}</td>
                  <td className="table-td font-medium text-gray-800">{residentName(t.residentId)}</td>
                  <td className="table-td text-gray-500">{t.leaseType}</td>
                  <td className="table-td">{money(t.monthlyRent)}</td>
                  <td className="table-td text-gray-500">{t.paymentFrequency}</td>
                  <td className="table-td">{t.leaseEnd ? dateLabel(t.leaseEnd) : 'Ongoing'}</td>
                </tr>
              ))}
              {activeTenancies.length === 0 && <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-8">No active tenancies yet</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'occupancy' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="card p-4"><div className="text-xs text-gray-400">Total Units</div><div className="text-xl font-semibold text-gray-800">{totalUnits}</div></div>
            <div className="card p-4"><div className="text-xs text-gray-400">Occupied</div><div className="text-xl font-semibold text-emerald-600">{totalOccupied}</div></div>
            <div className="card p-4"><div className="text-xs text-gray-400">Occupancy Rate</div><div className="text-xl font-semibold text-gray-800">{totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0}%</div></div>
          </div>
          <div className="card overflow-x-auto">
            <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">By Building</div>
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50">
                <tr><th className="table-th">Building</th><th className="table-th">Total Units</th><th className="table-th">Occupied</th><th className="table-th">Vacant</th><th className="table-th">Occupancy %</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {occupancyRows.map((r) => (
                  <tr key={r.building.id}>
                    <td className="table-td font-medium text-gray-800">{r.building.name}</td>
                    <td className="table-td">{r.total}</td>
                    <td className="table-td text-emerald-600">{r.occupied}</td>
                    <td className="table-td text-gray-500">{r.vacant}</td>
                    <td className="table-td">{r.rate}%</td>
                  </tr>
                ))}
                {occupancyRows.length === 0 && <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-8">No buildings yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'leaseexp' && (
        <div className="card overflow-x-auto">
          <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="font-semibold text-gray-800">Lease Expiration</span>
            <select className="input !w-auto !py-1 text-sm" value={leaseWindow} onChange={(e) => setLeaseWindow(Number(e.target.value))}>
              <option value={30}>Next 30 days</option>
              <option value={60}>Next 60 days</option>
              <option value={90}>Next 90 days</option>
              <option value={365}>Next 12 months</option>
            </select>
          </div>
          <table className="w-full min-w-[600px]">
            <thead className="bg-gray-50">
              <tr><th className="table-th">Building</th><th className="table-th">Unit</th><th className="table-th">Resident</th><th className="table-th">Lease End</th><th className="table-th">Days Left</th></tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {leaseRows.map(({ tenancy: t, days }) => (
                <tr key={t.id}>
                  <td className="table-td">{buildingName(t.buildingId)}</td>
                  <td className="table-td">{flatLabel(t.flatId)}</td>
                  <td className="table-td font-medium text-gray-800">{residentName(t.residentId)}</td>
                  <td className="table-td">{dateLabel(t.leaseEnd as string)}</td>
                  <td className="table-td"><span className={days < 0 ? 'badge-unpaid' : days <= 30 ? 'badge-partial' : 'badge-paid'}>{days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}</span></td>
                </tr>
              ))}
              {leaseRows.length === 0 && <tr><td colSpan={5} className="text-center text-sm text-gray-400 py-8">No leases ending in this window</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'ownerstatement' && (
        <div className="card overflow-x-auto">
          <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">Owner Statement — Lifetime, per Active Ownership</div>
          <table className="w-full min-w-[700px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">Building</th><th className="table-th">Unit</th><th className="table-th">Owner</th>
                <th className="table-th">Share</th><th className="table-th">Income</th><th className="table-th">Expenses</th><th className="table-th">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {ownerRows.map((r) => (
                <tr key={r.ownership.id}>
                  <td className="table-td">{buildingName(r.ownership.buildingId)}</td>
                  <td className="table-td">{flatLabel(r.ownership.flatId)}</td>
                  <td className="table-td font-medium text-gray-800">{residentName(r.ownership.residentId)}</td>
                  <td className="table-td text-gray-500">{r.ownership.ownershipPct}%</td>
                  <td className="table-td text-emerald-600">{money(r.income)}</td>
                  <td className="table-td text-red-500">{money(r.expenseTotal)}</td>
                  <td className="table-td font-medium">{money(r.net)}</td>
                </tr>
              ))}
              {ownerRows.length === 0 && <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-8">No active ownership records yet</td></tr>}
            </tbody>
          </table>
          <div className="px-5 py-2 text-[11px] text-gray-400 border-t border-gray-100">Income = payments received on the owned flat; Expenses = expenses logged against that flat; both scaled by ownership %. Lifetime totals, not scoped to a period.</div>
        </div>
      )}

      {tab === 'compliance' && (
        <div className="space-y-4">
          <div className="card overflow-x-auto">
            <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">Resident ID Compliance</div>
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50">
                <tr><th className="table-th">Resident</th><th className="table-th">Building</th><th className="table-th">Unit</th><th className="table-th">ID Status</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {idComplianceRows.map((r) => (
                  <tr key={r.resident.id}>
                    <td className="table-td font-medium text-gray-800">{r.resident.name}</td>
                    <td className="table-td">{buildingName(r.resident.buildingId)}</td>
                    <td className="table-td">{r.resident.unitLabel}</td>
                    <td className="table-td">
                      <span className={r.idStatus === 'expired' ? 'badge-unpaid' : r.idStatus === 'expiring' ? 'badge-partial' : 'badge-paid'}>
                        {r.idStatus === 'none' ? 'No ID on file' : r.idStatus === 'expired' ? 'Expired' : 'Expiring soon'}
                      </span>
                    </td>
                  </tr>
                ))}
                {idComplianceRows.length === 0 && <tr><td colSpan={4} className="text-center text-sm text-gray-400 py-8">All current residents have valid ID on file</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="card overflow-x-auto">
            <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">Document Compliance</div>
            <table className="w-full min-w-[600px]">
              <thead className="bg-gray-50">
                <tr><th className="table-th">Document</th><th className="table-th">Category</th><th className="table-th">Expiry</th><th className="table-th">Verification</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {docComplianceRows.map((d) => (
                  <tr key={d.id}>
                    <td className="table-td font-medium text-gray-800">{d.title}</td>
                    <td className="table-td text-gray-500">{d.category}</td>
                    <td className="table-td">{d.expiryDate ? dateLabel(d.expiryDate) : '—'}</td>
                    <td className="table-td">
                      <span className={d.verificationStatus === 'rejected' ? 'badge-unpaid' : 'badge-partial'}>{d.verificationStatus ?? 'unverified'}</span>
                    </td>
                  </tr>
                ))}
                {docComplianceRows.length === 0 && <tr><td colSpan={4} className="text-center text-sm text-gray-400 py-8">No compliance issues found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
