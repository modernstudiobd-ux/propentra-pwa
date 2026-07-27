import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import { Search, Plus, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import { recordPaymentForBill, removePayment } from '@/lib/billing';
import type { Bill } from '@/types';

export default function Payments() {
  const payments = useLiveQuery(() => db.payments.orderBy('id').reverse().toArray(), []) ?? [];
  const bills = useLiveQuery(() => db.bills.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const [query, setQuery] = useState('');

  const [open, setOpen] = useState(false);
  const [invoiceQuery, setInvoiceQuery] = useState('');
  const [selectedBillId, setSelectedBillId] = useState<number | ''>('');
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank'>('Cash');

  const residentName = (id: number) => residents.find((r) => r.id === id)?.name ?? '—';
  const flatLabel = (id: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';
  const invoiceNo = (id: number) => bills.find((b) => b.id === id)?.invoiceNo ?? '—';

  const filtered = payments.filter((p) =>
    residentName(p.residentId).toLowerCase().includes(query.toLowerCase()) || invoiceNo(p.invoiceId).toLowerCase().includes(query.toLowerCase())
  );
  const total = filtered.reduce((s, p) => s + p.amount, 0);

  const outstandingBills = bills.filter((b) => b.status !== 'paid').filter((b) =>
    b.invoiceNo.toLowerCase().includes(invoiceQuery.toLowerCase()) || residentName(b.residentId).toLowerCase().includes(invoiceQuery.toLowerCase())
  );
  const selectedBill: Bill | undefined = bills.find((b) => b.id === selectedBillId);

  function openAdd() {
    setInvoiceQuery(''); setSelectedBillId(''); setAmount(0); setMethod('Cash');
    setOpen(true);
  }

  function selectBill(b: Bill) {
    setSelectedBillId(b.id!);
    setAmount(b.totalAmount - b.paidAmount);
  }

  async function savePayment() {
    if (!selectedBill || amount <= 0) return;
    await recordPaymentForBill(selectedBill, amount, method);
    setOpen(false);
  }

  async function remove(paymentId?: number) {
    const payment = payments.find((p) => p.id === paymentId);
    if (!payment) return;
    if (!confirm('Remove this payment? The linked invoice balance will be restored.')) return;
    await removePayment(payment);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search payments..." className="input pl-9" />
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 shrink-0">
          <Plus size={16} /> Add Payment
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[750px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">#</th><th className="table-th">Date</th><th className="table-th">Invoice #</th>
                <th className="table-th">Resident / Flat</th><th className="table-th">Method</th>
                <th className="table-th">Amount (৳)</th><th className="table-th">Type</th><th className="table-th text-right">Action</th>
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
                  <td className="table-td text-right">
                    <button onClick={() => remove(p.id)} className="icon-btn text-red-400"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} className="text-center text-sm text-gray-400 py-8">No payments found</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filtered.map((p) => (
            <div key={p.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-800">{invoiceNo(p.invoiceId)}</span>
                  <span className={p.type === 'Full' ? 'badge-paid' : 'badge-partial'}>{p.type}</span>
                </div>
                <div className="text-sm text-gray-500 mt-0.5">{residentName(p.residentId)} ({flatLabel(p.flatId)})</div>
                <div className="text-xs text-gray-400 mt-1">{dateLabel(p.date)} · {p.method}</div>
              </div>
              <div className="flex items-center shrink-0 gap-2">
                <span className="font-semibold text-gray-800 text-sm">{money(p.amount)}</span>
                <button onClick={() => remove(p.id)} className="icon-btn text-red-400"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="text-center text-sm text-gray-400 py-8">No payments found</div>}
        </div>

        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100 flex justify-between">
          <span>Total: {filtered.length} payments</span>
          <span className="font-semibold text-gray-700">Total Payments: {money(total)}</span>
        </div>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Add Payment">
        <div className="space-y-3">
          <div>
            <label className="label">Search Invoice</label>
            <input className="input" placeholder="Invoice # or resident name..." value={invoiceQuery} onChange={(e) => setInvoiceQuery(e.target.value)} />
          </div>
          <div className="max-h-48 overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
            {outstandingBills.map((b) => (
              <button
                key={b.id}
                onClick={() => selectBill(b)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${selectedBillId === b.id ? 'bg-brand-50' : ''}`}
              >
                <div className="font-medium text-gray-800">{b.invoiceNo} — {residentName(b.residentId)}</div>
                <div className="text-xs text-gray-400">Due: {money(b.totalAmount - b.paidAmount)}</div>
              </button>
            ))}
            {outstandingBills.length === 0 && <div className="px-3 py-4 text-xs text-gray-400 text-center">No outstanding invoices found</div>}
          </div>

          {selectedBill && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Amount (৳)</label>
                  <input type="number" className="input" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} /></div>
                <div><label className="label">Method</label>
                  <select className="input" value={method} onChange={(e) => setMethod(e.target.value as any)}>
                    <option>Cash</option><option>bKash</option><option>Nagad</option><option>Bank</option>
                  </select></div>
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={savePayment} className="btn-primary flex-1" disabled={amount <= 0}>Save Payment</button>
                <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
