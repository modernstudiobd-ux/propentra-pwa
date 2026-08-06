import { useState } from 'react';
import { Check, X } from 'lucide-react';

export default function PaymentMethodSelect({
  value, onChange, methods, onAddCustom,
}: {
  value: string;
  onChange: (v: string) => void;
  methods: string[];
  /** Called when the person types a brand-new method name, so the caller can remember it in Settings. */
  onAddCustom?: (name: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');

  function confirm() {
    const name = custom.trim();
    if (!name) { setAdding(false); return; }
    onChange(name);
    onAddCustom?.(name);
    setAdding(false);
    setCustom('');
  }

  if (adding) {
    return (
      <div className="flex gap-2">
        <input
          autoFocus
          className="input"
          placeholder="New payment method name"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); confirm(); }
            if (e.key === 'Escape') setAdding(false);
          }}
        />
        <button type="button" onClick={confirm} className="icon-btn text-emerald-500 shrink-0"><Check size={16} /></button>
        <button type="button" onClick={() => setAdding(false)} className="icon-btn text-gray-400 shrink-0"><X size={16} /></button>
      </div>
    );
  }

  return (
    <select
      className="input"
      value={value}
      onChange={(e) => (e.target.value === '__custom__' ? setAdding(true) : onChange(e.target.value))}
    >
      {methods.map((m) => <option key={m} value={m}>{m}</option>)}
      <option value="__custom__">+ Add new method…</option>
    </select>
  );
}
