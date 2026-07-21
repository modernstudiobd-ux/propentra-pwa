import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import { Building2, Home, Users, FileWarning } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from 'recharts';
import { Link } from 'react-router-dom';

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-xl font-semibold text-gray-800">{value}</div>
        {sub && <div className="text-[11px] text-gray-400">{sub}</div>}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const tenants = useLiveQuery(() => db.tenants.toArray(), []) ?? [];
  const bills = useLiveQuery(() => db.bills.orderBy('id').reverse().toArray(), []) ?? [];
  const receipts = useLiveQuery(() => db.receipts.orderBy('id').reverse().toArray(), []) ?? [];

  const unpaidBills = bills.filter((b) => b.status !== 'paid');
  const unpaidTotal = unpaidBills.reduce((s, b) => s + (b.totalAmount - b.paidAmount), 0);
  const collectedThisMonth = bills.reduce((s, b) => s + b.paidAmount, 0);

  const paidCount = bills.filter((b) => b.status === 'paid').length;
  const unpaidCount = bills.filter((b) => b.status === 'unpaid').length;
  const partialCount = bills.filter((b) => b.status === 'partial').length;
  const total = bills.length || 1;

  const statusData = [
    { name: 'Paid', value: paidCount, color: '#10b981' },
    { name: 'Unpaid', value: unpaidCount, color: '#ef4444' },
    { name: 'Partial', value: partialCount, color: '#f59e0b' },
  ];

  // Simple monthly collection trend built from available bills (demo-friendly, extends as data grows)
  const monthMap = new Map<string, { paid: number; unpaid: number }>();
  bills.forEach((b) => {
    const key = b.billingMonth;
    const cur = monthMap.get(key) ?? { paid: 0, unpaid: 0 };
    cur.paid += b.paidAmount;
    cur.unpaid += b.totalAmount - b.paidAmount;
    monthMap.set(key, cur);
  });
  const trend = Array.from(monthMap.entries()).map(([month, v]) => ({ month, ...v }));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Building2} label="Total Buildings" value={buildings.length} color="bg-sky-500" />
        <StatCard icon={Home} label="Total Flats" value={flats.length} color="bg-emerald-500" />
        <StatCard icon={Users} label="Total Tenants" value={tenants.length} color="bg-indigo-500" />
        <StatCard
          icon={FileWarning}
          label="Unpaid Invoices"
          value={unpaidBills.length}
          sub={money(unpaidTotal)}
          color="bg-red-500"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card p-5 xl:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">Collection Overview</h3>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={trend}>
              <defs>
                <linearGradient id="paidGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="unpaidGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => money(v)} />
              <Area type="monotone" dataKey="paid" stroke="#10b981" fill="url(#paidGrad)" name="Paid" />
              <Area type="monotone" dataKey="unpaid" stroke="#ef4444" fill="url(#unpaidGrad)" name="Unpaid" />
            </AreaChart>
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
          <div className="space-y-2 mt-2">
            {statusData.map((s) => (
              <div key={s.name} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 text-gray-600">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} /> {s.name}
                </span>
                <span className="font-medium text-gray-700">{s.value} ({Math.round((s.value / total) * 100)}%)</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">Recent Invoices</h3>
            <Link to="/billing/history" className="text-brand-500 text-sm font-medium hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {bills.slice(0, 5).map((b) => (
              <div key={b.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-800">{b.invoiceNo}</div>
                  <div className="text-xs text-gray-400">{dateLabel(b.issueDate)} • Due {dateLabel(b.dueDate)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold text-gray-800">{money(b.totalAmount)}</div>
                  <span className={b.status === 'paid' ? 'badge-paid' : b.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}>
                    {b.status[0].toUpperCase() + b.status.slice(1)}
                  </span>
                </div>
              </div>
            ))}
            {bills.length === 0 && <div className="py-6 text-center text-sm text-gray-400">No invoices yet</div>}
          </div>
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800">Recent Receipts</h3>
            <Link to="/billing/payments" className="text-brand-500 text-sm font-medium hover:underline">View All</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {receipts.slice(0, 5).map((r) => (
              <div key={r.id} className="py-3 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-800">{r.receiptNo}</div>
                  <div className="text-xs text-gray-400">{dateLabel(r.date)} • {r.method}</div>
                </div>
                <div className="text-sm font-semibold text-gray-800">{money(r.amountReceived)}</div>
              </div>
            ))}
            {receipts.length === 0 && <div className="py-6 text-center text-sm text-gray-400">No receipts yet</div>}
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-400 text-center">
        Collected so far: <span className="font-medium text-gray-600">{money(collectedThisMonth)}</span>
      </div>
    </div>
  );
}
