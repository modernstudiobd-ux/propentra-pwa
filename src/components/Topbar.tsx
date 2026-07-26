import { Search, Bell, Menu } from 'lucide-react';

export default function Topbar({ title, onMenu }: { title: string; onMenu: () => void }) {
  return (
    <header className="sticky top-0 z-20 h-16 bg-white border-b border-gray-100 flex items-center gap-3 px-4 md:px-6">
      <button className="md:hidden text-gray-500" onClick={onMenu}><Menu size={22} /></button>
      <h1 className="text-lg font-semibold text-gray-800 shrink-0">{title}</h1>

      <div className="hidden sm:flex flex-1 max-w-md ml-2 relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="w-full bg-gray-50 border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
          placeholder="Search buildings, flats, residents, invoices..."
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button className="text-gray-400 hover:text-gray-600"><Bell size={20} /></button>
        <div className="w-9 h-9 rounded-full bg-brand-500 text-white flex items-center justify-center text-sm font-semibold">
          MS
        </div>
      </div>
    </header>
  );
}
