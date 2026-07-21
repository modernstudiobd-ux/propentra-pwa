import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel, numberToWords } from '@/lib/format';
import { Printer, Save, RotateCcw, Landmark } from 'lucide-react';
import type { Bill, ChargeLine } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
}
function genInvoiceNo(existing: number) { return `INV-2026-${String(76 + existing).padStart(3, '0')}`; }
function genReceiptNo(existing: number) { return `RCPT-2026-${String(43 + existing).padStart(4, '0')}`; }

export default function BillGenerator() {
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const tenants = useLiveQuery(() => db.tenants.toArray(), []) ?? [];
  const settings = useLiveQuery(() => db.settings.toCollection().first(), []);
  const billCount = useLiveQuery(() => db.bills.count(), []) ?? 0;
  const receiptCount = useLiveQuery(() => db.receipts.count(), []) ?? 0;

  const [buildingId, setBuildingId] = useState<number | ''>('');
  const [flatId, setFlatId] = useState<number | ''>('');
  const [tenantId, setTenantId] = useState<number | ''>('');
  const [month, setMonth] = useState('July 2026');
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), 21));

  const [prevReading, setPrevReading] = useState(12350);
  const [currReading, setCurrReading] = useState(12465);
  const [rate, setRate] = useState(settings?.defaultRates.electricityRate ?? 12);

  const [charges, setCharges] = useState<ChargeLine[]>([
    { label: 'Water Charge', amount: 300 },
    { label: 'Gas Charge', amount: 800 },
    { label: 'Lift Charge', amount: 500 },
    { label: 'Security Charge', amount: 700 },
    { label: 'Cleaning Charge', amount: 500 },
    { label: 'Internet Charge', amount: 600 },
    { label: 'Other Charge', amount: 0 },
  ]);
  const [previousBalance, setPreviousBalance] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [penalty, setPenalty] = useState(0);

  const [generatedBill, setGeneratedBill] = useState<Bill | null>(null);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptAmount, setReceiptAmount] = useState(0);
  const [receiptMethod, setReceiptMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank'>('Cash');

  const buildingFlats = flats.filter((f) => f.buildingId === buildingId);
  const flatTenants = tenants.filter((t) => t.flatId === flatId);

  const units = Math.max(0, currReading - prevReading);
  const electricityAmount = units * rate;
  const chargesTotal = charges.reduce((s, c) => s + c.amount, 0);
  const subtotal = electricityAmount + chargesTotal + previousBalance;
  const totalAmount = Math.max(0, subtotal - discount + penalty);

  function updateCharge(idx: number, amount: number) {
    setCharges((prev) => prev.map((c, i) => (i === idx ? { ...c, amount } : c)));
  }

  function reset() {
    setBuildingId(''); setFlatId(''); setTenantId('');
    setPrevReading(0); setCurrReading(0);
    setCharges(charges.map((c) => ({ ...c, amount: 0 })));
    setPreviousBalance(0); setDiscount(0); setPenalty(0);
    setGeneratedBill(null);
  }

  async function generateInvoice() {
    if (!buildingId || !flatId || !tenantId) { alert('Please select building, flat and tenant.'); return; }
    const bill: Bill = {
      invoiceNo: genInvoiceNo(billCount),
      buildingId: buildingId as number,
      flatId: flatId as number,
      tenantId: tenantId as number,
      billingMonth: month,
      issueDate,
      dueDate,
      electricityUnits: { previous: prevReading, current: currReading, rate },
      charges,
      previousBalance,
      discount,
      penalty,
      subtotal,
      totalAmount,
      status: 'unpaid',
      paidAmount: 0,
    };
    const id = await db.bills.add(bill);
    setGeneratedBill({ ...bill, id: id as number });
    setReceiptAmount(totalAmount);
  }

  async function recordPayment() {
    if (!generatedBill?.id) return;
    const newPaid = generatedBill.paidAmount + receiptAmount;
    const status = newPaid >= generatedBill.totalAmount ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
    await db.bills.update(generatedBill.id, { paidAmount: newPaid, status });
    await db.receipts.add({
      receiptNo: genReceiptNo(receiptCount),
      invoiceId: generatedBill.id,
      tenantId: generatedBill.tenantId,
      buildingId: generatedBill.buildingId,
      flatId: generatedBill.flatId,
      date: todayISO(),
      amountReceived: receiptAmount,
      previousBalance: generatedBill.previousBalance,
      totalPayable: generatedBill.totalAmount,
      remainingBalance: generatedBill.totalAmount - newPaid,
      method: receiptMethod,
      receivedBy: 'Manager',
    });
    await db.payments.add({
      date: todayISO(),
      invoiceId: generatedBill.id,
      tenantId: generatedBill.tenantId,
      buildingId: generatedBill.buildingId,
      flatId: generatedBill.flatId,
      method: receiptMethod,
      amount: receiptAmount,
      type: newPaid >= generatedBill.totalAmount ? 'Full' : 'Partial',
    });
    setShowReceiptForm(false);
    setGeneratedBill({ ...generatedBill, paidAmount: newPaid, status });
  }

  const building = buildings.find((b) => b.id === (generatedBill?.buildingId ?? buildingId));
  const tenant = tenants.find((t) => t.id === (generatedBill?.tenantId ?? tenantId));
  const flat = flats.find((f) => f.id === (generatedBill?.flatId ?? flatId));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* FORM */}
      <div className="space-y-4 no-print">
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">1. Select</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Building</label>
              <select className="input" value={buildingId} onChange={(e) => { setBuildingId(Number(e.target.value)); setFlatId(''); setTenantId(''); }}>
                <option value="">Select building</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className="label">Flat / Apartment</label>
              <select className="input" value={flatId} onChange={(e) => { setFlatId(Number(e.target.value)); setTenantId(''); }} disabled={!buildingId}>
                <option value="">Select flat</option>
                {buildingFlats.map((f) => <option key={f.id} value={f.id}>{f.unitNo}</option>)}
              </select></div>
          </div>
          <div><label className="label">Tenant</label>
            <select className="input" value={tenantId} onChange={(e) => setTenantId(Number(e.target.value))} disabled={!flatId}>
              <option value="">Select tenant</option>
              {flatTenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select></div>

          <h3 className="font-semibold text-gray-800 pt-2">2. Billing Period</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Month</label>
              <input className="input" value={month} onChange={(e) => setMonth(e.target.value)} /></div>
            <div><label className="label">Issue Date</label>
              <input type="date" className="input" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} /></div>
            <div><label className="label">Due Date</label>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
          </div>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">3. Meter Readings</h3>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Previous (Unit)</label>
              <input type="number" className="input" value={prevReading} onChange={(e) => setPrevReading(Number(e.target.value))} /></div>
            <div><label className="label">Current Reading</label>
              <input type="number" className="input" value={currReading} onChange={(e) => setCurrReading(Number(e.target.value))} /></div>
            <div><label className="label">Rate per Unit (৳)</label>
              <input type="number" className="input" value={rate} onChange={(e) => setRate(Number(e.target.value))} /></div>
          </div>
          <div className="text-sm text-gray-500">Units used: <b className="text-gray-800">{units}</b> · Electricity: <b className="text-gray-800">{money(electricityAmount)}</b></div>
        </div>

        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-800">4. Charges</h3>
          <div className="grid grid-cols-2 gap-3">
            {charges.map((c, i) => (
              <div key={c.label}>
                <label className="label">{c.label}</label>
                <input type="number" className="input" value={c.amount} onChange={(e) => updateCharge(i, Number(e.target.value))} />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div><label className="label">Previous Balance</label>
              <input type="number" className="input" value={previousBalance} onChange={(e) => setPreviousBalance(Number(e.target.value))} /></div>
            <div><label className="label">Discount</label>
              <input type="number" className="input" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
            <div><label className="label">Penalty / Late Fee</label>
              <input type="number" className="input" value={penalty} onChange={(e) => setPenalty(Number(e.target.value))} /></div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-2">5. Summary</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between"><span>Electricity ({units} Units)</span><span>{money(electricityAmount)}</span></div>
            {charges.map((c) => <div key={c.label} className="flex justify-between"><span>{c.label}</span><span>{money(c.amount)}</span></div>)}
            <div className="flex justify-between"><span>Previous Balance</span><span>{money(previousBalance)}</span></div>
            <div className="flex justify-between"><span>Discount</span><span>-{money(discount)}</span></div>
            <div className="flex justify-between"><span>Penalty / Late Fee</span><span>{money(penalty)}</span></div>
          </div>
          <div className="flex justify-between items-center pt-3 mt-2 border-t border-gray-100">
            <span className="font-semibold text-gray-800">Total Amount</span>
            <span className="text-lg font-bold text-brand-700">{money(totalAmount)}</span>
          </div>
          <div className="flex gap-2 pt-4">
            <button onClick={reset} className="btn-secondary flex items-center gap-2"><RotateCcw size={16} /> Reset</button>
            <button onClick={generateInvoice} className="btn-primary flex-1">Generate Invoice</button>
          </div>
        </div>
      </div>

      {/* PREVIEW */}
      <div className="space-y-4">
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 no-print">
            <h3 className="font-semibold text-gray-800">Invoice Preview</h3>
            {generatedBill && (
              <button onClick={() => window.print()} className="btn-secondary flex items-center gap-2 text-xs">
                <Printer size={14} /> Print / Save as PDF
              </button>
            )}
          </div>

          <div id="print-area" className="p-6">
            {!generatedBill ? (
              <div className="text-center text-sm text-gray-400 py-20">Fill the form and click "Generate Invoice" to preview.</div>
            ) : (
              <>
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
                  <div>
                    <div className="text-gray-400 text-xs">Invoice #</div>
                    <div className="font-medium">{generatedBill.invoiceNo}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Date</div>
                    <div className="font-medium">{dateLabel(generatedBill.issueDate)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Due Date</div>
                    <div className="font-medium">{dateLabel(generatedBill.dueDate)}</div>
                  </div>
                  <div>
                    <div className="text-gray-400 text-xs">Billing Month</div>
                    <div className="font-medium">{generatedBill.billingMonth}</div>
                  </div>
                </div>

                <div className="border-t border-gray-100 pt-3 mb-3 text-sm">
                  <div className="text-gray-400 text-xs mb-1">Billed To</div>
                  <div className="font-medium text-gray-800">{tenant?.name}</div>
                  <div className="text-gray-500 text-xs">Flat {flat?.unitNo}, {building?.name}</div>
                  <div className="text-gray-500 text-xs">{tenant?.mobile}</div>
                </div>

                <table className="w-full text-sm mb-3">
                  <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="py-2">#</th><th>Particulars</th><th className="text-right">Amount (৳)</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    <tr><td className="py-1.5">1</td><td>Electricity ({generatedBill.electricityUnits.current - generatedBill.electricityUnits.previous} Units × {generatedBill.electricityUnits.rate})</td><td className="text-right">{money(electricityAmount)}</td></tr>
                    {generatedBill.charges.map((c, i) => (
                      <tr key={c.label}><td className="py-1.5">{i + 2}</td><td>{c.label}</td><td className="text-right">{money(c.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>

                <div className="space-y-1 text-sm border-t border-gray-100 pt-2">
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{money(generatedBill.subtotal)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Previous Balance</span><span>{money(generatedBill.previousBalance)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{money(generatedBill.discount)}</span></div>
                  <div className="flex justify-between"><span className="text-gray-500">Penalty / Late Fee</span><span>{money(generatedBill.penalty)}</span></div>
                </div>

                <div className="flex justify-between items-center border-t border-gray-100 mt-2 pt-2">
                  <span className="font-semibold text-gray-800">Total Amount Due</span>
                  <span className="text-lg font-bold text-brand-700">{money(generatedBill.totalAmount)}</span>
                </div>

                <div className="text-xs text-gray-400 mt-4 pt-3 border-t border-gray-100">
                  Please make payment by the due date. Thank you for your cooperation.
                </div>
              </>
            )}
          </div>
        </div>

        {generatedBill && generatedBill.status !== 'paid' && (
          <div className="card p-5 no-print">
            {!showReceiptForm ? (
              <button onClick={() => setShowReceiptForm(true)} className="btn-primary w-full">Record Payment / Generate Receipt</button>
            ) : (
              <div className="space-y-3">
                <h3 className="font-semibold text-gray-800">Record Payment</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Amount Received (৳)</label>
                    <input type="number" className="input" value={receiptAmount} onChange={(e) => setReceiptAmount(Number(e.target.value))} /></div>
                  <div><label className="label">Method</label>
                    <select className="input" value={receiptMethod} onChange={(e) => setReceiptMethod(e.target.value as any)}>
                      <option>Cash</option><option>bKash</option><option>Nagad</option><option>Bank</option>
                    </select></div>
                </div>
                <div className="text-xs text-gray-400">In words: {numberToWords(receiptAmount)}</div>
                <div className="flex gap-2">
                  <button onClick={recordPayment} className="btn-primary flex-1 flex items-center justify-center gap-2"><Save size={16} /> Save Receipt</button>
                  <button onClick={() => setShowReceiptForm(false)} className="btn-secondary flex-1">Cancel</button>
                </div>
              </div>
            )}
          </div>
        )}

        {generatedBill && generatedBill.status === 'paid' && (
          <div className="card p-5 text-center text-emerald-600 font-medium">✓ Fully Paid</div>
        )}
      </div>
    </div>
  );
}
