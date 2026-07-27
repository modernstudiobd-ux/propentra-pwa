import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import { Search, Eye, Printer, FileText } from 'lucide-react';
import InvoiceViewModal from '@/components/InvoiceViewModal';
import type { Bill } from '@/types';

export default function InvoiceGenerator() {
  const bills = useLiveQuery(() => db.bills.orderBy('id').reverse().toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];

  const [query, setQuery] = useState('');
  const [viewBill, setViewBill] = useState<Bill | null>(null);

  const residentName = (id: number) => residents.find((r) => r.id === id)?.name ?? '—';
  const flatLabel = (id: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';

  const filtered = bills.filter((b) =>
    b.invoiceNo.toLowerCase().includes(query.toLowerCase()) ||
    residentName(b.residentId).toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="card p-5 flex items-start gap-3">
        <FileText className="text-brand-500 shrink-0 mt-0.5" size={20} />
        <div className="text-sm text-gray-600">
          Look up any invoice already generated from <b>Bill Generator</b>, then view, print, or save it as PDF —
          without having to recreate it.
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice # or resident..." className="input pl-9" />
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[700px]">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-th">Invoice #</th><th className="table-th">Resident / Flat</th>
              <th className="table-th">Month</th><th className="table-th">Amount</th>
              <th className="table-th">Status</th><th className="table-th text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map((b) => (
              <tr key={b.id}>
                <td className="table-td font-medium text-gray-800">{b.invoiceNo}</td>
                <td className="table-td">{residentName(b.residentId)} ({flatLabel(b.flatId)})</td>
                <td className="table-td">{b.billingMonth}</td>
                <td className="table-td">{money(b.totalAmount)}</td>
                <td className="table-td">
                  <span className={b.status === 'paid' ? 'badge-paid' : b.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}>
                    {b.status[0].toUpperCase() + b.status.slice(1)}
                  </span>
                </td>
                <td className="table-td text-right">
                  <button onClick={() => setViewBill(b)} className="text-brand-500 hover:text-brand-700 mr-3"><Eye size={16} /></button>
                  <button onClick={() => setViewBill(b)} className="text-gray-400 hover:text-brand-600"><Printer size={16} /></button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-10">
                No invoices found. Generate one from Bill Generator first.
              </td></tr>
            )}
          </tbody>
        </table>
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
