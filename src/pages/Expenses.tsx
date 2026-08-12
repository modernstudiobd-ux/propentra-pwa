import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { money, dateLabel } from '@/lib/format';
import { Plus, Pencil, Trash2, Search, Receipt } from 'lucide-react';
import Modal from '@/components/Modal';
import { validateImageFile, fileToBase64 } from '@/lib/fileValidation';
import { EXPENSE_CATEGORIES } from '@/types';
import type { Expense } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

const emptyForm = (buildingId: number): Expense => ({
  buildingId, flatId: undefined, category: EXPENSE_CATEGORIES[0], amount: 0, vendor: '', date: todayISO(), notes: '',
});

export default function Expenses() {
  const expenses = useLiveQuery(() => db.expenses.orderBy('id').reverse().toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];

  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Expense>(emptyForm(buildings[0]?.id ?? 0));
  const [receiptErr, setReceiptErr] = useState<string | null>(null);

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const flatLabel = (id?: number) => (id ? flats.find((f) => f.id === id)?.unitNo : null);
  const buildingFlats = flats.filter((f) => f.buildingId === form.buildingId);

  const filtered = expenses.filter((e) =>
    (buildingFilter === 'all' || e.buildingId === buildingFilter) &&
    (categoryFilter === 'all' || e.category === categoryFilter) &&
    (e.vendor ?? '').toLowerCase().includes(query.toLowerCase())
  );
  const total = filtered.reduce((s, e) => s + e.amount, 0);

  const byCategory = new Map<string, number>();
  filtered.forEach((e) => byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount));

  function openAdd() { setForm(emptyForm(buildings[0]?.id ?? 0)); setReceiptErr(null); setOpen(true); }
  function openEdit(e: Expense) { setForm(e); setReceiptErr(null); setOpen(true); }

  async function onReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateImageFile(file);
    if (err) { setReceiptErr(err); return; }
    setReceiptErr(null);
    const data = await fileToBase64(file);
    setForm((f) => ({ ...f, receiptImage: data }));
  }

  async function save() {
    if (!form.buildingId || !form.amount || form.amount <= 0) return;
    if (form.id) await db.expenses.update(form.id, form);
    else await db.expenses.add(form);
    setOpen(false);
  }

  async function remove(id?: number) {
    if (!id) return;
    if (!confirm('Delete this expense record?')) return;
    await db.expenses.delete(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto flex-wrap">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search vendor..." className="input pl-9" />
          </div>
          <select className="input sm:w-44" value={buildingFilter} onChange={(e) => setBuildingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All Buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className="input sm:w-44" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 justify-center shrink-0" disabled={buildings.length === 0}>
          <Plus size={16} /> Add Expense
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card p-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-red-50">
            <Receipt size={20} className="text-red-500" />
          </div>
          <div>
            <div className="text-xs text-gray-500">Total (filtered)</div>
            <div className="text-lg font-semibold text-gray-800">{money(total)}</div>
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 mb-2">By Category</div>
          <div className="space-y-1 max-h-16 overflow-y-auto">
            {Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([cat, amt]) => (
              <div key={cat} className="flex justify-between text-xs"><span className="text-gray-500">{cat}</span><span className="text-gray-700 font-medium">{money(amt)}</span></div>
            ))}
            {byCategory.size === 0 && <div className="text-xs text-gray-400">No expenses yet</div>}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden divide-y divide-gray-100">
        {filtered.map((e) => (
          <div key={e.id} className="p-4 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-gray-800">{e.category}</span>
                {e.vendor && <span className="text-xs text-gray-400">· {e.vendor}</span>}
                {e.receiptImage && <Receipt size={12} className="text-gray-300" />}
              </div>
              <div className="text-xs text-gray-400 mt-0.5">
                {buildingName(e.buildingId)}{flatLabel(e.flatId) ? ` · Flat ${flatLabel(e.flatId)}` : ''} · {dateLabel(e.date)}
              </div>
              {e.notes && <div className="text-xs text-gray-500 mt-1">{e.notes}</div>}
            </div>
            <div className="flex items-center shrink-0 gap-2">
              <span className="text-sm font-semibold text-gray-800">{money(e.amount)}</span>
              <button onClick={() => openEdit(e)} className="icon-btn text-brand-500"><Pencil size={16} /></button>
              <button onClick={() => remove(e.id)} className="icon-btn text-red-400"><Trash2 size={16} /></button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No expenses found</div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={form.id ? 'Edit Expense' : 'Add Expense'}>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Building</label>
              <select className="input" value={form.buildingId} onChange={(e) => setForm({ ...form, buildingId: Number(e.target.value), flatId: undefined })}>
                {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></div>
            <div><label className="label">Flat (optional)</label>
              <select className="input" value={form.flatId ?? ''} onChange={(e) => setForm({ ...form, flatId: e.target.value ? Number(e.target.value) : undefined })}>
                <option value="">Building-wide</option>
                {buildingFlats.map((f) => <option key={f.id} value={f.id}>{f.unitNo}</option>)}
              </select></div>
          </div>
          <div><label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Amount *</label>
              <input type="number" className="input" value={form.amount || ''} placeholder="0" onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} /></div>
            <div><label className="label">Date</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
          </div>
          <div><label className="label">Vendor (optional)</label>
            <input className="input" value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} /></div>
          <div><label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div>
            <label className="label">Receipt / Invoice Photo (optional)</label>
            <div className="flex items-center gap-3">
              {form.receiptImage && (
                <img src={form.receiptImage} className="w-14 h-14 rounded-lg object-cover border border-gray-200" />
              )}
              <label className="btn-secondary cursor-pointer text-sm">
                {form.receiptImage ? 'Replace' : 'Upload'}
                <input type="file" accept="image/*" className="hidden" onChange={onReceiptChange} />
              </label>
              {form.receiptImage && (
                <button type="button" onClick={() => setForm({ ...form, receiptImage: undefined })} className="text-xs text-red-400 hover:text-red-600">Remove</button>
              )}
            </div>
            {receiptErr && <div className="text-xs text-red-500 mt-1">{receiptErr}</div>}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
