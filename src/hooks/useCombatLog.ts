/* ============================================================================
   Combat-log state for one encounter (DM-only, Phase 1). Owns the newest-first
   entry list, backward pagination cursor, the manual-note POST, and a stable
   `appendEntry` for live `CombatLogAppended` hub pushes. EncounterView wires
   `appendEntry` into useEncounterHub so live events prepend here.

   Entries are newest-first: live/new entries prepend; older pages append. The
   backend renders each entry's message — we never compose log text client-side.
   ========================================================================== */
import { useCallback, useEffect, useState } from "react";
import { campaigns } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { CombatLogEntryResponse } from "../api/types";

export interface UseCombatLog {
  entries: CombatLogEntryResponse[];
  loading: boolean;
  loadingOlder: boolean;
  error: string | null;
  hasMore: boolean;
  loadOlder: () => void;
  addNote: (message: string) => Promise<void>;
  deleteEntry: (seq: number) => Promise<void>;
  appendEntry: (entry: CombatLogEntryResponse) => void;
  removeEntry: (seq: number) => void;
}

export function useCombatLog(
  campaignId: string,
  encounterId: string,
  enabled: boolean,
): UseCombatLog {
  const [entries, setEntries] = useState<CombatLogEntryResponse[]>([]);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prepend a new entry, de-duping by seq — the note POST returns the entry AND
  // the server broadcasts the same one over the hub, so both paths land here.
  const appendEntry = useCallback((entry: CombatLogEntryResponse) => {
    setEntries((prev) =>
      prev.some((e) => e.seq === entry.seq) ? prev : [entry, ...prev],
    );
  }, []);

  // Drop an entry by seq (local removal + future CombatLogRemoved hub push).
  const removeEntry = useCallback((seq: number) => {
    setEntries((prev) => prev.filter((e) => e.seq !== seq));
  }, []);

  // Initial page whenever the encounter (or enablement) changes. When disabled we
  // simply don't fetch; the returned `entries` are masked to [] during render
  // (deriving the empty state rather than resetting it in this effect).
  useEffect(() => {
    if (!enabled || !encounterId) return;
    let cancelled = false;
    campaigns
      .getLog(campaignId, encounterId)
      .then((page) => {
        if (cancelled) return;
        setError(null);
        setEntries(page.entries);
        setNextBefore(page.nextBefore);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof ApiError ? err.message : "Failed to load the combat log.",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaignId, encounterId, enabled]);

  const loadOlder = useCallback(() => {
    if (nextBefore == null) return;
    setLoadingOlder(true);
    setError(null);
    campaigns
      .getLog(campaignId, encounterId, nextBefore)
      .then((page) => {
        setEntries((prev) => [...prev, ...page.entries]);
        setNextBefore(page.nextBefore);
      })
      .catch((err: unknown) =>
        setError(
          err instanceof ApiError ? err.message : "Failed to load older entries.",
        ),
      )
      .finally(() => setLoadingOlder(false));
  }, [campaignId, encounterId, nextBefore]);

  const addNote = useCallback(
    async (message: string) => {
      const entry = await campaigns.addLogNote(campaignId, encounterId, {
        message,
      });
      appendEntry(entry);
    },
    [campaignId, encounterId, appendEntry],
  );

  const deleteEntry = useCallback(
    async (seq: number) => {
      await campaigns.deleteLogEntry(campaignId, encounterId, seq);
      removeEntry(seq);
    },
    [campaignId, encounterId, removeEntry],
  );

  return {
    entries: enabled ? entries : [],
    loading,
    loadingOlder,
    error,
    hasMore: nextBefore != null,
    loadOlder,
    addNote,
    deleteEntry,
    appendEntry,
    removeEntry,
  };
}
