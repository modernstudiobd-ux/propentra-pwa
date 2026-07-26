import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { X, Printer, Landmark } from 'lucide-react';
import { money, dateLabel, numberToWords } from '@/lib/format';
import type { Bill, Building, Flat, Resident } from '@/types';

export default function InvoiceViewModal({
  bill, building, flat, resident, onClose,
}: { bill: Bill; building?: Building; flat?: Flat; resident?: Resident; onClose: () => void }) {
  const settings = useLiveQuery(() => db.settings.toCollection().first(), []);
  const electricityAmount = (bill.electricityUnits.current - bill.electricityUnits.previous) * bill.electricityUnits.rate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 modal-backdrop">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white z-10 no-print">
          <h3 className="font-semibold text-gray-800">Invoice {bill.invoiceNo}</h3>
          <div className="flex items-center gap-3">
            <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 text-xs">
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        <div id="print-area" className="p-6">
          <div className="flex justify-between items-start mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-brand-700 text-white flex items-center justify-center font-bold">
                <Landmark size={18} />
              </div>
              <div>
                <div className="font-semibold text-gray-800">{building?.name}</div>
                <div className="text-xs text-gray-400 max-w-[220px]">{building?.address}</div>
                {settings?.taxId && <div className="text-xs text-gray-400">Tax ID / BIN: {settings.taxId}</div>}
              </div>
            </div>
            <div className="text-right">
              <span className="bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-xs font-semibold">INVOICE</span>
              <div className="text-[10px] text-gray-400 mt-1">Currency: BDT (৳)</div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div><div className="text-gray-400 text-xs">Invoice #</div><div className="font-medium">{bill.invoiceNo}</div></div>
            <div><div className="text-gray-400 text-xs">Date</div><div className="font-medium">{dateLabel(bill.issueDate)}</div></div>
            <div><div className="text-gray-400 text-xs">Due Date</div><div className="font-medium">{dateLabel(bill.dueDate)}</div></div>
            <div><div className="text-gray-400 text-xs">Billing Month</div><div className="font-medium">{bill.billingMonth}</div></div>
          </div>

          <div className="border-t border-gray-100 pt-3 mb-3 text-sm">
            <div className="text-gray-400 text-xs mb-1">Billed To</div>
            <div className="font-medium text-gray-800">{resident?.name} <span className="text-xs text-gray-400 font-normal">({resident?.type === 'Owner' ? 'Flat Owner' : 'Tenant'})</span></div>
            <div className="text-gray-500 text-xs">Flat {flat?.unitNo}, {building?.name}</div>
            {resident?.mobile && <div className="text-gray-500 text-xs">{resident.mobile}</div>}
          </div>

          <table className="w-full text-sm mb-3">
            <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="py-2">#</th><th>Description</th><th className="text-right">Qty</th>
              <th className="text-right">Unit Price (৳)</th><th className="text-right">Amount (৳)</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {(() => {
                const lines: { label: string; qty: number; unitPrice: number; amount: number }[] = [];
                if (electricityAmount > 0) {
                  lines.push({
                    label: 'Electricity',
                    qty: bill.electricityUnits.current - bill.electricityUnits.previous,
                    unitPrice: bill.electricityUnits.rate,
                    amount: electricityAmount,
                  });
                }
                bill.charges.filter((c) => c.amount > 0).forEach((c) => lines.push({ label: c.label, qty: 1, unitPrice: c.amount, amount: c.amount }));
                return lines.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1.5">{i + 1}</td><td>{l.label}</td>
                    <td className="text-right">{l.qty}</td>
                    <td className="text-right">{money(l.unitPrice)}</td>
                    <td className="text-right">{money(l.amount)}</td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>

          <div className="space-y-1 text-sm border-t border-gray-100 pt-2">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{money(bill.subtotal)}</span></div>
            {bill.discount > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{money(bill.discount)}</span></div>}
            {bill.taxAmount > 0 && <div className="flex justify-between"><span className="text-gray-500">Tax / VAT ({bill.taxRate}%)</span><span>{money(bill.taxAmount)}</span></div>}
            {bill.previousBalance > 0 && <div className="flex justify-between"><span className="text-gray-500">Previous Balance</span><span>{money(bill.previousBalance)}</span></div>}
            {bill.penalty > 0 && <div className="flex justify-between"><span className="text-gray-500">Penalty / Late Fee</span><span>{money(bill.penalty)}</span></div>}
          </div>

          <div className="flex justify-between items-center border-t border-gray-100 mt-2 pt-2">
            <span className="font-semibold text-gray-800">Total Amount Due</span>
            <span className="text-lg font-bold text-brand-700">{money(bill.totalAmount)}</span>
          </div>
          <div className="text-xs text-gray-400 mt-1">Amount in words: {numberToWords(bill.totalAmount)}</div>
          {bill.paidAmount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600 pt-1">
              <span>Paid</span><span>{money(bill.paidAmount)}</span>
            </div>
          )}

          {settings?.bankDetails && (
            <div className="text-xs text-gray-600 mt-4 pt-3 border-t border-gray-100 whitespace-pre-line">
              <div className="font-medium text-gray-700 mb-1">Payment Instructions</div>
              {settings.bankDetails}
            </div>
          )}

          <div className="flex justify-between items-end text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
            <span>{settings?.invoiceNotes || 'Please make payment by the due date. Thank you for your cooperation.'}</span>
            <span className="text-right shrink-0 ml-4 flex flex-col items-end">
              {settings?.signatureImage && <img src={settings.signatureImage} className="h-10 object-contain mb-1" />}
              <span>Authorized Signature<br />______________</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
