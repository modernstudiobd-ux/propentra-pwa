import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import { nextDisplayId } from '@/lib/ids';
import { db } from '@/lib/db';
import { validateImageFile, fileToBase64 } from '@/lib/fileValidation';
import { EXPENSE_CATEGORIES } from '@/types';
import type { Expense, Building, Flat } from '@/types';

export default function ExpenseFormModal({
  open, onClose, buildings, flats, initialExpense, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  buildings: Building[];
  flats: Flat[];
  /** Starting values for the form - a blank Expense for "Add", an existing one for "Edit", or a prefilled-but-unsaved one (e.g. from "Add as Expense" on a Maintenance record). */
  initialExpense: Expense;
  /** Called after a successful save with the saved record (including its id), e.g. so a caller can link the new expense back to its source. */
  onSaved?: (expense: Expense & { id: number }) => void;
}) {
  const [form, setForm] = useState<Expense>(initialExpense);
  const [receiptErr, setReceiptErr] = useState<string | null>(null);

  // Re-seed the form every time the modal is (re)opened, mirroring the
  // add/edit-then-open pattern already used across the app (e.g.
  // BulkAddModal resetting on `open`). `initialExpense` is set by the
  // caller in the same event as `open=true`, so this always picks up
  // the intended starting values.
  useEffect(() => {
    if (open) { setForm(initialExpense); setReceiptErr(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const buildingFlats = flats.filter((f) => f.buildingId === form.buildingId);

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
    if (form.id) {
      await db.expenses.update(form.id, form);
      onSaved?.({ ...form, id: form.id });
    } else {
      const displayId = await nextDisplayId('expenses');
      const id = (await db.expenses.add({ ...form, displayId })) as number;
      onSaved?.({ ...form, displayId, id });
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title={form.id ? 'Edit Expense' : 'Add Expense'}>
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
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
        </div>
      </div>
    </Modal>
  );
}
