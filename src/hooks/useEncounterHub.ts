/* ============================================================================
   SignalR client for the encounter hub. Subscribes to one encounter's group and
   forwards server-pushed state to the caller. The hook owns NO encounter state —
   EncounterView keeps `encounter` as the single source and feeds both the REST
   mutation responses and these hub pushes through the same `applyUpdate` path.

   Hub URL resolves against API_BASE: empty (the dev default) → relative
   `/hubs/encounter`, which hits the Vite proxy (ws:true) → backend :3501. A full
   API_BASE produces an absolute hub URL (backend must allow the origin).

   The JWT cannot ride a WebSocket header, so it's passed as ?access_token= (the
   backend reads it from the query string for hub auth).
   ========================================================================== */
import { useEffect, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { API_BASE, tokenStore } from "../api/client";
import type { EncounterResponse } from "../api/types";

export const HubStatus = {
  Connecting: "connecting",
  Connected: "connected",
  Reconnecting: "reconnecting",
  Disconnected: "disconnected",
} as const;
export type HubStatus = (typeof HubStatus)[keyof typeof HubStatus];

interface UseEncounterHubOptions {
  encounterId: string;
  onUpdated: (enc: EncounterResponse) => void;
  onArchived: (id: string) => void;
  // Defer connecting until the initial REST load resolves (avoids a race where
  // a push arrives before `encounter` is set). Pass false while loading.
  enabled?: boolean;
}

export function useEncounterHub({
  encounterId,
  onUpdated,
  onArchived,
  enabled = true,
}: UseEncounterHubOptions): HubStatus {
  const [status, setStatus] = useState<HubStatus>(HubStatus.Connecting);

  // Hold the callbacks in refs so identity changes (new closures each render)
  // don't tear down and rebuild the connection — only encounterId/enabled do.
  const updatedRef = useRef(onUpdated);
  const archivedRef = useRef(onArchived);
  // Sync in an effect, not during render (react-hooks/refs).
  useEffect(() => {
    updatedRef.current = onUpdated;
    archivedRef.current = onArchived;
  });

  useEffect(() => {
    if (!enabled || !encounterId) return;

    const token = tokenStore.get();
    const hubUrl = `${API_BASE}/hubs/encounter${
      token ? `?access_token=${encodeURIComponent(token)}` : ""
    }`;

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .build();

    connection.on("EncounterUpdated", (enc: EncounterResponse) => {
      updatedRef.current(enc);
    });
    connection.on("EncounterArchived", (id: string) => {
      archivedRef.current(id);
    });

    connection.onreconnecting(() => setStatus(HubStatus.Reconnecting));
    connection.onreconnected(() => {
      // Group membership is lost across a reconnect — re-join.
      connection
        .invoke("JoinEncounter", encounterId)
        .then(() => setStatus(HubStatus.Connected))
        .catch(() => setStatus(HubStatus.Disconnected));
    });
    connection.onclose(() => setStatus(HubStatus.Disconnected));

    let cancelled = false;
    connection
      .start()
      .then(() => connection.invoke("JoinEncounter", encounterId))
      .then(() => {
        if (!cancelled) setStatus(HubStatus.Connected);
      })
      .catch(() => {
        if (!cancelled) setStatus(HubStatus.Disconnected);
      });

    return () => {
      cancelled = true;
      // Best-effort leave + stop; teardown errors are irrelevant.
      connection.invoke("LeaveEncounter", encounterId).catch(() => {});
      connection.stop().catch(() => {});
    };
  }, [encounterId, enabled]);

  return status;
}
