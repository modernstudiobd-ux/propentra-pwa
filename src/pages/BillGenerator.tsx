import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel, numberToWords } from '@/lib/format';
import { Printer, Save, RotateCcw, Landmark, Plus, Trash2 } from 'lucide-react';
import type { Bill, ChargeLine } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
}
function genInvoiceNo(existing: number) { return `INV-2026-${String(76 + existing).padStart(3, '0')}`; }
function genReceiptNo(existing: number) { return `RCPT-2026-${String(43 + existing).padStart(4, '0')}`; }

const defaultChargeLabels = ['Water Charge', 'Gas Charge', 'Lift Charge', 'Security Charge', 'Cleaning Charge', 'Internet Charge'];

export default function BillGenerator() {
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const settings = useLiveQuery(() => db.settings.toCollection().first(), []);
  const billCount = useLiveQuery(() => db.bills.count(), []) ?? 0;
  const receiptCount = useLiveQuery(() => db.receipts.count(), []) ?? 0;

  const [buildingId, setBuildingId] = useState<number | ''>('');
  const [flatId, setFlatId] = useState<number | ''>('');
  const [residentId, setResidentId] = useState<number | ''>('');
  const [month, setMonth] = useState('');
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(todayISO(), 21));

  // Meter readings: no fake demo numbers — everything starts at 0 and is entered per bill.
  const [prevReading, setPrevReading] = useState(0);
  const [currReading, setCurrReading] = useState(0);
  const [rate, setRate] = useState(0);

  const [charges, setCharges] = useState<ChargeLine[]>([]);
  const [ratesInitialized, setRatesInitialized] = useState(false);
  const [previousBalance, setPreviousBalance] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [penalty, setPenalty] = useState(0);

  // Pull defaults from Settings (configured by the user) exactly once, instead
  // of hardcoding amounts in the form itself.
  useEffect(() => {
    if (settings && !ratesInitialized) {
      setRate(settings.defaultRates.electricityRate);
      setCharges([
        { label: 'Water Charge', amount: settings.defaultRates.waterCharge },
        { label: 'Gas Charge', amount: settings.defaultRates.gasCharge },
        { label: 'Lift Charge', amount: settings.defaultRates.liftCharge },
        { label: 'Security Charge', amount: settings.defaultRates.securityCharge },
        { label: 'Cleaning Charge', amount: settings.defaultRates.cleaningCharge },
        { label: 'Internet Charge', amount: settings.defaultRates.internetCharge },
      ]);
      setRatesInitialized(true);
    }
  }, [settings, ratesInitialized]);

  useEffect(() => {
    if (!month) {
      setMonth(new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }));
    }
  }, [month]);

  const [generatedBill, setGeneratedBill] = useState<Bill | null>(null);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receiptAmount, setReceiptAmount] = useState(0);
  const [receiptMethod, setReceiptMethod] = useState<'Cash' | 'bKash' | 'Nagad' | 'Bank'>('Cash');

  const buildingFlats = flats.filter((f) => f.buildingId === buildingId);
  const flatResidents = residents.filter((r) => r.flatId === flatId);

  const units = Math.max(0, currReading - prevReading);
  const electricityAmount = units * rate;
  const chargesTotal = charges.reduce((s, c) => s + c.amount, 0);
  const subtotal = electricityAmount + chargesTotal + previousBalance;
  const totalAmount = Math.max(0, subtotal - discount + penalty);

  function updateChargeAmount(idx: number, amount: number) {
    setCharges((prev) => prev.map((c, i) => (i === idx ? { ...c, amount } : c)));
  }
  function updateChargeLabel(idx: number, label: string) {
    setCharges((prev) => prev.map((c, i) => (i === idx ? { ...c, label } : c)));
  }
  function addCustomCharge() {
    setCharges((prev) => [...prev, { label: '', amount: 0 }]);
  }
  function removeCharge(idx: number) {
    setCharges((prev) => prev.filter((_, i) => i !== idx));
  }

  function reset() {
    setBuildingId(''); setFlatId(''); setResidentId('');
    setPrevReading(0); setCurrReading(0);
    setCharges(charges.map((c) => ({ ...c, amount: 0 })));
    setPreviousBalance(0); setDiscount(0); setPenalty(0);
    setGeneratedBill(null);
  }

  async function generateInvoice() {
    if (!buildingId || !flatId || !residentId) { alert('Please select building, flat and resident.'); return; }
    if (charges.some((c) => !c.label.trim())) { alert('Every charge line needs a label.'); return; }
    const bill: Bill = {
      invoiceNo: genInvoiceNo(billCount),
      buildingId: buildingId as number,
      flatId: flatId as number,
      residentId: residentId as number,
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
      residentId: generatedBill.residentId,
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
      residentId: generatedBill.residentId,
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
  const resident = residents.find((r) => r.id === (generatedBill?.residentId ?? residentId));
  const flat = flats.find((f) => f.id === (generatedBill?.flatId ?? flatId));

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
      {/* FORM */}
      <div className="space-y-4 no-print">
        <div className="card p-5 space-y-4">
          <h3 className="font-semibold text-gray-800">1. Select</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Building</label>
              <select className="input" value={buildingId} onChange={(e) => { setBuildingId(Number(e.target.value)); setFlatId(''); setResidentId(''); }}>
                <option value="">Select building</option>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className="label">Flat / Apartment</label>
              <select className="input" value={flatId} onChange={(e) => { setFlatId(Number(e.target.value)); setResidentId(''); }} disabled={!buildingId}>
                <option value="">Select flat</option>
                {buildingFlats.map((f) => <option key={f.id} value={f.id}>{f.unitNo}</option>)}
              </select></div>
          </div>
          <div><label className="label">Resident (Tenant / Flat Owner)</label>
            <select className="input" value={residentId} onChange={(e) => setResidentId(Number(e.target.value))} disabled={!flatId}>
              <option value="">Select resident</option>
              {flatResidents.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.type === 'Owner' ? 'Flat Owner' : 'Tenant'})</option>)}
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
              <input type="number" className="input" value={prevReading || ''} placeholder="0" onChange={(e) => setPrevReading(Number(e.target.value))} /></div>
            <div><label className="label">Current Reading</label>
              <input type="number" className="input" value={currReading || ''} placeholder="0" onChange={(e) => setCurrReading(Number(e.target.value))} /></div>
            <div><label className="label">Rate per Unit (৳)</label>
              <input type="number" className="input" value={rate || ''} placeholder="0" onChange={(e) => setRate(Number(e.target.value))} /></div>
          </div>
          <div className="text-sm text-gray-500">Units used: <b className="text-gray-800">{units}</b> · Electricity: <b className="text-gray-800">{money(electricityAmount)}</b></div>
        </div>

        <div className="card p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-gray-800">4. Charges</h3>
            <button onClick={addCustomCharge} className="text-brand-500 text-sm font-medium flex items-center gap-1 hover:underline">
              <Plus size={14} /> Add Charge
            </button>
          </div>
          <div className="space-y-2">
            {charges.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="input flex-1"
                  value={c.label}
                  placeholder={defaultChargeLabels[i] ?? 'Charge label'}
                  onChange={(e) => updateChargeLabel(i, e.target.value)}
                />
                <input
                  type="number"
                  className="input w-28"
                  value={c.amount || ''}
                  placeholder="0"
                  onChange={(e) => updateChargeAmount(i, Number(e.target.value))}
                />
                <button onClick={() => removeCharge(i)} className="text-red-400 hover:text-red-600 shrink-0"><Trash2 size={16} /></button>
              </div>
            ))}
            {charges.length === 0 && <div className="text-xs text-gray-400">No charges added yet — click "Add Charge".</div>}
          </div>
          <div className="grid grid-cols-3 gap-3 pt-2">
            <div><label className="label">Previous Balance</label>
              <input type="number" className="input" value={previousBalance || ''} placeholder="0" onChange={(e) => setPreviousBalance(Number(e.target.value))} /></div>
            <div><label className="label">Discount</label>
              <input type="number" className="input" value={discount || ''} placeholder="0" onChange={(e) => setDiscount(Number(e.target.value))} /></div>
            <div><label className="label">Penalty / Late Fee</label>
              <input type="number" className="input" value={penalty || ''} placeholder="0" onChange={(e) => setPenalty(Number(e.target.value))} /></div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-2">5. Summary</h3>
          <div className="space-y-1 text-sm text-gray-600">
            <div className="flex justify-between"><span>Electricity ({units} Units)</span><span>{money(electricityAmount)}</span></div>
            {charges.map((c, i) => <div key={i} className="flex justify-between"><span>{c.label || '—'}</span><span>{money(c.amount)}</span></div>)}
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
                  <div className="font-medium text-gray-800">{resident?.name} <span className="text-xs text-gray-400 font-normal">({resident?.type === 'Owner' ? 'Flat Owner' : 'Tenant'})</span></div>
                  <div className="text-gray-500 text-xs">Flat {flat?.unitNo}, {building?.name}</div>
                  <div className="text-gray-500 text-xs">{resident?.mobile}</div>
                </div>

                <table className="w-full text-sm mb-3">
                  <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="py-2">#</th><th>Particulars</th><th className="text-right">Amount (৳)</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    <tr><td className="py-1.5">1</td><td>Electricity ({generatedBill.electricityUnits.current - generatedBill.electricityUnits.previous} Units × {generatedBill.electricityUnits.rate})</td><td className="text-right">{money(electricityAmount)}</td></tr>
                    {generatedBill.charges.map((c, i) => (
                      <tr key={i}><td className="py-1.5">{i + 2}</td><td>{c.label}</td><td className="text-right">{money(c.amount)}</td></tr>
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
