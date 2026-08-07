import { useEffect, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel, numberToWords } from '@/lib/format';
import { currencyState } from '@/lib/currency';
import { genInvoiceNo, recordPaymentForBill } from '@/lib/billing';
import { buildInvoiceMessage, buildReceiptMessage, whatsappLink, smsLink } from '@/lib/messaging';
import { printNode } from '@/lib/printUtil';
import { Printer, Save, RotateCcw, Landmark, Plus, Trash2, MessageCircle, MessageSquare, FileText, Receipt as ReceiptIcon } from 'lucide-react';
import InvoiceGenerator from '@/pages/InvoiceGenerator';
import ReceiptGenerator from '@/pages/ReceiptGenerator';
import PaymentMethodSelect from '@/components/PaymentMethodSelect';
import ChargeCombobox from '@/components/ChargeCombobox';
import type { Bill, ChargeLine, Receipt } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }
function addDaysISO(iso: string, days: number) {
  const d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10);
}


const tabs = [
  { key: 'bill', label: 'Bill Generator', icon: FileText },
  { key: 'invoices', label: 'Invoice Generator', icon: FileText },
  { key: 'receipts', label: 'Receipt Generator', icon: ReceiptIcon },
] as const;

export default function BillGenerator() {
  const [tab, setTab] = useState<typeof tabs[number]['key']>('bill');

  return (
    <div className="space-y-5">
      <div className="flex gap-2 flex-wrap no-print">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-brand-500 text-white' : 'bg-white border border-gray-200 text-gray-600'}`}>
            <t.icon size={15} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'bill' && <BillGeneratorForm />}
      {tab === 'invoices' && <InvoiceGenerator />}
      {tab === 'receipts' && <ReceiptGenerator />}
    </div>
  );
}

