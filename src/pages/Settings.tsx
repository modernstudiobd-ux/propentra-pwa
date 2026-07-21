import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { CompanySettings } from '@/types';
import { Building2, SlidersHorizontal, FileText, Receipt, Wallet, CreditCard, DatabaseBackup } from 'lucide-react';

const sections = [
  { key: 'company', label: 'Company Info', icon: Building2 },
  { key: 'general', label: 'General Settings', icon: SlidersHorizontal },
  { key: 'invoice', label: 'Invoice Settings', icon: FileText },
  { key: 'receipt', label: 'Receipt Settings', icon: Receipt },
  { key: 'charges', label: 'Charges / Heads', icon: Wallet },
  { key: 'payment', label: 'Payment Methods', icon: CreditCard },
  { key: 'backup', label: 'Backup Reminder', icon: DatabaseBackup },
] as const;

export default function SettingsPage() {
  const settings = useLiveQuery(() => db.settings.toCollection().first(), []);
  const [section, setSection] = useState<typeof sections[number]['key']>('company');
  const [form, setForm] = useState<CompanySettings | null>(null);

  useEffect(() => { if (settings) setForm(settings); }, [settings?.id]);

  async function save() {
    if (!form?.id) return;
    await db.settings.update(form.id, form);
    alert('Settings saved.');
  }

  function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !form) return;
    const reader = new FileReader();
    reader.onload = () => setForm({ ...form, logo: reader.result as string });
    reader.readAsDataURL(file);
  }

  if (!form) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
      <div className="card p-2 h-fit">
        {sections.map((s) => (
          <button key={s.key} onClick={() => setSection(s.key)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium mb-1 ${section === s.key ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-50'}`}>
            <s.icon size={16} /> {s.label}
          </button>
        ))}
      </div>

      <div className="card p-5 md:col-span-3">
        {section === 'company' && (
          <div className="space-y-4 max-w-lg">
            <h3 className="font-semibold text-gray-800">Company Information</h3>
            <div><label className="label">Company / Building Name</label>
              <input className="input" value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} /></div>
            <div><label className="label">Address</label>
              <textarea className="input" rows={2} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Phone</label>
                <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><label className="label">Email</label>
                <input className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            </div>
            <div>
              <label className="label">Logo</label>
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-lg bg-gray-100 flex items-center justify-center overflow-hidden">
                  {form.logo ? <img src={form.logo} className="w-full h-full object-cover" /> : <Building2 className="text-gray-400" />}
                </div>
                <label className="btn-secondary cursor-pointer text-sm">
                  Change Logo
                  <input type="file" accept="image/*" className="hidden" onChange={onLogoChange} />
                </label>
              </div>
              <div className="text-[11px] text-gray-400 mt-1">JPG, PNG (Max 2MB)</div>
            </div>
            <button onClick={save} className="btn-primary">Save Changes</button>
          </div>
        )}

        {section === 'charges' && (
          <div className="space-y-4 max-w-lg">
            <h3 className="font-semibold text-gray-800">Default Charge Rates</h3>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(form.defaultRates).map(([key, value]) => (
                <div key={key}>
                  <label className="label">{key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())}</label>
                  <input type="number" className="input" value={value}
                    onChange={(e) => setForm({ ...form, defaultRates: { ...form.defaultRates, [key]: Number(e.target.value) } })} />
                </div>
              ))}
            </div>
            <button onClick={save} className="btn-primary">Save Changes</button>
          </div>
        )}

        {!['company', 'charges'].includes(section) && (
          <div className="text-sm text-gray-400 py-10 text-center">This section can be customized further as your needs grow.</div>
        )}
      </div>
    </div>
  );
}
