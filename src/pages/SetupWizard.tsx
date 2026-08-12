import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  Building2, CheckCircle2, ChevronRight, ChevronLeft, Landmark, Home, UserPlus, Wallet, SkipForward,
} from 'lucide-react';
import type { ResidentType } from '@/types';

const CURRENCY_PRESETS = [
  { symbol: '$', name: 'US Dollars' },
  { symbol: '€', name: 'Euros' },
  { symbol: '£', name: 'Pounds' },
  { symbol: '₹', name: 'Rupees' },
  { symbol: '৳', name: 'Taka' },
  { symbol: '¥', name: 'Yen' },
];

const steps = ['Welcome', 'Company', 'Currency', 'Building', 'Flat', 'Resident', 'Done'] as const;

export default function SetupWizard({ onFinish }: { onFinish: () => void }) {
  const settings = useLiveQuery(() => db.settings.toCollection().first(), []);
  const [step, setStep] = useState(0);

  // Company info
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Currency
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [currencyName, setCurrencyName] = useState('US Dollars');
  const [methods, setMethods] = useState<string[]>(['Cash', 'Bank Transfer', 'Card']);
  const [newMethod, setNewMethod] = useState('');

  // Building
  const [buildingName, setBuildingName] = useState('');
  const [buildingAddress, setBuildingAddress] = useState('');
  const [totalFlats, setTotalFlats] = useState(0);
  const [createdBuildingId, setCreatedBuildingId] = useState<number | null>(null);

  // Flat
  const [unitNo, setUnitNo] = useState('');
  const [createdFlatId, setCreatedFlatId] = useState<number | null>(null);

  // Resident
  const [residentName, setResidentName] = useState('');
  const [residentType, setResidentType] = useState<ResidentType>('Tenant');
  const [residentMobile, setResidentMobile] = useState('');

  function next() { setStep((s) => Math.min(s + 1, steps.length - 1)); }
  function back() { setStep((s) => Math.max(s - 1, 0)); }

  function addMethod() {
    const m = newMethod.trim();
    if (!m || methods.some((x) => x.toLowerCase() === m.toLowerCase())) { setNewMethod(''); return; }
    setMethods([...methods, m]);
    setNewMethod('');
  }
  function removeMethod(m: string) {
    setMethods(methods.filter((x) => x !== m));
  }

  async function saveCompanyAndNext() {
    if (settings?.id) {
      await db.settings.put({ ...settings, companyName, address, phone, email });
    }
    next();
  }

  async function saveCurrencyAndNext() {
    if (settings?.id) {
      await db.settings.put({ ...settings, currencySymbol, currencyName, paymentMethods: methods });
    }
    next();
  }

  async function saveBuildingAndNext() {
    if (!buildingName.trim()) { next(); return; }
    const id = await db.buildings.add({ name: buildingName, address: buildingAddress, totalFlats: totalFlats || 0 });
    setCreatedBuildingId(id as number);
    next();
  }

  async function saveFlatAndNext() {
    if (!unitNo.trim() || !createdBuildingId) { next(); return; }
    const id = await db.flats.add({ buildingId: createdBuildingId, unitNo, status: 'vacant' });
    setCreatedFlatId(id as number);
    next();
  }

  async function saveResidentAndNext() {
    if (residentName.trim() && createdFlatId && createdBuildingId) {
      const flat = await db.flats.get(createdFlatId);
      await db.residents.add({
        name: residentName, mobile: residentMobile, email: '',
        flatId: createdFlatId, buildingId: createdBuildingId, unitLabel: flat?.unitNo ?? unitNo, type: residentType,
        status: 'current', moveInDate: new Date().toISOString().slice(0, 10), isBillingContact: true,
      });
      await db.flats.update(createdFlatId, { status: 'occupied' });
    }
    next();
  }

  async function finish() {
    if (settings?.id) await db.settings.put({ ...settings, onboardingComplete: true });
    onFinish();
  }

  async function skipAll() {
    if (settings?.id) await db.settings.put({ ...settings, onboardingComplete: true });
    onFinish();
  }

  if (!settings) return null;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold">B</div>
            <span className="font-display font-bold text-gray-800">BuildingBill Setup</span>
          </div>
          {step > 0 && step < steps.length - 1 && (
            <button onClick={skipAll} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
              <SkipForward size={13} /> Skip setup
            </button>
          )}
        </div>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mb-5">
          {steps.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full flex-1 ${i <= step ? 'bg-brand-500' : 'bg-gray-200'}`} />
          ))}
        </div>

        <div className="card p-6">
          {step === 0 && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-brand-50 text-brand-600 flex items-center justify-center mx-auto">
                <Building2 size={28} />
              </div>
              <h2 className="text-xl font-display font-bold text-gray-800">Welcome to BuildingBill</h2>
              <p className="text-sm text-gray-500">
                Let's get your account set up. This takes about a minute — you can skip any step and fill it in later
                from the sidebar. Everything you enter stays on this device.
              </p>
              <button onClick={next} className="btn-primary w-full flex items-center justify-center gap-1.5">
                Get Started <ChevronRight size={16} />
              </button>
              <button onClick={skipAll} className="text-xs text-gray-400 hover:text-gray-600">Skip setup and explore on my own</button>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <StepHeader icon={Landmark} title="Landlord / Company Information" subtitle="Shown on every invoice and receipt you generate." />
              <div><label className="label">Company, Landlord or Building Manager Name</label>
                <input className="input" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Green Tower Management, or your own name" /></div>
              <div><label className="label">Address</label>
                <textarea className="input" rows={2} value={address} onChange={(e) => setAddress(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Phone</label>
                  <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
                <div><label className="label">Email</label>
                  <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
              </div>
              <StepNav onBack={back} onNext={saveCompanyAndNext} />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <StepHeader icon={Wallet} title="Currency & Payment Methods" subtitle="Used on every amount and every payment form." />
              <div>
                <label className="label">Currency</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {CURRENCY_PRESETS.map((c) => (
                    <button key={c.symbol} type="button" onClick={() => { setCurrencySymbol(c.symbol); setCurrencyName(c.name); }}
                      className={`px-3 py-1.5 rounded-full text-sm border ${currencySymbol === c.symbol ? 'bg-brand-500 text-white border-brand-500' : 'border-gray-200 text-gray-600'}`}>
                      {c.symbol} {c.name}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input className="input" placeholder="Symbol" value={currencySymbol} onChange={(e) => setCurrencySymbol(e.target.value)} />
                  <input className="input" placeholder="Name (for amount in words)" value={currencyName} onChange={(e) => setCurrencyName(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="label">Payment Methods</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {methods.map((m) => (
                    <span key={m} className="inline-flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-full pl-3 pr-2 py-1 text-sm">
                      {m}
                      <button onClick={() => removeMethod(m)} className="text-gray-400 hover:text-red-500">&times;</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="input" placeholder="e.g. Bank Transfer, PayPal, Credit Card..." value={newMethod}
                    onChange={(e) => setNewMethod(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMethod(); } }} />
                  <button onClick={addMethod} className="btn-secondary shrink-0">Add</button>
                </div>
              </div>
              <StepNav onBack={back} onNext={saveCurrencyAndNext} />
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <StepHeader icon={Building2} title="Add Your First Building" subtitle="You can add more anytime from the Buildings page." />
              <div><label className="label">Building Name</label>
                <input className="input" value={buildingName} onChange={(e) => setBuildingName(e.target.value)} placeholder="e.g. Green Tower" /></div>
              <div><label className="label">Address</label>
                <input className="input" value={buildingAddress} onChange={(e) => setBuildingAddress(e.target.value)} /></div>
              <div><label className="label">Total Flats</label>
                <input type="number" className="input" value={totalFlats || ''} placeholder="0" onChange={(e) => setTotalFlats(Number(e.target.value))} /></div>
              <StepNav onBack={back} onNext={saveBuildingAndNext} nextLabel={buildingName.trim() ? 'Save & Continue' : 'Skip'} />
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <StepHeader icon={Home} title="Add Your First Flat" subtitle={createdBuildingId ? `In ${buildingName}` : 'Add a building first to enable this step'} />
              {createdBuildingId ? (
                <div><label className="label">Unit No.</label>
                  <input className="input" value={unitNo} onChange={(e) => setUnitNo(e.target.value)} placeholder="e.g. A-3" /></div>
              ) : (
                <div className="text-sm text-gray-400 py-4 text-center">No building yet — you skipped that step, so this one's skipped too. Add flats later from the Flats page.</div>
              )}
              <StepNav onBack={back} onNext={saveFlatAndNext} nextLabel={unitNo.trim() ? 'Save & Continue' : 'Skip'} disabled={!createdBuildingId} />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <StepHeader icon={UserPlus} title="Add Your First Resident" subtitle={createdFlatId ? `In Flat ${unitNo}` : 'Add a flat first to enable this step'} />
              {createdFlatId ? (
                <>
                  <div><label className="label">Name</label>
                    <input className="input" value={residentName} onChange={(e) => setResidentName(e.target.value)} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Type</label>
                      <select className="input" value={residentType} onChange={(e) => setResidentType(e.target.value as ResidentType)}>
                        <option value="Tenant">Tenant</option>
                        <option value="Owner">Flat Owner</option>
                      </select></div>
                    <div><label className="label">Mobile (optional)</label>
                      <input className="input" value={residentMobile} onChange={(e) => setResidentMobile(e.target.value)} /></div>
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-400 py-4 text-center">No flat yet — this step's skipped too. Add residents later from the Residents page.</div>
              )}
              <StepNav onBack={back} onNext={saveResidentAndNext} nextLabel={residentName.trim() ? 'Save & Continue' : 'Skip'} disabled={!createdFlatId} />
            </div>
          )}

          {step === 6 && (
            <div className="text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={28} />
              </div>
              <h2 className="text-xl font-display font-bold text-gray-800">You're all set!</h2>
              <p className="text-sm text-gray-500">
                {companyName ? `${companyName} is ready to go. ` : ''}
                Head to Bill Generator whenever you're ready to create your first invoice.
              </p>
              <button onClick={finish} className="btn-primary w-full">Go to Dashboard</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StepHeader({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3 mb-2">
      <div className="w-9 h-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
        <Icon size={18} />
      </div>
      <div>
        <h3 className="font-semibold text-gray-800">{title}</h3>
        <p className="text-xs text-gray-400">{subtitle}</p>
      </div>
    </div>
  );
}

function StepNav({ onBack, onNext, nextLabel = 'Continue', disabled }: { onBack: () => void; onNext: () => void; nextLabel?: string; disabled?: boolean }) {
  return (
    <div className="flex gap-2 pt-2">
      <button onClick={onBack} className="btn-secondary flex items-center gap-1"><ChevronLeft size={16} /> Back</button>
      <button onClick={onNext} disabled={disabled} className="btn-primary flex-1 flex items-center justify-center gap-1.5">
        {nextLabel} <ChevronRight size={16} />
      </button>
    </div>
  );
}
