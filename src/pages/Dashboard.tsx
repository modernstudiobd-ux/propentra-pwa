import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, moneyCompact, dateLabel } from '@/lib/format';
import {
  Building2, Home, Users, FileWarning, Wallet, Eye,
  FileText, Receipt, UserPlus, Layers, Plus, ChevronDown,
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { Link, useNavigate } from 'react-router-dom';
import InvoiceViewModal from '@/components/InvoiceViewModal';
import MiniCalendar from '@/components/MiniCalendar';
import type { Bill } from '@/types';

function StatCard({ icon: Icon, label, value, sub, bg, fg }: any) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
        <Icon size={20} style={{ color: fg }} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-500 leading-tight truncate">{label}</div>
        <div className="text-lg sm:text-xl font-semibold text-gray-800 leading-tight whitespace-nowrap truncate">{value}</div>
        {sub && <div className="text-[11px] text-gray-400 leading-tight truncate">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const allBills = useLiveQuery(() => db.bills.orderBy('id').reverse().toArray(), []) ?? [];
  const receipts = useLiveQuery(() => db.receipts.orderBy('id').reverse().toArray(), []) ?? [];

  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [monthFilter, setMonthFilter] = useState<'all' | string>('all');
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [viewBill, setViewBill] = useState<Bill | null>(null);

  const months = useMemo(() => Array.from(new Set(allBills.map((b) => b.billingMonth))), [allBills]);

  const bills = allBills.filter((b) =>
    (buildingFilter === 'all' || b.buildingId === buildingFilter) &&
    (monthFilter === 'all' || b.billingMonth === monthFilter)
  );
  const flatsInScope = buildingFilter === 'all' ? flats : flats.filter((f) => f.buildingId === buildingFilter);
  const residentsInScope = buildingFilter === 'all' ? residents : residents.filter((r) => r.buildingId === buildingFilter);

  const unpaidBills = bills.filter((b) => b.status !== 'paid');
  const unpaidTotal = unpaidBills.reduce((s, b) => s + (b.totalAmount - b.paidAmount), 0);
  const collected = bills.reduce((s, b) => s + b.paidAmount, 0);

  const paidCount = bills.filter((b) => b.status === 'paid').length;
  const unpaidCount = bills.filter((b) => b.status === 'unpaid').length;
  const partialCount = bills.filter((b) => b.status === 'partial').length;
  const totalBills = bills.length || 1;
  const totalDue = bills.reduce((s, b) => s + (b.totalAmount - b.paidAmount), 0);
  const totalAll = collected + totalDue || 1;

  const statusData = [
    { name: 'Paid', value: collected, color: '#10b981' },
    { name: 'Unpaid', value: bills.filter((b) => b.status === 'unpaid').reduce((s, b) => s + b.totalAmount, 0), color: '#ef4444' },
    { name: 'Partial', value: bills.filter((b) => b.status === 'partial').reduce((s, b) => s + (b.totalAmount - b.paidAmount), 0), color: '#f59e0b' },
  ];

  const monthMap = new Map<string, { collected: number; due: number; count: number }>();
  allBills.forEach((b) => {
    if (buildingFilter !== 'all' && b.buildingId !== buildingFilter) return;
    const cur = monthMap.get(b.billingMonth) ?? { collected: 0, due: 0, count: 0 };
    cur.collected += b.paidAmount;
    cur.due += b.totalAmount - b.paidAmount;
    cur.count += 1;
    monthMap.set(b.billingMonth, cur);
  });
  const monthly = Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v }));

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const flatLabel = (id: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';
  const residentName = (id: number) => residents.find((r) => r.id === id)?.name ?? '—';

  const newActions = [
    { label: 'Generate Bill', icon: FileText, to: '/billing/generator' },
    { label: 'Add Resident', icon: UserPlus, to: '/residents' },
    { label: 'Add Flat', icon: Home, to: '/flats' },
    { label: 'Add Building', icon: Building2, to: '/buildings' },
  ];

  return (
    <div className="space-y-5">
      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <select className="input sm:w-48" value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All Buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="input sm:w-40" value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)}>
            <option value="all">All Months</option>
            {months.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="relative">
          <button onClick={() => setNewMenuOpen((v) => !v)} className="btn-primary flex items-center gap-2">
            <Plus size={16} /> New <ChevronDown size={14} />
          </button>
          {newMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setNewMenuOpen(false)} />
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-gray-100 z-20 overflow-hidden">
                {newActions.map((a) => (
                  <button key={a.label} onClick={() => { setNewMenuOpen(false); navigate(a.to); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50">
                    <a.icon size={16} className="text-brand-500" /> {a.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard icon={Building2} label="Buildings" value={buildingFilter === 'all' ? buildings.length : 1} bg="#e0f2fe" fg="#0284c7" />
        <StatCard icon={Home} label="Flats" value={flatsInScope.length} bg="#dcfce7" fg="#16a34a" />
        <StatCard icon={Users} label="Residents" value={residentsInScope.length} bg="#ede9fe" fg="#7c3aed" />
        <StatCard icon={FileWarning} label="Unpaid" value={unpaidBills.length} sub={money(unpaidTotal)} bg="#ffedd5" fg="#ea580c" />
        <StatCard icon={Wallet} label="Collection" value={money(collected)} sub={monthFilter === 'all' ? 'All time' : monthFilter} bg="#ccfbf1" fg="#0d9488" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Recent Invoices</h3>
              <Link to="/billing/history" className="text-brand-500 text-sm font-medium hover:underline">View All</Link>
            </div>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400">
                    <th className="pb-2">Invoice #</th><th className="pb-2">Resident / Flat</th><th className="pb-2">Month</th>
                    <th className="pb-2">Amount</th><th className="pb-2">Status</th><th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {bills.slice(0, 6).map((b) => (
                    <tr key={b.id}>
                      <td className="py-2.5 text-sm font-medium text-gray-800">{b.invoiceNo}</td>
                      <td className="py-2.5 text-sm text-gray-600">{residentName(b.residentId)} ({flatLabel(b.flatId)})</td>
                      <td className="py-2.5 text-sm text-gray-500">{b.billingMonth}</td>
                      <td className="py-2.5 text-sm text-gray-700">{money(b.totalAmount)}</td>
                      <td className="py-2.5">
                        <span className={b.status === 'paid' ? 'badge-paid' : b.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}>
                          {b.status[0].toUpperCase() + b.status.slice(1)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        <button onClick={() => setViewBill(b)} className="icon-btn text-gray-400 hover:text-brand-600"><Eye size={16} /></button>
                      </td>
                    </tr>
                  ))}
                  {bills.length === 0 && (
                    <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-8">No invoices yet — generate one from Bill Generator.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-100">
              {bills.slice(0, 6).map((b) => (
                <button key={b.id} onClick={() => setViewBill(b)} className="w-full text-left py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-800">{b.invoiceNo}</span>
                      <span className={b.status === 'paid' ? 'badge-paid' : b.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}>
                        {b.status[0].toUpperCase() + b.status.slice(1)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{residentName(b.residentId)} ({flatLabel(b.flatId)}) · {b.billingMonth}</div>
                  </div>
                  <span className="text-sm font-semibold text-gray-800 shrink-0">{money(b.totalAmount)}</span>
                </button>
              ))}
              {bills.length === 0 && (
                <div className="text-center text-sm text-gray-400 py-8">No invoices yet — generate one from Bill Generator.</div>
              )}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Monthly Overview</h3>
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="text-left text-xs text-gray-400">
                    <th className="pb-2">Month</th><th className="pb-2">Invoices</th><th className="pb-2">Collected</th><th className="pb-2">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {monthly.map((m) => (
                    <tr key={m.month}>
                      <td className="py-2 text-sm font-medium text-gray-800">{m.month}</td>
                      <td className="py-2 text-sm text-gray-600">{m.count}</td>
                      <td className="py-2 text-sm text-emerald-600">{money(m.collected)}</td>
                      <td className="py-2 text-sm text-red-500">{money(m.due)}</td>
                    </tr>
                  ))}
                  {monthly.length === 0 && (
                    <tr><td colSpan={4} className="text-center text-sm text-gray-400 py-8">No data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="sm:hidden divide-y divide-gray-100">
              {monthly.map((m) => (
                <div key={m.month} className="py-2.5 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{m.month}</div>
                    <div className="text-xs text-gray-400">{m.count} invoices</div>
                  </div>
                  <div className="text-right text-sm">
                    <div className="text-emerald-600">{money(m.collected)}</div>
                    <div className="text-red-500">{money(m.due)}</div>
                  </div>
                </div>
              ))}
              {monthly.length === 0 && <div className="text-center text-sm text-gray-400 py-8">No data yet</div>}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="card p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Quick Actions</h3>
            <div className="grid grid-cols-2 gap-2">
              {newActions.map((a) => (
                <Link key={a.label} to={a.to} className="flex flex-col items-start gap-2 p-3 rounded-lg border border-gray-100 hover:border-brand-200 hover:bg-brand-50 transition-colors">
                  <a.icon size={18} className="text-brand-500" />
                  <span className="text-xs font-medium text-gray-700 leading-tight">{a.label}</span>
                </Link>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <MiniCalendar />
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-gray-800 mb-3">Payment Summary</h3>
            <div className="flex items-center gap-4">
              <div className="relative w-32 h-32 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={statusData} dataKey="value" innerRadius={44} outerRadius={62} paddingAngle={3}>
                      {statusData.map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center px-2 text-center">
                  <div className="text-sm font-bold text-gray-800 leading-tight">{moneyCompact(totalAll)}</div>
                  <div className="text-[10px] text-gray-400">Total</div>
                </div>
              </div>
              <div className="space-y-2 flex-1 min-w-0">
                {statusData.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-gray-600">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.color }} /> {s.name}
                    </span>
                    <span className="font-medium text-gray-700 truncate ml-2">{money(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Recent Receipts</h3>
              <Link to="/billing/payments" className="text-brand-500 text-sm font-medium hover:underline">View All</Link>
            </div>
            <div className="divide-y divide-gray-100">
              {receipts.slice(0, 4).map((r) => (
                <div key={r.id} className="py-2.5 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-gray-800">{r.receiptNo}</div>
                    <div className="text-xs text-gray-400">{dateLabel(r.date)} · {r.method}</div>
                  </div>
                  <div className="text-sm font-semibold text-gray-800">{money(r.amountReceived)}</div>
                </div>
              ))}
              {receipts.length === 0 && <div className="py-6 text-center text-sm text-gray-400">No receipts yet</div>}
            </div>
          </div>
        </div>
      </div>

      {viewBill && (
        <InvoiceViewModal
          bill={viewBill}
          building={buildings.find((b) => b.id === viewBill.buildingId)}
          flat={flats.find((f) => f.id === viewBill.flatId)}
          resident={residents.find((r) => r.id === viewBill.residentId)}
          onClose={() => setViewBill(null)}
        />
      )}
    </div>
  );
}
