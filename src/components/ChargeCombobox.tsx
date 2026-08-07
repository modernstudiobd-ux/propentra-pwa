import { useEffect, useRef, useState } from 'react';

export const COMMON_CHARGES = [
  'Rent',
  'Electricity',
  'Water',
  'Gas',
  'Heating',
  'Cooling / Air Conditioning',
  'Internet / WiFi',
  'Cable / Satellite TV',
  'Trash / Waste Collection',
  'Sewer',
  'Parking',
  'Security',
  'Cleaning',
  'Elevator / Lift Maintenance',
  'Common Area Maintenance',
  'Building Insurance',
  'Property Tax',
  'HOA / Association Fee',
  'Management Fee',
  'Pest Control',
  'Landscaping / Gardening',
  'Amenity Fee',
  'Storage Fee',
  'Late Fee',
  'Legal Fee',
];

export default function ChargeCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const filtered = COMMON_CHARGES.filter((c) => c.toLowerCase().includes(value.trim().toLowerCase()));

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-[140px]">
      <input
        className="input"
        value={value}
        placeholder="Search or type a charge name..."
        onFocus={() => setOpen(true)}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
          {filtered.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => { onChange(c); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              {c}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
