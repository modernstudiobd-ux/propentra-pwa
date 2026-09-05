import type { Building, Flat, ParkingSpace, Resident } from '@/types';
import { roleLabel } from '@/lib/roles';

export type SearchResultType = 'person' | 'flat' | 'parking' | 'storage';

export interface SearchResult {
  type: SearchResultType;
  id: number;
  label: string; // primary line (name / unit no / space number)
  sublabel: string; // secondary line (flat/property context)
  to: string; // route to navigate to on click
}

/**
 * Client-side global search across the entities the person actually manages
 * day to day. Kept intentionally simple (substring match on a handful of
 * fields) since everything already lives in memory via useLiveQuery - no
 * new indexes or schema changes needed.
 */
export function globalSearch(
  term: string,
  data: { residents: Resident[]; flats: Flat[]; buildings: Building[]; parkingSpaces: ParkingSpace[] },
  limitPerType = 5
): SearchResult[] {
  const q = term.trim().toLowerCase();
  if (!q) return [];

  const buildingName = (id?: number) => data.buildings.find((b) => b.id === id)?.name ?? 'Unknown building';
  const flatOf = (id?: number) => data.flats.find((f) => f.id === id);
  const flatLabel = (f?: Flat) => (f ? `${buildingName(f.buildingId)} · ${f.unitNo}` : 'No unit assigned');

  const results: SearchResult[] = [];

  // People - residents and owners are both rows in the same table.
  for (const r of data.residents) {
    if (r.archived) continue;
    const haystack = `${r.name} ${r.email ?? ''} ${r.mobile ?? ''} ${r.displayId ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) continue;
    const flat = flatOf(r.flatId);
    results.push({
      type: 'person',
      id: r.id!,
      label: r.name,
      sublabel: `${roleLabel(r)} · ${flatLabel(flat)}`,
      to: `/residents?q=${encodeURIComponent(r.name)}`,
    });
    if (results.filter((x) => x.type === 'person').length >= limitPerType) break;
  }

  // Flats
  for (const f of data.flats) {
    const haystack = `${f.unitNo} ${f.displayId ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) continue;
    results.push({
      type: 'flat',
      id: f.id!,
      label: f.unitNo,
      sublabel: buildingName(f.buildingId),
      to: `/flats?q=${encodeURIComponent(f.unitNo)}`,
    });
    if (results.filter((x) => x.type === 'flat').length >= limitPerType) break;
  }

  // Parking spaces
  for (const s of data.parkingSpaces) {
    const haystack = `${s.spaceNumber} ${s.displayId ?? ''}`.toLowerCase();
    if (!haystack.includes(q)) continue;
    const flat = flatOf(s.flatId);
    results.push({
      type: 'parking',
      id: s.id!,
      label: s.spaceNumber,
      sublabel: `${buildingName(s.buildingId)}${flat ? ` · ${flat.unitNo}` : ''}`,
      to: `/parking?q=${encodeURIComponent(s.spaceNumber)}`,
    });
    if (results.filter((x) => x.type === 'parking').length >= limitPerType) break;
  }

  // Storage - not a separate table, just flats flagged storageIncluded.
  for (const f of data.flats) {
    if (!f.storageIncluded) continue;
    const haystack = `${f.unitNo} storage`.toLowerCase();
    if (!haystack.includes(q)) continue;
    results.push({
      type: 'storage',
      id: f.id!,
      label: `Storage · ${f.unitNo}`,
      sublabel: buildingName(f.buildingId),
      to: `/storage?q=${encodeURIComponent(f.unitNo)}`,
    });
    if (results.filter((x) => x.type === 'storage').length >= limitPerType) break;
  }

  return results;
}

export const SEARCH_TYPE_LABEL: Record<SearchResultType, string> = {
  person: 'Person',
  flat: 'Flat',
  parking: 'Parking',
  storage: 'Storage',
};
