import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel, numberToWords } from '@/lib/format';
import { Search, Receipt as ReceiptIcon, Eye, Printer, Save } from 'lucide-react';
import { recordPaymentForBill } from '@/lib/billing';
import ReceiptViewModal from '@/components/ReceiptViewModal';
import type { Bill, Receipt } from '@/types';

export default function ReceiptGenerator() {
  const bills = useLiveQuery(() => db.bills.orderBy('id').reverse().toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const receipts = useLiveQuery(() => db.receipts.orderBy('id').reverse().toArray(), []) ?? [];

  const [query, setQuery] = useState('');
  const [selectedBillId, setSelectedBillId] = useState<number | null>(null);
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank'>('Cash');
  const [viewReceipt, setViewReceipt] = useState<Receipt | null>(null);

  const residentName = (id: number) => residents.find((r) => r.id === id)?.name ?? '—';
  const flatLabel = (id: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';

  const outstanding = bills.filter((b) => b.status !== 'paid');
  const filtered = outstanding.filter((b) =>
    b.invoiceNo.toLowerCase().includes(query.toLowerCase()) ||
    residentName(b.residentId).toLowerCase().includes(query.toLowerCase())
  );

  const selectedBill = bills.find((b) => b.id === selectedBillId) ?? null;
  const due = selectedBill ? selectedBill.totalAmount - selectedBill.paidAmount : 0;

  function selectBill(b: Bill) {
    setSelectedBillId(b.id!);
    setAmount(b.totalAmount - b.paidAmount);
  }

  async function generateReceipt() {
    if (!selectedBill || amount <= 0) return;
    const { receipt } = await recordPaymentForBill(selectedBill, amount, method);
    setViewReceipt(receipt);
    setSelectedBillId(null);
    setAmount(0);
  }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <div className="space-y-4">
        <div className="card p-5 flex items-start gap-3">
          <ReceiptIcon className="text-brand-500 shrink-0 mt-0.5" size={20} />
          <div className="text-sm text-gray-600">
            Select an unpaid or partially paid invoice, enter the amount received, and generate a printable receipt.
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search outstanding invoices..." className="input pl-9" />
        </div>

        <div className="card overflow-hidden max-h-[420px] overflow-y-auto">
          <div className="hidden sm:block overflow-x-auto">
            <table className="w-full min-w-[500px]">
              <thead className="bg-gray-50 sticky top-0">
                <tr><th className="table-th">Invoice #</th><th className="table-th">Resident</th><th className="table-th">Due</th><th className="table-th text-right">Select</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((b) => (
                  <tr key={b.id} className={selectedBillId === b.id ? 'bg-brand-50' : ''}>
                    <td className="table-td font-medium text-gray-800">{b.invoiceNo}</td>
                    <td className="table-td">{residentName(b.residentId)} ({flatLabel(b.flatId)})</td>
                    <td className="table-td">{money(b.totalAmount - b.paidAmount)}</td>
                    <td className="table-td text-right">
                      <button onClick={() => selectBill(b)} className="btn-secondary text-xs">
                        {selectedBillId === b.id ? 'Selected' : 'Select'}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-sm text-gray-400 py-8">No outstanding invoices found.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile tappable list */}
          <div className="sm:hidden divide-y divide-gray-100">
            {filtered.map((b) => (
              <button
                key={b.id}
                onClick={() => selectBill(b)}
                className={`w-full text-left p-4 flex items-center justify-between gap-3 ${selectedBillId === b.id ? 'bg-brand-50' : ''}`}
              >
                <div className="min-w-0">
                  <div className="font-medium text-gray-800">{b.invoiceNo}</div>
                  <div className="text-sm text-gray-500">{residentName(b.residentId)} ({flatLabel(b.flatId)})</div>
                </div>
                <span className="text-sm font-semibold text-gray-800 shrink-0">{money(b.totalAmount - b.paidAmount)}</span>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="text-center text-sm text-gray-400 py-8">No outstanding invoices found.</div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Record Payment</h3>
          {!selectedBill ? (
            <div className="text-sm text-gray-400 py-10 text-center">Select an invoice from the list to record a payment.</div>
          ) : (
            <div className="space-y-3">
              <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Invoice</span><span className="font-medium">{selectedBill.invoiceNo}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Resident</span><span className="font-medium">{residentName(selectedBill.residentId)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Total Amount</span><span>{money(selectedBill.totalAmount)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Already Paid</span><span>{money(selectedBill.paidAmount)}</span></div>
                <div className="flex justify-between font-semibold text-gray-800"><span>Due</span><span>{money(due)}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Amount Received (৳)</label>
                  <input type="number" className="input" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} /></div>
                <div><label className="label">Method</label>
                  <select className="input" value={method} onChange={(e) => setMethod(e.target.value as any)}>
                    <option>Cash</option><option>bKash</option><option>Nagad</option><option>Bank</option>
                  </select></div>
              </div>
              <div className="text-xs text-gray-400">In words: {numberToWords(amount)}</div>
              <button onClick={generateReceipt} disabled={amount <= 0} className="btn-primary w-full flex items-center justify-center gap-2">
                <Save size={16} /> Generate Receipt
              </button>
            </div>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-3">Recent Receipts</h3>
          <div className="divide-y divide-gray-100">
            {receipts.slice(0, 6).map((r) => (
              <div key={r.id} className="py-2.5 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-gray-800">{r.receiptNo}</div>
                  <div className="text-xs text-gray-400">{dateLabel(r.date)} · {residentName(r.residentId)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-800">{money(r.amountReceived)}</span>
                  <button onClick={() => setViewReceipt(r)} className="icon-btn text-gray-400 hover:text-brand-600"><Eye size={16} /></button>
                </div>
              </div>
            ))}
            {receipts.length === 0 && <div className="py-6 text-center text-sm text-gray-400">No receipts yet</div>}
          </div>
        </div>
      </div>

      {viewReceipt && (
        <ReceiptViewModal
          receipt={viewReceipt}
          building={buildings.find((b) => b.id === viewReceipt.buildingId)}
          flat={flats.find((f) => f.id === viewReceipt.flatId)}
          resident={residents.find((r) => r.id === viewReceipt.residentId)}
          onClose={() => setViewReceipt(null)}
        />
      )}
    </div>
  );
}
