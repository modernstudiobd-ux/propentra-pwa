import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money } from '@/lib/format';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from 'recharts';

export default function Reports() {
  const bills = useLiveQuery(() => db.bills.toArray(), []) ?? [];
  const [tab, setTab] = useState<'collection' | 'outstanding' | 'monthly'>('collection');

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

  const tabs = [
    { key: 'collection', label: 'Collection Report' },
    { key: 'outstanding', label: 'Outstanding Report' },
    { key: 'monthly', label: 'Monthly Summary' },
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

      <div className="card overflow-x-auto">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold text-gray-800">Summary</div>
        <table className="w-full min-w-[600px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">Month</th><th className="table-th">Total Invoices</th>
              <th className="table-th">Paid Amount (৳)</th><th className="table-th">Due Amount (৳)</th><th className="table-th">Collection %</th>
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
    </div>
  );
}
