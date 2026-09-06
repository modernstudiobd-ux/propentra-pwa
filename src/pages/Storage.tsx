import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '@/lib/db';
import { Search, Warehouse, Layers } from 'lucide-react';
import BulkStorageImportModal from '@/components/BulkStorageImportModal';

export default function Storage() {
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const residents = useLiveQuery(() => db.residents.toArray(), []) ?? [];
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [includedOnly, setIncludedOnly] = useState(true);
  const [bulkOpen, setBulkOpen] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const residentNames = (flatId?: number) => residents.filter((r) => r.flatId === flatId && (r.status ?? 'current') === 'current' && !r.archived).map((r) => r.name).join(', ');

  const filtered = flats.filter((f) =>
    (buildingFilter === 'all' || f.buildingId === buildingFilter) &&
    (!includedOnly || f.storageIncluded) &&
    (!query || `${f.unitNo} ${f.displayId ?? ''}`.toLowerCase().includes(query.toLowerCase()))
  );

  async function toggleStorage(id: number | undefined, value: boolean) {
    if (id === undefined) return;
    await db.flats.update(id, { storageIncluded: value });
  }

  async function commitBulkStorageUpdate(updates: { id: number; storageIncluded: boolean }[]) {
    await db.transaction('rw', [db.flats], async () => {
      for (const u of updates) await db.flats.update(u.id, { storageIncluded: u.storageIncluded });
    });
  }

  const totalWithStorage = flats.filter((f) => f.storageIncluded).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search unit..." className="input pl-9" />
          </div>
          <select className="input sm:w-48" value={buildingFilter}
            onChange={(e) => setBuildingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
            <option value="all">All Buildings</option>
            {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-gray-600 whitespace-nowrap px-1">
            <input type="checkbox" checked={includedOnly} onChange={(e) => setIncludedOnly(e.target.checked)} /> With storage only
          </label>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="text-sm text-gray-500 flex items-center gap-1.5"><Warehouse size={15} /> {totalWithStorage} flat{totalWithStorage === 1 ? '' : 's'} with storage</div>
          <button onClick={() => setBulkOpen(true)} className="btn-secondary flex items-center gap-2 justify-center" disabled={flats.length === 0}>
            <Layers size={16} /> Bulk Import
          </button>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-th">ID</th>
                <th className="table-th">Unit</th>
                <th className="table-th">Building</th>
                <th className="table-th">Occupancy</th>
                <th className="table-th">Resident(s)</th>
                <th className="table-th text-right">Storage Included</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((f) => (
                <tr key={f.id}>
                  <td className="table-td font-mono text-xs text-gray-500">{f.displayId ?? '—'}</td>
                  <td className="table-td font-medium text-gray-800">{f.unitNo}</td>
                  <td className="table-td">{buildingName(f.buildingId)}</td>
                  <td className="table-td">
                    <span className={f.occupancyStatus === 'occupied' ? 'badge-paid' : 'badge-unpaid'}>{f.occupancyStatus}</span>
                  </td>
                  <td className="table-td text-gray-500">{residentNames(f.id) || '—'}</td>
                  <td className="table-td text-right">
                    <label className="inline-flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={!!f.storageIncluded} onChange={(e) => toggleStorage(f.id, e.target.checked)} />
                    </label>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center text-sm text-gray-400 py-8">{includedOnly ? 'No flats with storage yet' : 'No flats found'}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="sm:hidden divide-y divide-gray-100">
          {filtered.map((f) => (
            <div key={f.id} className="p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-gray-400">{f.displayId ?? '—'}</div>
                <div className="font-medium text-gray-800">{f.unitNo}</div>
                <div className="text-sm text-gray-500">{buildingName(f.buildingId)}</div>
                <div className="text-xs text-gray-400 mt-0.5">{residentNames(f.id) || 'Vacant'}</div>
              </div>
              <label className="inline-flex items-center gap-2 shrink-0 text-xs text-gray-500">
                Included
                <input type="checkbox" checked={!!f.storageIncluded} onChange={(e) => toggleStorage(f.id, e.target.checked)} />
              </label>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-8">{includedOnly ? 'No flats with storage yet' : 'No flats found'}</div>
          )}
        </div>

        <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-100">Total: {filtered.length} flat{filtered.length === 1 ? '' : 's'}</div>
      </div>

      <BulkStorageImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        flats={flats}
        buildings={buildings}
        onCommit={commitBulkStorageUpdate}
      />
    </div>
  );
}
