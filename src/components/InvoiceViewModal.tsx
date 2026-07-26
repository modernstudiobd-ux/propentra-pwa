import { X, Printer, Landmark } from 'lucide-react';
import { money, dateLabel } from '@/lib/format';
import type { Bill, Building, Flat, Resident } from '@/types';

export default function InvoiceViewModal({
  bill, building, flat, resident, onClose,
}: { bill: Bill; building?: Building; flat?: Flat; resident?: Resident; onClose: () => void }) {
  const electricityAmount = (bill.electricityUnits.current - bill.electricityUnits.previous) * bill.electricityUnits.rate;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 no-print">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
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
              </div>
            </div>
            <span className="bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-xs font-semibold">INVOICE</span>
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
            <div className="text-gray-500 text-xs">{resident?.mobile}</div>
          </div>

          <table className="w-full text-sm mb-3">
            <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
              <th className="py-2">#</th><th>Particulars</th><th className="text-right">Amount (৳)</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              <tr><td className="py-1.5">1</td><td>Electricity ({bill.electricityUnits.current - bill.electricityUnits.previous} Units × {bill.electricityUnits.rate})</td><td className="text-right">{money(electricityAmount)}</td></tr>
              {bill.charges.map((c, i) => (
                <tr key={i}><td className="py-1.5">{i + 2}</td><td>{c.label}</td><td className="text-right">{money(c.amount)}</td></tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 text-sm border-t border-gray-100 pt-2">
            <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{money(bill.subtotal)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Previous Balance</span><span>{money(bill.previousBalance)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{money(bill.discount)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Penalty / Late Fee</span><span>{money(bill.penalty)}</span></div>
          </div>

          <div className="flex justify-between items-center border-t border-gray-100 mt-2 pt-2">
            <span className="font-semibold text-gray-800">Total Amount Due</span>
            <span className="text-lg font-bold text-brand-700">{money(bill.totalAmount)}</span>
          </div>
          {bill.paidAmount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600 pt-1">
              <span>Paid</span><span>{money(bill.paidAmount)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
