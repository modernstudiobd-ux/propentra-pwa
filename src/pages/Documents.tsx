import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { dateLabel } from '@/lib/format';
import { validateFileContent } from '@/lib/fileValidation';
import { logAudit } from '@/lib/audit';
import { Plus, Trash2, Search, FolderOpen, Download, AlertTriangle } from 'lucide-react';
import Modal from '@/components/Modal';
import type { DocumentRecord } from '@/types';
import { DOCUMENT_CATEGORIES } from '@/types';

function todayISO() { return new Date().toISOString().slice(0, 10); }

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso).getTime() - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

const emptyForm = (): Partial<DocumentRecord> => ({
  title: '', category: DOCUMENT_CATEGORIES[0], linkType: 'none', linkId: undefined, buildingId: undefined,
  expiryDate: '', notes: '',
});

export default function Documents() {
  const documents = useLiveQuery(() => db.documents.orderBy('id').reverse().toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];

  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<DocumentRecord>>(emptyForm());
  const [fileErr, setFileErr] = useState<string | null>(null);
  const [fileChecking, setFileChecking] = useState(false);
  const [pendingFile, setPendingFile] = useState<{ data: Blob; name: string; type: string; size: number } | null>(null);

  function linkLabel(d: DocumentRecord) {
    if (d.linkType === 'building') return buildings.find((b) => b.id === d.linkId)?.name ?? '—';
    if (d.linkType === 'flat') { const f = flats.find((x) => x.id === d.linkId); const b = buildings.find((x) => x.id === f?.buildingId); return f ? `${b?.name ?? ''} · Flat ${f.unitNo}` : '—'; }
    if (d.linkType === 'resident') return residents.find((r) => r.id === d.linkId)?.name ?? '—';
    return 'Unlinked';
  }

  const filtered = documents.filter((d) =>
    (categoryFilter === 'all' || d.category === categoryFilter) &&
    d.title.toLowerCase().includes(query.toLowerCase())
  );

  function openAdd() { setForm(emptyForm()); setPendingFile(null); setFileErr(null); setOpen(true); }

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileChecking(true);
    try {
      const err = await validateFileContent(file); // size + declared type + actual file-content signature
      if (err) { setFileErr(err); setPendingFile(null); return; }
      setFileErr(null);
      setPendingFile({ data: file, name: file.name, type: file.type, size: file.size });
    } finally {
      setFileChecking(false);
    }
  }

  async function save() {
    if (!form.title?.trim() || !pendingFile) return;
    const newId = await db.documents.add({
      title: form.title.trim(),
      category: form.category || 'Other',
      linkType: form.linkType ?? 'none',
      linkId: form.linkId,
      buildingId: form.linkType === 'building' ? form.linkId
        : form.linkType === 'flat' ? flats.find((f) => f.id === form.linkId)?.buildingId
        : form.linkType === 'resident' ? residents.find((r) => r.id === form.linkId)?.buildingId
        : undefined,
      fileData: pendingFile.data, fileName: pendingFile.name, fileType: pendingFile.type, fileSize: pendingFile.size,
      uploadDate: todayISO(), expiryDate: form.expiryDate || undefined, notes: form.notes,
    });
    await logAudit({
      action: 'document_uploaded', entityType: 'document', entityId: newId as number,
      buildingId: form.linkType === 'building' ? form.linkId
        : form.linkType === 'flat' ? flats.find((f) => f.id === form.linkId)?.buildingId
        : form.linkType === 'resident' ? residents.find((r) => r.id === form.linkId)?.buildingId
        : undefined,
      summary: `Uploaded document "${form.title.trim()}" (${form.category})`,
    });
    setOpen(false);
  }

  async function remove(id?: number) {
    if (!id) return;
    const doc = documents.find((d) => d.id === id);
    if (!confirm('Delete this document?')) return;
    await db.documents.delete(id);
    await logAudit({
      action: 'document_deleted', entityType: 'document', entityId: id,
      buildingId: doc?.buildingId,
      summary: `Deleted document "${doc?.title ?? '#' + id}"`,
    });
  }

  function download(d: DocumentRecord) {
    const url = URL.createObjectURL(d.fileData);
    const a = document.createElement('a');
    a.href = url;
    a.download = d.fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  const linkOptions = form.linkType === 'building' ? buildings.map((b) => ({ id: b.id!, label: b.name }))
    : form.linkType === 'flat' ? flats.map((f) => ({ id: f.id!, label: `${buildings.find((b) => b.id === f.buildingId)?.name ?? ''} · ${f.unitNo}` }))
    : form.linkType === 'resident' ? residents.map((r) => ({ id: r.id!, label: r.name }))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto flex-wrap">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search documents..." className="input pl-9" />
          </div>
          <select className="input sm:w-44" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
            <option value="all">All Categories</option>
            {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2 justify-center shrink-0">
          <Plus size={16} /> Upload Document
        </button>
      </div>

      <div className="card overflow-hidden divide-y divide-gray-100">
        {filtered.map((d) => {
          const expiring = d.expiryDate ? daysUntil(d.expiryDate) : null;
          return (
            <div key={d.id} className="p-4 flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-start gap-3">
                <FolderOpen size={16} className="text-gray-300 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-gray-800">{d.title}</span>
                    <span className="badge-partial">{d.category}</span>
                    {expiring !== null && expiring <= 30 && (
                      <span className={`flex items-center gap-1 ${expiring < 0 ? 'badge-unpaid' : 'badge-partial'}`}>
                        <AlertTriangle size={11} /> {expiring < 0 ? 'Expired' : `Expires in ${expiring}d`}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {linkLabel(d)} · Uploaded {dateLabel(d.uploadDate)}{d.expiryDate ? ` · Expires ${dateLabel(d.expiryDate)}` : ''}
                  </div>
                  {d.notes && <div className="text-xs text-gray-500 mt-1">{d.notes}</div>}
                </div>
              </div>
              <div className="flex items-center shrink-0 gap-1">
                <button onClick={() => download(d)} className="icon-btn text-brand-500"><Download size={16} /></button>
                <button onClick={() => remove(d.id)} className="icon-btn text-red-400"><Trash2 size={16} /></button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="p-8 text-center text-sm text-gray-400">No documents found</div>}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Upload Document">
        <div className="space-y-3">
          <div><label className="label">Title *</label>
            <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Fire Safety Certificate" /></div>
          <div><label className="label">Category</label>
            <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {DOCUMENT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Link To</label>
              <select className="input" value={form.linkType} onChange={(e) => setForm({ ...form, linkType: e.target.value as any, linkId: undefined })}>
                <option value="none">Nothing specific</option>
                <option value="building">A Building</option>
                <option value="flat">A Flat</option>
                <option value="resident">A Resident</option>
              </select></div>
            {form.linkType !== 'none' && (
              <div><label className="label">Select</label>
                <select className="input" value={form.linkId ?? ''} onChange={(e) => setForm({ ...form, linkId: Number(e.target.value) })}>
                  <option value="">Choose...</option>
                  {linkOptions.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select></div>
            )}
          </div>
          <div><label className="label">File *</label>
            <input type="file" className="input" onChange={onFileChange} disabled={fileChecking} />
            {fileChecking && <div className="text-xs text-gray-400 mt-1">Checking file...</div>}
            {fileErr && <div className="text-xs text-red-500 mt-1">{fileErr}</div>}
            {pendingFile && !fileErr && <div className="text-xs text-emerald-600 mt-1">{pendingFile.name} ready to upload.</div>}
          </div>
          <div><label className="label">Expiry Date (optional)</label>
            <input type="date" className="input" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
            <div className="text-[11px] text-gray-400 mt-1">Shows up as a Dashboard alert as it approaches.</div>
          </div>
          <div><label className="label">Notes</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex gap-2 pt-2">
            <button onClick={save} disabled={!form.title?.trim() || !pendingFile} className="btn-primary flex-1">Save</button>
            <button onClick={() => setOpen(false)} className="btn-secondary flex-1">Cancel</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
