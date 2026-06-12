// Generalized drag-to-reorder ordering hook. Persists a block-key order to
// localStorage under `storageKey`, falling back to `allKeys` order, and appends
// any unknown new keys to the end (so a future block added to `allKeys` shows up
// even for a user with a saved order). Extracted from CharacterSheet.tsx's
// `useSheetOrder` (Phase 0 of COMBAT-UX-PLAN) and made key-set-agnostic so the
// player combat view can reuse it with its own key list + storage key.
import { useRef, useState } from "react";

export function useBlockOrder<K extends string>(storageKey: string, allKeys: readonly K[]) {
  const [order, setOrder] = useState<K[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as string[];
        const known = new Set<string>(allKeys);
        const filtered = saved.filter((k): k is K => known.has(k));
        const added = allKeys.filter((k) => !filtered.includes(k));
        return [...filtered, ...added];
      }
    } catch {
      /* corrupt localStorage — ignore */
    }
    return [...allKeys];
  });
  const dragIdx = useRef<number | null>(null);
  function onDragStart(idx: number) {
    dragIdx.current = idx;
  }
  function onDrop(toIdx: number) {
    const from = dragIdx.current;
    dragIdx.current = null;
    if (from === null || from === toIdx) return;
    setOrder((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(toIdx, 0, item);
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* storage full — ignore */
      }
      return next;
    });
  }
  return { order, onDragStart, onDrop };
}
