import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import { Search, Trash2, Eye, Ban, Filter } from 'lucide-react';
import InvoiceViewModal from '@/components/InvoiceViewModal';
import { voidBill, permanentlyDeleteVoidedBill, BillVoidError } from '@/lib/billing';
import type { Bill } from '@/types';

export default function BillsHistory() {
  const bills = useLiveQuery(() => db.bills.orderBy('id').reverse().toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];

  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid' | 'partial'>('all');
  const [showVoided, setShowVoided] = useState(false);
  const [viewBill, setViewBill] = useState<Bill | null>(null);

  const residentName = (id: number) => residents.find((r) => r.id === id)?.name ?? '—';
  const flatLabel = (id: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';

  const filtered = bills
    .filter((b) => showVoided || !b.voided)
    .filter((b) =>
      (buildingFilter === 'all' || b.buildingId === buildingFilter) &&
      (statusFilter === 'all' || b.status === statusFilter) &&
      (b.invoiceNo.toLowerCase().includes(query.toLowerCase()) || residentName(b.residentId).toLowerCase().includes(query.toLowerCase()))
    );

  async function handleVoid(b: Bill) {
    const reason = prompt('Reason for voiding this invoice:');
    if (reason === null) return;
    if (!reason.trim()) { alert('A reason is required to void an invoice.'); return; }
    try {
      await voidBill(b, reason.trim());
    } catch (e) {
      alert(e instanceof BillVoidError ? e.message : 'Could not void this invoice.');
    }
  }

  async function handlePermanentDelete(b: Bill) {
    if (!confirm('Permanently delete this voided invoice? This cannot be undone.')) return;
    try {
      await permanentlyDeleteVoidedBill(b);
      if (viewBill?.id === b.id) setViewBill(null);
    } catch (e) {
      alert(e instanceof BillVoidError ? e.message : 'Could not delete this invoice.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap sm:items-center">
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
        <button onClick={() => setShowVoided((v) => !v)} className={`btn-secondary flex items-center gap-2 text-xs shrink-0 ${showVoided ? 'bg-gray-200' : ''}`}>
          <Filter size={13} /> {showVoided ? 'Hide voided' : 'Show voided'}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">#</th><th className="table-th">Invoice</th><th className="table-th">Resident / Flat</th>
                <th className="table-th">Month</th><th className="table-th">Total</th><th className="table-th">Status</th>
                <th className="table-th">Due Date</th><th className="table-th text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((b, i) => (
                <tr key={b.id} className={b.voided ? 'opacity-50' : ''}>
                  <td className="table-td">{i + 1}</td>
                  <td className="table-td font-medium text-gray-800">{b.invoiceNo}</td>
                  <td className="table-td">{residentName(b.residentId)} ({flatLabel(b.flatId)})</td>
                  <td className="table-td">{b.billingMonth}</td>
                  <td className="table-td">{money(b.totalAmount)}</td>
                  <td className="table-td">
                    {b.voided ? (
                      <span className="badge-unpaid" title={b.voidReason}>Voided</span>
                    ) : (
                      <span className={b.status === 'paid' ? 'badge-paid' : b.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}>
                        {b.status[0].toUpperCase() + b.status.slice(1)}
                      </span>
                    )}
                  </td>
                  <td className="table-td">{dateLabel(b.dueDate)}</td>
                  <td className="table-td text-right">
                    <button onClick={() => setViewBill(b)} className="icon-btn text-brand-500 mr-1"><Eye size={16} /></button>
                    {!b.voided && <button onClick={() => handleVoid(b)} className="icon-btn text-red-400" title="Void this invoice"><Ban size={16} /></button>}
                    {b.voided && <button onClick={() => handlePermanentDelete(b)} className="icon-btn text-red-400" title="Permanently delete this voided invoice"><Trash2 size={16} /></button>}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-8">No invoices found</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filtered.map((b) => (
            <div key={b.id} className={`p-4 flex items-start justify-between gap-3 ${b.voided ? 'opacity-50' : ''}`}>
              <button onClick={() => setViewBill(b)} className="min-w-0 text-left flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">{b.invoiceNo}</span>
                  {b.voided ? <span className="badge-unpaid">Voided</span> : (
                    <span className={b.status === 'paid' ? 'badge-paid' : b.status === 'partial' ? 'badge-partial' : 'badge-unpaid'}>
                      {b.status[0].toUpperCase() + b.status.slice(1)}
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{residentName(b.residentId)} ({flatLabel(b.flatId)})</div>
                <div className="text-xs text-gray-400 mt-1">{b.billingMonth} · Due {dateLabel(b.dueDate)}</div>
              </button>
              <div className="flex items-center shrink-0 gap-2">
                <span className="font-semibold text-gray-800 text-sm">{money(b.totalAmount)}</span>
                {!b.voided && <button onClick={() => handleVoid(b)} className="icon-btn text-red-400"><Ban size={18} /></button>}
                {b.voided && <button onClick={() => handlePermanentDelete(b)} className="icon-btn text-red-400"><Trash2 size={18} /></button>}
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center text-sm text-gray-400 py-8">No invoices found</div>}
        </div>

        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">Total: {filtered.length} invoices{showVoided ? ' (including voided)' : ''}</div>
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
