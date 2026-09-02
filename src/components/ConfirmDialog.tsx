import { AlertTriangle } from 'lucide-react';

export default function ConfirmDialog({
  open, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = true, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
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
        <div className="flex gap-2 pt-4">
          <button onClick={onConfirm} className={danger ? 'flex-1 rounded-lg bg-red-500 hover:bg-red-600 text-white text-sm font-medium py-2 transition-colors' : 'btn-primary flex-1'}>
            {confirmLabel}
          </button>
          <button onClick={onCancel} className="btn-secondary flex-1">{cancelLabel}</button>
        </div>
      </div>
    </div>
  );
}
