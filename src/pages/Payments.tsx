import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import { Search } from 'lucide-react';

export default function Payments() {
  const payments = useLiveQuery(() => db.payments.orderBy('id').reverse().toArray(), []) ?? [];
  const bills = useLiveQuery(() => db.bills.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const [query, setQuery] = useState('');

  const residentName = (id: number) => residents.find((r) => r.id === id)?.name ?? '—';
  const flatLabel = (id: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';
  const invoiceNo = (id: number) => bills.find((b) => b.id === id)?.invoiceNo ?? '—';

  const filtered = payments.filter((p) =>
    residentName(p.residentId).toLowerCase().includes(query.toLowerCase()) || invoiceNo(p.invoiceId).toLowerCase().includes(query.toLowerCase())
  );
  const total = filtered.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search payments..." className="input pl-9" />
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">#</th><th className="table-th">Date</th><th className="table-th">Invoice #</th>
              <th className="table-th">Resident / Flat</th><th className="table-th">Method</th>
              <th className="table-th">Amount (৳)</th><th className="table-th">Type</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((p, i) => (
              <tr key={p.id}>
                <td className="table-td">{i + 1}</td>
                <td className="table-td">{dateLabel(p.date)}</td>
                <td className="table-td font-medium text-gray-800">{invoiceNo(p.invoiceId)}</td>
                <td className="table-td">{residentName(p.residentId)} ({flatLabel(p.flatId)})</td>
                <td className="table-td">{p.method}</td>
                <td className="table-td">{money(p.amount)}</td>
                <td className="table-td">
                  <span className={p.type === 'Full' ? 'badge-paid' : 'badge-partial'}>{p.type}</span>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} className="text-center text-sm text-gray-400 py-8">No payments found</td></tr>}
          </tbody>
        </table>
        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100 flex justify-between">
          <span>Total: {filtered.length} payments</span>
          <span className="font-semibold text-gray-700">Total Payments: {money(total)}</span>
        </div>
      </div>
    </div>
  );
}
