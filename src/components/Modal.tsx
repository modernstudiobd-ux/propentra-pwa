import { X } from 'lucide-react';
import { ReactNode } from 'react';

const SIZE_CLASSES = { md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' } as const;

export default function Modal({
  open, onClose, title, children, size = 'md',
}: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: keyof typeof SIZE_CLASSES }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className={`bg-white rounded-xl w-full ${SIZE_CLASSES[size]} shadow-xl max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
