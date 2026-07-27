import { useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { X, Printer, Landmark } from 'lucide-react';
import { money, dateLabel, numberToWords } from '@/lib/format';
import { printNode } from '@/lib/printUtil';
import type { Receipt, Building, Flat, Resident } from '@/types';

export default function ReceiptViewModal({
  receipt, building, flat, resident, onClose,
}: { receipt: Receipt; building?: Building; flat?: Flat; resident?: Resident; onClose: () => void }) {
  const settings = useLiveQuery(() => db.settings.toCollection().first(), []);
  const printRef = useRef<HTMLDivElement>(null);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 modal-backdrop">
      <div className="bg-white rounded-xl w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white z-10 no-print">
          <h3 className="font-semibold text-gray-800">Receipt {receipt.receiptNo}</h3>
          <div className="flex items-center gap-3">
            <button onClick={() => printRef.current && printNode(printRef.current)} className="btn-secondary flex items-center gap-2 text-xs">
              <Printer size={14} /> Print
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>
        </div>

        <div id="print-area" ref={printRef} className="p-6">
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
            <span className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-xs font-semibold">RECEIPT</span>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div><div className="text-gray-400 text-xs">Receipt #</div><div className="font-medium">{receipt.receiptNo}</div></div>
            <div><div className="text-gray-400 text-xs">Date</div><div className="font-medium">{dateLabel(receipt.date)}</div></div>
          </div>

          <div className="border-t border-gray-100 pt-3 mb-3 text-sm">
            <div className="text-gray-400 text-xs mb-1">Received From</div>
            <div className="font-medium text-gray-800">{resident?.name} <span className="text-xs text-gray-400 font-normal">({resident?.type === 'Owner' ? 'Flat Owner' : 'Tenant'})</span></div>
            <div className="text-gray-500 text-xs">Flat {flat?.unitNo}, {building?.name}</div>
          </div>

          <div className="space-y-1 text-sm border-t border-gray-100 pt-2">
            <div className="flex justify-between"><span className="text-gray-500">Total Payable (from Invoice)</span><span>{money(receipt.totalPayable)}</span></div>
            {receipt.previousBalance > 0 && <div className="flex justify-between"><span className="text-gray-500">Previous Balance</span><span>{money(receipt.previousBalance)}</span></div>}
            <div className="flex justify-between font-medium text-gray-800"><span>Amount Received</span><span>{money(receipt.amountReceived)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Remaining Balance</span><span>{money(receipt.remainingBalance)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm border-t border-gray-100 mt-3 pt-3">
            <div><div className="text-gray-400 text-xs">Payment Method</div><div className="font-medium">{receipt.method}</div></div>
            <div><div className="text-gray-400 text-xs">In Words</div><div className="font-medium">{numberToWords(receipt.amountReceived)}</div></div>
          </div>

          <div className="text-xs text-gray-400 mt-6 pt-3 border-t border-gray-100 flex justify-between items-end">
            <span>Thank you for your payment!</span>
            <span className="text-right flex flex-col items-end">
              {settings?.signatureImage && <img src={settings.signatureImage} className="h-10 object-contain mb-1" />}
              Received by: {receipt.receivedBy}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
