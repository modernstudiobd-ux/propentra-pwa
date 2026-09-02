import { Trash2, X } from 'lucide-react';

export default function BulkToolbar({
  count, onDelete, onClear, deleteLabel = 'Delete Selected', extra,
}: {
  count: number;
  onDelete: () => void;
  onClear: () => void;
  deleteLabel?: string;
  /** Optional extra action buttons rendered before the delete button (e.g. a bulk-void action). */
  extra?: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 bg-brand-50 border border-brand-100 rounded-lg px-3 py-2 text-sm">
      <span className="font-medium text-brand-700">{count} selected</span>
      <div className="flex items-center gap-2">
        {extra}
        <button onClick={onDelete} className="flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-600 px-2 py-1.5 rounded-md hover:bg-red-50">
          <Trash2 size={14} /> {deleteLabel}
        </button>
        <button onClick={onClear} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-md hover:bg-gray-100">
          <X size={14} /> Clear
        </button>
      </div>
    </div>
  );
}
