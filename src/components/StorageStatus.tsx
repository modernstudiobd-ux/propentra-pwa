import { useEffect, useState } from 'react';
import { ShieldCheck, HardDrive } from 'lucide-react';

export default function StorageStatus() {
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    if (navigator.storage?.estimate) {
      navigator.storage.estimate().then((est) => {
        setUsage({ used: est.usage ?? 0, quota: est.quota ?? 0 });
      });
    }
  }, []);

  const pct = usage && usage.quota > 0 ? Math.min(100, (usage.used / usage.quota) * 100) : 0;
  const mb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

  return (
    <div className="p-3 space-y-2 border-t border-white/10">
      <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
        <ShieldCheck size={16} className="text-emerald-400 shrink-0" />
        <div>
          <div className="text-xs font-medium text-gray-100">Offline Mode</div>
          <div className="text-[10px] text-gray-400">Your data is safe on this device</div>
        </div>
      </div>
      {usage && (
        <div className="px-1">
          <div className="flex items-center justify-between text-[10px] text-gray-400 mb-1">
            <span className="flex items-center gap-1"><HardDrive size={11} /> Storage used</span>
            <span>{mb(usage.used)} MB{usage.quota > 0 ? ` / ${(usage.quota / (1024 * 1024 * 1024)).toFixed(1)} GB` : ''}</span>
          </div>
          <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-brand-500 rounded-full" style={{ width: `${Math.max(pct, 1)}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
