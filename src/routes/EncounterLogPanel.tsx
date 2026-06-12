/* DM combat-log panel: a newest-first timeline of auto-logged encounter events
   plus a manual DM-note composer. Data + pagination + live append come from
   useCombatLog; this component is presentational. DM-only (Phase 1) — only
   mounted in EncounterView's DM render, and the backend log routes are DM-gated. */
import { useState } from "react";
import { ApiError } from "../api/client";
import { CombatEventType } from "../api/types";
import type { CombatLogEntryResponse } from "../api/types";
import type { UseCombatLog } from "../hooks/useCombatLog";
import Modal from "../components/Modal";
import "./EncounterLogPanel.css";

// A glyph per event family — purely decorative; the text is server-rendered.
function eventGlyph(eventType: number): string {
  switch (eventType) {
    case CombatEventType.EncounterStarted:
      return "▶";
    case CombatEventType.EncounterEnded:
      return "■";
    case CombatEventType.TurnChanged:
      return "⏭";
    case CombatEventType.CombatantAdded:
      return "＋";
    case CombatEventType.CombatantRemoved:
      return "－";
    case CombatEventType.InitiativeSet:
      return "🎲";
    case CombatEventType.Damage:
      return "💥";
    case CombatEventType.Heal:
      return "✚";
    case CombatEventType.HpSet:
    case CombatEventType.TempHpSet:
      return "❤";
    case CombatEventType.StatusEffectApplied:
    case CombatEventType.StatusEffectRemoved:
      return "✦";
    case CombatEventType.DmNote:
      return "📝";
    default:
      return "•";
  }
}

// Coarse class for color-coding by family.
function eventKind(eventType: number): string {
  if (eventType === CombatEventType.Damage) return "dmg";
  if (eventType === CombatEventType.Heal) return "heal";
  if (eventType === CombatEventType.DmNote) return "note";
  if (
    eventType === CombatEventType.EncounterStarted ||
    eventType === CombatEventType.EncounterEnded ||
    eventType === CombatEventType.TurnChanged
  )
    return "flow";
  return "default";
}

function LogRow({
  entry,
  onDelete,
}: {
  entry: CombatLogEntryResponse;
  onDelete: (entry: CombatLogEntryResponse) => void;
}) {
  const time = new Date(entry.created).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <li className={`enc-log__entry enc-log__entry--${eventKind(entry.eventType)}`}>
      <span className="enc-log__glyph" aria-hidden="true">
        {eventGlyph(entry.eventType)}
      </span>
      <div className="enc-log__body">
        <span className="enc-log__msg">{entry.message}</span>
        <span className="enc-log__meta">
          Round {entry.roundNumber} · {time}
        </span>
      </div>
      <button
        className="enc-log__del"
        onClick={() => onDelete(entry)}
        title="Delete this entry"
        aria-label="Delete this entry"
      >
        ✕
      </button>
    </li>
  );
}

export default function EncounterLogPanel({ log }: { log: UseCombatLog }) {
  const {
    entries,
    loading,
    loadingOlder,
    error,
    hasMore,
    loadOlder,
    addNote,
    deleteEntry,
  } = log;
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  // Entry awaiting delete confirmation (null = no dialog open).
  const [pendingDelete, setPendingDelete] =
    useState<CombatLogEntryResponse | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function confirmDelete() {
    if (!pendingDelete || deleteBusy) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await deleteEntry(pendingDelete.seq);
      setPendingDelete(null);
    } catch (err) {
      setDeleteError(
        err instanceof ApiError ? err.message : "Failed to delete the entry.",
      );
    }
    setDeleteBusy(false);
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    const message = note.trim();
    if (!message || noteBusy) return;
    setNoteBusy(true);
    setNoteError(null);
    try {
      await addNote(message);
      setNote("");
    } catch (err) {
      setNoteError(
        err instanceof ApiError ? err.message : "Failed to add the note.",
      );
    }
    setNoteBusy(false);
  }

  return (
    <section className="panel enc-log">
      <div className="enc-log__head">
        <h2 className="enc__section-title enc__section-title--inline">
          Combat Log
        </h2>
        <span className="enc-log__hint text-muted">Only you can see this</span>
      </div>

      <form className="enc-log__note" onSubmit={submitNote}>
        <input
          className="input enc-log__note-input"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a DM note…"
          maxLength={400}
          disabled={noteBusy}
          aria-label="Add a DM note"
        />
        <button className="btn" type="submit" disabled={noteBusy || !note.trim()}>
          {noteBusy ? "Adding…" : "Add"}
        </button>
      </form>
      {noteError && <p className="enc__error">{noteError}</p>}
      {error && <p className="enc__error">{error}</p>}

      {loading ? (
        <div className="enc-log__skeleton">
          <div className="skeleton" style={{ height: 40 }} />
          <div className="skeleton" style={{ height: 40, marginTop: 8 }} />
          <div className="skeleton" style={{ height: 40, marginTop: 8 }} />
        </div>
      ) : entries.length === 0 ? (
        <p className="text-muted enc-log__empty">
          No events yet. Actions during combat — and your notes — show up here.
        </p>
      ) : (
        <>
          <ul className="enc-log__list">
            {entries.map((entry) => (
              <LogRow key={entry.seq} entry={entry} onDelete={setPendingDelete} />
            ))}
          </ul>
          {hasMore && (
            <button
              className="btn enc-log__more"
              onClick={loadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? "Loading…" : "Load older"}
            </button>
          )}
        </>
      )}

      {pendingDelete && (
        <Modal
          onClose={() => {
            if (!deleteBusy) {
              setPendingDelete(null);
              setDeleteError(null);
            }
          }}
          ariaLabel="Delete combat-log entry"
          backdropClassName="enc__modal-backdrop"
          className="enc__modal panel"
        >
          <p className="enc__modal-heading">Delete this entry?</p>
          <p className="enc__modal-body enc-log__confirm-msg">
            “{pendingDelete.message}”
          </p>
          {deleteError && <p className="enc__error">{deleteError}</p>}
          <div className="enc__modal-footer">
            <button
              className="btn"
              disabled={deleteBusy}
              onClick={() => {
                setPendingDelete(null);
                setDeleteError(null);
              }}
            >
              Cancel
            </button>
            <button
              className="btn enc__delete-btn"
              disabled={deleteBusy}
              onClick={confirmDelete}
            >
              {deleteBusy ? "Deleting…" : "Delete"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
