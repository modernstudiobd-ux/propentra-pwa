import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel,
  requireTypedConfirmation,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** If set, the confirm button stays disabled until the user types this exact word (case-sensitive) into a field first - for irreversible bulk actions where a single click is too easy to hit by accident. */
  requireTypedConfirmation?: string;
}) {
  const [typed, setTyped] = useState('');

  // Reset the typed text every time the dialog is (re)opened, so a
  // previous confirmation can't linger and silently unlock the next one.
  useEffect(() => { if (open) setTyped(''); }, [open]);

  if (!open) return null;
  const locked = !!requireTypedConfirmation;
  const canConfirm = !locked || typed === requireTypedConfirmation;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-xl p-5">
        <div className="flex items-start gap-3">
          <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${danger ? 'bg-red-50 text-red-500' : 'bg-brand-50 text-brand-500'}`}>
            <AlertTriangle size={18} />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-gray-800">{title}</h3>
            <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{message}</p>
          </div>
        </div>
        {locked && (
          <div className="pt-3">
            <label className="label">
              Type <span className="font-mono font-semibold text-gray-700">{requireTypedConfirmation}</span> to confirm
            </label>
            <input
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTypedConfirmation}
              autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && canConfirm) onConfirm(); }}
            />
          </div>
        )}
        <div className="flex gap-2 pt-4">
          <button
            onClick={onConfirm}
            disabled={!canConfirm}
            className={
              danger
                ? `flex-1 rounded-lg text-white text-sm font-medium py-2 transition-colors ${canConfirm ? 'bg-red-500 hover:bg-red-600' : 'bg-red-200 cursor-not-allowed'}`
                : `btn-primary flex-1 ${canConfirm ? '' : 'opacity-50 cursor-not-allowed'}`
            }
          >
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="btn-secondary flex-1">{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
