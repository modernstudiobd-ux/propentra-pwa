import { useMemo, useState } from 'react';

/**
 * Generic checkbox-selection state for a list page. Selection is keyed by
 * numeric record id and automatically drops ids that disappear from the
 * current (filtered) list - e.g. after a search/filter change or a delete.
 */
export function useBulkSelection<T extends { id?: number }>(items: T[]) {
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const visibleIds = useMemo(() => new Set(items.map((i) => i.id).filter((id): id is number => id !== undefined)), [items]);
  // Only ever expose ids that are still present in the current list.
  const activeSelected = useMemo(() => new Set([...selected].filter((id) => visibleIds.has(id))), [selected, visibleIds]);

  function toggle(id?: number) {
    if (id === undefined) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const allSelected = items.length > 0 && items.every((i) => i.id !== undefined && prev.has(i.id));
      if (allSelected) return new Set();
      return new Set(visibleIds);
    });
  }

  function clear() { setSelected(new Set()); }

  const allSelected = items.length > 0 && items.every((i) => i.id !== undefined && activeSelected.has(i.id));

  return {
    selected: activeSelected,
    isSelected: (id?: number) => id !== undefined && activeSelected.has(id),
    toggle,
    toggleAll,
    clear,
    allSelected,
    count: activeSelected.size,
    selectedIds: () => [...activeSelected],
  };
}
