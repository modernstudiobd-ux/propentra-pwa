import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import { Search, Wallet, Plus, ArrowRightLeft, Undo2, SlidersHorizontal, Ban, Trash2 } from 'lucide-react';
import Modal from '@/components/Modal';
import {
  collectDeposit, applyDepositToBill, refundDeposit, adjustDeposit, voidDepositTransaction,
  permanentlyDeleteVoidedDepositTransaction, DepositError,
} from '@/lib/deposits';
import type { Resident, DepositTransaction } from '@/types';

type Action = 'collect' | 'apply' | 'refund' | 'adjust' | null;

export default function Deposits() {
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const bills = useLiveQuery(() => db.bills.toArray(), []) ?? [];
  const txns = useLiveQuery(() => db.depositTransactions.orderBy('id').reverse().toArray(), []) ?? [];

  const [query, setQuery] = useState('');
  const [action, setAction] = useState<Action>(null);
  const [selectedResidentId, setSelectedResidentId] = useState<number | ''>('');
  const [amount, setAmount] = useState(0);
  const [notes, setNotes] = useState('');
  const [selectedBillId, setSelectedBillId] = useState<number | ''>('');
  const [error, setError] = useState('');

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const flatLabel = (id: number) => flats.find((f) => f.id === id)?.unitNo ?? '—';
  const residentName = (id: number) => residents.find((r) => r.id === id)?.name ?? '—';

  function balanceFor(residentId: number) {
    return txns.filter((t) => t.residentId === residentId && !t.voided).reduce((sum, t) => {
      if (t.type === 'collected') return sum + t.amount;
      if (t.type === 'applied' || t.type === 'refunded') return sum - t.amount;
      if (t.type === 'adjustment') return sum + t.amount;
      return sum;
    }, 0);
  }

  const residentIdsWithActivity = Array.from(new Set(txns.map((t) => t.residentId)));
  const rows = residents
    .filter((r) => residentIdsWithActivity.includes(r.id!) || balanceFor(r.id ?? -1) !== 0)
    .map((r) => ({ resident: r, balance: balanceFor(r.id!) }))
    .filter(({ resident }) =>
      resident.name.toLowerCase().includes(query.toLowerCase()) ||
      buildingName(resident.buildingId).toLowerCase().includes(query.toLowerCase())
    )
    .sort((a, b) => b.balance - a.balance);

  const totalHeld = rows.reduce((s, r) => s + Math.max(0, r.balance), 0);

  const selectedResident: Resident | undefined = residents.find((r) => r.id === selectedResidentId);
  const outstandingBills = bills.filter((b) => b.residentId === selectedResidentId && b.status !== 'paid');

  function openAction(a: Action, residentId?: number) {
    setAction(a);
    setSelectedResidentId(residentId ?? '');
    setAmount(0);
    setNotes('');
    setSelectedBillId('');
    setError('');
  }

  async function submit() {
    setError('');
    try {
      if (!selectedResident) throw new DepositError('Select a resident.');
      if (action === 'collect') {
        await collectDeposit(selectedResident, amount, notes || undefined);
      } else if (action === 'apply') {
        const bill = bills.find((b) => b.id === selectedBillId);
        if (!bill) throw new DepositError('Select an invoice to apply this deposit to.');
        await applyDepositToBill(selectedResident, bill, amount);
      } else if (action === 'refund') {
        await refundDeposit(selectedResident, amount, notes || undefined);
      } else if (action === 'adjust') {
        await adjustDeposit(selectedResident, amount, notes);
      }
      setAction(null);
    } catch (e) {
      setError(e instanceof DepositError ? e.message : 'Something went wrong.');
    }
  }

  async function onVoidTxn(t: DepositTransaction) {
    const reason = prompt('Reason for voiding this deposit transaction:');
    if (reason === null) return;
    if (!reason.trim()) { alert('A reason is required to void a deposit transaction.'); return; }
    try {
      await voidDepositTransaction(t, reason.trim());
    } catch (e) {
      alert(e instanceof DepositError ? e.message : 'Could not void this transaction.');
    }
  }

  async function onDeleteTxn(t: DepositTransaction) {
    if (!confirm('Permanently delete this voided transaction? This cannot be undone.')) return;
    try {
      await permanentlyDeleteVoidedDepositTransaction(t);
    } catch (e) {
      alert(e instanceof DepositError ? e.message : 'Could not delete this transaction.');
    }
  }

  const txnTypeLabel: Record<string, string> = {
    collected: 'Collected', applied: 'Applied to Invoice', refunded: 'Refunded', adjustment: 'Adjustment',
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search residents..." className="input pl-9" />
          </div>
          <button onClick={() => openAction('collect')} className="btn-primary flex items-center gap-2 justify-center" disabled={residents.length === 0}>
            <Plus size={16} /> Collect Deposit
          </button>
        </div>

        <div className="card p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-emerald-50">
            <Wallet size={20} className="text-emerald-600" />
          </div>
          <div>
            <div className="text-xs text-gray-500">Total Held (all residents)</div>
            <div className="text-lg font-semibold text-gray-800">{money(totalHeld)}</div>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="divide-y divide-gray-100">
            {rows.map(({ resident, balance }) => (
              <div key={resident.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium text-gray-800">{resident.name}</div>
                  <div className="text-xs text-gray-400">{buildingName(resident.buildingId)} · {flatLabel(resident.flatId)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-gray-800">{money(balance)}</span>
                  <div className="flex gap-1">
                    <button onClick={() => openAction('collect', resident.id)} className="icon-btn text-emerald-500" title="Collect"><Plus size={16} /></button>
                    <button onClick={() => openAction('apply', resident.id)} className="icon-btn text-brand-500" title="Apply to Invoice" disabled={balance <= 0}><ArrowRightLeft size={16} /></button>
                    <button onClick={() => openAction('refund', resident.id)} className="icon-btn text-amber-500" title="Refund" disabled={balance <= 0}><Undo2 size={16} /></button>
                    <button onClick={() => openAction('adjust', resident.id)} className="icon-btn text-gray-400" title="Adjust"><SlidersHorizontal size={16} /></button>
                  </div>
                </div>
              </div>
            ))}
            {rows.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No deposit activity yet. Click "Collect Deposit" to record one.</div>}
          </div>
        </div>
      </div>

      <div className="card p-5 h-fit">
        <h3 className="font-semibold text-gray-800 mb-3">Recent Transactions</h3>
        <div className="divide-y divide-gray-100 max-h-[520px] overflow-y-auto">
          {txns.slice(0, 30).map((t) => (
            <div key={t.id} className="py-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium text-gray-800">{residentName(t.residentId)}</div>
                <div className={`text-sm font-semibold ${t.type === 'collected' ? 'text-emerald-600' : t.type === 'adjustment' && t.amount < 0 ? 'text-red-500' : 'text-gray-700'}`}>
                  {t.type === 'collected' || (t.type === 'adjustment' && t.amount > 0) ? '+' : '-'}{money(Math.abs(t.amount))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 mt-0.5">
                <div className="text-xs text-gray-400" title={t.voided ? t.voidReason : undefined}>{txnTypeLabel[t.type]} · {dateLabel(t.date)}{t.voided ? ' · Voided' : ''}</div>
                {!t.voided && t.type !== 'applied' && (
                  <button onClick={() => onVoidTxn(t)} className="text-gray-300 hover:text-red-500" title="Void"><Ban size={13} /></button>
                )}
                {t.voided && (
                  <button onClick={() => onDeleteTxn(t)} className="text-gray-300 hover:text-red-500" title="Permanently delete"><Trash2 size={13} /></button>
                )}
              </div>
              {t.notes && <div className="text-xs text-gray-400 mt-0.5">{t.notes}</div>}
            </div>
          ))}
          {txns.length === 0 && <div className="text-center text-sm text-gray-400 py-8">No transactions yet</div>}
        </div>
      </div>

      <Modal open={action !== null} onClose={() => setAction(null)} title={
        action === 'collect' ? 'Collect Deposit' : action === 'apply' ? 'Apply Deposit to Invoice' :
        action === 'refund' ? 'Refund Deposit' : 'Adjust Deposit'
      }>
        <div className="space-y-3">
          <div><label className="label">Resident</label>
            <select className="input" value={selectedResidentId} onChange={(e) => setSelectedResidentId(Number(e.target.value))}>
              <option value="">Select resident</option>
              {residents.map((r) => <option key={r.id} value={r.id}>{r.name} — {buildingName(r.buildingId)} {flatLabel(r.flatId)}</option>)}
            </select>
          </div>
          {selectedResident && action !== 'collect' && (
            <div className="text-xs text-gray-500">Current balance: <b>{money(balanceFor(selectedResidentId as number))}</b></div>
          )}
          {action === 'apply' && (
            <div><label className="label">Outstanding Invoice</label>
              <select className="input" value={selectedBillId} onChange={(e) => setSelectedBillId(Number(e.target.value))}>
                <option value="">Select invoice</option>
                {outstandingBills.map((b) => <option key={b.id} value={b.id}>{b.invoiceNo} — Due {money(b.totalAmount - b.paidAmount)}</option>)}
              </select>
              {outstandingBills.length === 0 && selectedResidentId && <div className="text-xs text-gray-400 mt-1">No outstanding invoices for this resident.</div>}
            </div>
          )}
          <div><label className="label">Amount{action === 'adjust' ? ' (negative to deduct)' : ''}</label>
            <input type="number" className="input" value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} /></div>
          {(action === 'refund' || action === 'collect' || action === 'adjust') && (
            <div><label className="label">Notes{action === 'adjust' ? ' (required)' : ' (optional)'}</label>
              <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          )}
          {error && <div className="text-sm text-red-500">{error}</div>}
          <div className="flex gap-2 pt-2">
            <button onClick={submit} className="btn-primary flex-1">Confirm</button>
            <button onClick={() => setAction(null)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