function BillGeneratorForm() {
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const settings = useLiveQuery(() => db.settings.toCollection().first(), []);

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
  const [taxRate, setTaxRate] = useState(0);
  const [penalty, setPenalty] = useState(0);

  // Pull electricity rate & tax rate defaults from Settings exactly once -
  // charges themselves are no longer auto-populated; the person adds
  // whichever charges actually apply to this bill via the combobox below.
  useEffect(() => {
    if (settings && !ratesInitialized) {
      setRate(settings.defaultRates.electricityRate);
      setTaxRate(settings.defaultTaxRate ?? 0);
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
  const [receiptMethod, setReceiptMethod] = useState('Cash');
  const [lastReceipt, setLastReceipt] = useState<Receipt | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const buildingFlats = flats.filter((f) => f.buildingId === buildingId);
  const flatResidents = residents.filter((r) => r.flatId === flatId);

  const units = Math.max(0, currReading - prevReading);
  const electricityAmount = units * rate;
  const chargesTotal = charges.reduce((s, c) => s + c.amount, 0);
  const subtotal = electricityAmount + chargesTotal; // itemized lines only, before discount/tax
  const afterDiscount = Math.max(0, subtotal - discount);
  const taxAmount = afterDiscount * (taxRate / 100);
  const totalAmount = Math.max(0, afterDiscount + taxAmount + previousBalance + penalty);

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
    setTaxRate(settings?.defaultTaxRate ?? 0);
    setGeneratedBill(null);
    setLastReceipt(null);
  }

  async function generateInvoice() {
    if (!buildingId || !flatId || !residentId) { alert('Please select building, flat and resident.'); return; }
    if (charges.some((c) => !c.label.trim())) { alert('Every charge line needs a label.'); return; }
    const bill: Bill = {
      invoiceNo: await genInvoiceNo(),
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
      taxRate,
      taxAmount,
      penalty,
      subtotal,
      totalAmount,
      status: 'unpaid',
      paidAmount: 0,
    };
    const id = await db.bills.add(bill);
    setGeneratedBill({ ...bill, id: id as number });
    setReceiptAmount(totalAmount);
    setLastReceipt(null);
  }

  async function recordPayment() {
    if (!generatedBill) return;
    const { newPaid, status, receipt } = await recordPaymentForBill(generatedBill, receiptAmount, receiptMethod);
    setShowReceiptForm(false);
    setGeneratedBill({ ...generatedBill, paidAmount: newPaid, status });
    setLastReceipt(receipt);
  }

  const building = buildings.find((b) => b.id === (generatedBill?.buildingId ?? buildingId));
  const resident = residents.find((r) => r.id === (generatedBill?.residentId ?? residentId));
  const flat = flats.find((f) => f.id === (generatedBill?.flatId ?? flatId));

  const hasMobile = !!resident?.mobile?.trim();
  const invoiceMessage = generatedBill && resident ? buildInvoiceMessage(generatedBill, resident, building, flat, settings?.companyName) : '';
  const receiptMessage = lastReceipt && resident ? buildReceiptMessage(lastReceipt, resident, building, flat, settings?.companyName) : '';

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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div><label className="label">Previous (Unit)</label>
              <input type="number" className="input" value={prevReading || ''} placeholder="0" onChange={(e) => setPrevReading(Number(e.target.value))} /></div>
            <div><label className="label">Current Reading</label>
              <input type="number" className="input" value={currReading || ''} placeholder="0" onChange={(e) => setCurrReading(Number(e.target.value))} /></div>
            <div><label className="label">Rate per Unit</label>
              <input type="number" className="input" value={rate || ''} placeholder="0" onChange={(e) => setRate(Number(e.target.value))} /></div>
          </div>
          <div className="text-sm text-gray-500">Units used: <b className="text-gray-800">{units}</b> · Electricity: <b className="text-gray-800">{money(electricityAmount)}</b>
            {units === 0 && <span className="text-gray-400"> (excluded from invoice while 0)</span>}
          </div>
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
              <div key={i} className="flex flex-wrap items-center gap-2">
                <ChargeCombobox value={c.label} onChange={(v) => updateChargeLabel(i, v)} />
                <input
                  type="number"
                  className="input w-24 sm:w-28"
                  value={c.amount || ''}
                  placeholder="0"
                  onChange={(e) => updateChargeAmount(i, Number(e.target.value))}
                />
                <button onClick={() => removeCharge(i)} className="icon-btn text-red-400 shrink-0"><Trash2 size={16} /></button>
              </div>
            ))}
            {charges.length === 0 && <div className="text-xs text-gray-400">No charges added yet — click "Add Charge" to search common charges or enter a custom one.</div>}
          </div>
          <div className="text-xs text-gray-400">Charges left at 0 are automatically excluded from the invoice.</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
            <div><label className="label">Previous Balance</label>
              <input type="number" className="input" value={previousBalance || ''} placeholder="0" onChange={(e) => setPreviousBalance(Number(e.target.value))} /></div>
            <div><label className="label">Discount</label>
              <input type="number" className="input" value={discount || ''} placeholder="0" onChange={(e) => setDiscount(Number(e.target.value))} /></div>
            <div><label className="label">Tax / VAT (%)</label>
              <input type="number" className="input" value={taxRate || ''} placeholder="0" onChange={(e) => setTaxRate(Number(e.target.value))} /></div>
            <div><label className="label">Penalty / Late Fee</label>
              <input type="number" className="input" value={penalty || ''} placeholder="0" onChange={(e) => setPenalty(Number(e.target.value))} /></div>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-semibold text-gray-800 mb-2">5. Summary</h3>
          <div className="space-y-1 text-sm text-gray-600">
            {electricityAmount > 0 && (
              <div className="flex justify-between"><span>Electricity ({units} Units)</span><span>{money(electricityAmount)}</span></div>
            )}
            {charges.filter((c) => c.amount > 0).map((c, i) => (
              <div key={i} className="flex justify-between"><span>{c.label || '—'}</span><span>{money(c.amount)}</span></div>
            ))}
            {previousBalance > 0 && <div className="flex justify-between"><span>Previous Balance</span><span>{money(previousBalance)}</span></div>}
            {discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{money(discount)}</span></div>}
            {taxAmount > 0 && <div className="flex justify-between"><span>Tax / VAT ({taxRate}%)</span><span>{money(taxAmount)}</span></div>}
            {penalty > 0 && <div className="flex justify-between"><span>Penalty / Late Fee</span><span>{money(penalty)}</span></div>}
            {electricityAmount === 0 && chargesTotal === 0 && previousBalance === 0 && discount === 0 && penalty === 0 && (
              <div className="text-gray-400 text-xs py-2">Enter meter readings or charges above to build the invoice.</div>
            )}
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
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-gray-100 no-print">
            <h3 className="font-semibold text-gray-800">Invoice Preview</h3>
            {generatedBill && (
              <div className="flex items-center gap-2">
                <button onClick={() => printRef.current && printNode(printRef.current)} className="btn-secondary flex items-center gap-2 text-xs">
                  <Printer size={14} /> Print / PDF
                </button>
                <a
                  href={hasMobile ? whatsappLink(resident!.mobile, invoiceMessage) : undefined}
                  target="_blank" rel="noreferrer"
                  onClick={(e) => { if (!hasMobile) e.preventDefault(); }}
                  title={hasMobile ? 'Send invoice via WhatsApp' : 'No mobile number on file for this resident'}
                  className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium ${hasMobile ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  <MessageCircle size={14} /> WhatsApp
                </a>
                <a
                  href={hasMobile ? smsLink(resident!.mobile, invoiceMessage) : undefined}
                  onClick={(e) => { if (!hasMobile) e.preventDefault(); }}
                  title={hasMobile ? 'Send invoice via SMS' : 'No mobile number on file for this resident'}
                  className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium ${hasMobile ? 'bg-sky-50 text-sky-700 hover:bg-sky-100' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                >
                  <MessageSquare size={14} /> SMS
                </a>
              </div>
            )}
          </div>

          <div id="print-area" ref={printRef} className="p-6">
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
                      {settings?.taxId && <div className="text-xs text-gray-400">Tax ID / BIN: {settings.taxId}</div>}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="bg-brand-50 text-brand-700 px-3 py-1 rounded-full text-xs font-semibold">INVOICE</span>
                    <div className="text-[10px] text-gray-400 mt-1">Currency: {currencyState.name} ({currencyState.symbol})</div>
                  </div>
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
                  {resident?.mobile && <div className="text-gray-500 text-xs">{resident.mobile}</div>}
                </div>

                <table className="w-full text-sm mb-3">
                  <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="py-2">#</th><th>Description</th><th className="text-right">Qty</th>
                    <th className="text-right">Unit Price</th><th className="text-right">Amount</th>
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {(() => {
                      const lines: { label: string; qty: number; unitPrice: number; amount: number }[] = [];
                      if (electricityAmount > 0) {
                        lines.push({
                          label: 'Electricity',
                          qty: generatedBill.electricityUnits.current - generatedBill.electricityUnits.previous,
                          unitPrice: generatedBill.electricityUnits.rate,
                          amount: electricityAmount,
                        });
                      }
                      generatedBill.charges.filter((c) => c.amount > 0).forEach((c) => lines.push({ label: c.label, qty: 1, unitPrice: c.amount, amount: c.amount }));
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
                  <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{money(generatedBill.subtotal)}</span></div>
                  {generatedBill.discount > 0 && <div className="flex justify-between"><span className="text-gray-500">Discount</span><span>-{money(generatedBill.discount)}</span></div>}
                  {generatedBill.taxAmount > 0 && <div className="flex justify-between"><span className="text-gray-500">Tax / VAT ({generatedBill.taxRate}%)</span><span>{money(generatedBill.taxAmount)}</span></div>}
                  {generatedBill.previousBalance > 0 && <div className="flex justify-between"><span className="text-gray-500">Previous Balance</span><span>{money(generatedBill.previousBalance)}</span></div>}
                  {generatedBill.penalty > 0 && <div className="flex justify-between"><span className="text-gray-500">Penalty / Late Fee</span><span>{money(generatedBill.penalty)}</span></div>}
                </div>

                <div className="flex justify-between items-center border-t border-gray-100 mt-2 pt-2">
                  <span className="font-semibold text-gray-800">Total Amount Due</span>
                  <span className="text-lg font-bold text-brand-700">{money(generatedBill.totalAmount)}</span>
                </div>
                <div className="text-xs text-gray-400 mt-1">Amount in words: {numberToWords(generatedBill.totalAmount)}</div>

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
                  <div><label className="label">Amount Received</label>
                    <input type="number" className="input" value={receiptAmount} onChange={(e) => setReceiptAmount(Number(e.target.value))} /></div>
                  <div><label className="label">Method</label>
                    <PaymentMethodSelect
                      value={receiptMethod}
                      onChange={setReceiptMethod}
                      methods={settings?.paymentMethods ?? ['Cash']}
                      onAddCustom={(name) => settings && db.settings.put({ ...settings, paymentMethods: [...(settings.paymentMethods ?? []), name] })}
                    /></div>
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

        {lastReceipt && (
          <div className="card p-5 no-print space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-emerald-600">✓ Receipt {lastReceipt.receiptNo} generated</div>
                <div className="text-xs text-gray-400">Amount received: {money(lastReceipt.amountReceived)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href={hasMobile ? whatsappLink(resident!.mobile, receiptMessage) : undefined}
                target="_blank" rel="noreferrer"
                onClick={(e) => { if (!hasMobile) e.preventDefault(); }}
                title={hasMobile ? 'Send receipt via WhatsApp' : 'No mobile number on file for this resident'}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium ${hasMobile ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                <MessageCircle size={14} /> Send Receipt via WhatsApp
              </a>
              <a
                href={hasMobile ? smsLink(resident!.mobile, receiptMessage) : undefined}
                onClick={(e) => { if (!hasMobile) e.preventDefault(); }}
                title={hasMobile ? 'Send receipt via SMS' : 'No mobile number on file for this resident'}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium ${hasMobile ? 'bg-sky-50 text-sky-700 hover:bg-sky-100' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
              >
                <MessageSquare size={14} /> Send Receipt via SMS
              </a>
            </div>
          </div>
        )}

        {generatedBill && generatedBill.status === 'paid' && !lastReceipt && (
          <div className="card p-5 text-center text-emerald-600 font-medium">✓ Fully Paid</div>
        )}
      </div>
    </div>
  );
}
