import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '@/lib/db';
import { Search } from 'lucide-react';
import ParkingPanel from '@/components/ParkingPanel';

export default function Parking() {
  const buildings = useLiveQuery(() => db.buildings.toArray(), []) ?? [];
  const flats = useLiveQuery(() => db.flats.toArray(), []) ?? [];
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [buildingFilter, setBuildingFilter] = useState<number | 'all'>('all');
  const [flatFilter, setFlatFilter] = useState<number | 'all'>('all');

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) setQuery(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildingName = (id: number) => buildings.find((b) => b.id === id)?.name ?? '—';
  const flatsInScope = buildingFilter === 'all' ? flats : flats.filter((f) => f.buildingId === buildingFilter);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="relative w-full sm:max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search space number..." className="input pl-9" />
        </div>
        <select className="input sm:w-48" value={buildingFilter}
          onChange={(e) => { setBuildingFilter(e.target.value === 'all' ? 'all' : Number(e.target.value)); setFlatFilter('all'); }}>
          <option value="all">All Buildings</option>
          {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select className="input sm:w-48" value={flatFilter} onChange={(e) => setFlatFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}>
          <option value="all">All Flats</option>
          {flatsInScope.map((f) => <option key={f.id} value={f.id}>{buildingName(f.buildingId)} · {f.unitNo}</option>)}
        </select>
      </div>

      <ParkingPanel buildings={buildings} flats={flats} buildingFilter={buildingFilter} flatFilter={flatFilter} query={query} />
    </div>
  );
}
