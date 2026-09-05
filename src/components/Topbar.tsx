import { useMemo, useState } from 'react';
import { Search, Bell, Menu, Users, Home, SquareParking, Warehouse, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { globalSearch, SEARCH_TYPE_LABEL, type SearchResultType } from '@/lib/search';

const TYPE_ICON: Record<SearchResultType, any> = { person: Users, flat: Home, parking: SquareParking, storage: Warehouse };

export default function Topbar({ title, onMenu }: { title: string; onMenu: () => void }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);

  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const parkingSpaces = useLiveQuery(() => db.parkingSpaces.toArray(), []) ?? [];

  const results = useMemo(
    () => globalSearch(query, { residents, flats, buildings, parkingSpaces }),
    [query, residents, flats, buildings, parkingSpaces]
  );
  const open = focused && query.trim().length > 0;

  function go(to: string) {
    navigate(to);
    setQuery('');
    setFocused(false);
  }

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-xl border-b border-gray-100 flex items-center gap-3 px-4 md:px-6">
      <button className="md:hidden text-gray-500" onClick={onMenu}><Menu size={22} /></button>
      <h1 className="text-lg font-semibold text-gray-800 shrink-0">{title}</h1>

      <div className="hidden sm:block flex-1 max-w-md ml-2 relative">
        {open && <div className="fixed inset-0 z-10" onClick={() => setFocused(false)} />}
        <div className="relative">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            className="w-full bg-gray-100 border border-transparent rounded-full pl-9 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:bg-white focus:border-gray-200 transition-colors"
            placeholder="Search people, flats, parking, storage..."
          />
          {query && (
            <button onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
        {open && (
          <div className="absolute left-0 right-0 mt-2 bg-white rounded-2xl shadow-lg border border-gray-100 z-20 overflow-hidden max-h-96 overflow-y-auto">
            {results.length === 0 ? (
              <div className="px-4 py-6 text-sm text-gray-400 text-center">No matches for "{query}"</div>
            ) : (
              <div className="divide-y divide-gray-50 py-1">
                {results.map((r) => {
                  const Icon = TYPE_ICON[r.type];
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      onClick={() => go(r.to)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50"
                    >
                      <span className="w-8 h-8 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center shrink-0"><Icon size={15} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">{r.label}</span>
                          <span className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold shrink-0">{SEARCH_TYPE_LABEL[r.type]}</span>
                        </span>
                        <span className="block text-xs text-gray-400 truncate">{r.sublabel}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
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
