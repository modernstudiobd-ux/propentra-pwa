import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import { Search, Trash2, Eye, Printer } from 'lucide-react';
import InvoiceViewModal from '@/components/InvoiceViewModal';
import type { Bill } from '@/types';

export default function BillsHistory() {
  const bills = useLiveQuery(() => db.bills.orderBy('id').reverse().toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];

  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all');
  const [viewBill, setViewBill] = useState<Bill | null>(null);

  const residentName = (id: number) => residents.find((r) => r.id === id)?.name ?? '—';
  const flatLabel = (id: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';

  const filtered = bills.filter((b) =>
    (buildingFilter === 'all' || b.buildingId === buildingFilter) &&
    (statusFilter === 'all' || b.status === statusFilter) &&
    (b.invoiceNo.toLowerCase().includes(query.toLowerCase()) || residentName(b.residentId).toLowerCase().includes(query.toLowerCase()))
  );

  async function remove(id?: number) {
    if (!id) return;
    if (!confirm('Delete this invoice? Linked receipts/payments will remain but be orphaned.')) return;
    await db.bills.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice or resident..." className="input pl-9" />
        </div>
        <select className="input sm:w-48" value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          <option value="all">All Buildings</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input sm:w-40" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as any)}>
          <option value="all">All Status</option>
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
          <option value="partial">Partial</option>
        </select>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">#</th><th className="table-th">Invoice</th><th className="table-th">Resident / Flat</th>
              <th className="table-th">Month</th><th className="table-th">Total (৳)</th><th className="table-th">Status</th>
              <th className="table-th">Due Date</th><th className="table-th text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((b, i) => (
              <tr key={b.id}>
                <td className="table-td">{i + 1}</td>
                <td className="table-td font-medium text-gray-800">{b.invoiceNo}</td>
                <td className="table-td">{residentName(b.residentId)} ({flatLabel(b.flatId)})</td>
                <td className="table-td">{b.billingMonth}</td>
                <td className="table-td">{money(b.totalAmount)}</td>
                <td className="table-td">
                  <span className={b.status === 'paid' ? 'badge-paid' : b.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}>
                    {b.status[0].toUpperCase() + b.status.slice(1)}
                  </span>
                </td>
                <td className="table-td">{dateLabel(b.dueDate)}</td>
                <td className="table-td text-right">
                  <button onClick={() => setViewBill(b)} className="text-brand-500 hover:text-brand-700 mr-3"><Eye size={16} /></button>
                  <button onClick={() => setViewBill(b)} className="text-gray-400 hover:text-brand-600 mr-3"><Printer size={16} /></button>
                  <button onClick={() => remove(b.id)} className="text-red-400 hover:text-red-600"><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-8">No invoices found</td></tr>}
          </tbody>
        </table>
        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">Total: {filtered.length} invoices</div>
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
