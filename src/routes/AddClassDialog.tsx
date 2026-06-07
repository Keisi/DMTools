import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { characters, reference } from "../api/endpoints";
import { ApiError } from "../api/client";
import { characterResponseToRequest } from "../api/characterRequest";
import {
  type BackgroundResponse,
  type CharacterResponse,
  type ClassResponse,
} from "../api/types";
import { MAX_TOTAL_LEVEL } from "./CharacterBuilder.steps";
import "./AddClassDialog.css";

/**
 * Adds a new class to an existing character (multiclass) from the sheet. The
 * level-up engine can't take the first level of a class the character doesn't
 * have, so this goes through the supported PUT path: rebuild the full
 * CharacterRequest from the response (characterResponseToRequest, lossless),
 * append the picked class at level 1, and characters.update(). The new class
 * can then be advanced normally via Level Up. On success the updated character
 * is handed back so the sheet re-renders in place.
 */
export default function AddClassDialog({
  character,
  onClose,
  onApplied,
}: {
  character: CharacterResponse;
  onClose: () => void;
  onApplied: (updated: CharacterResponse) => void;
}) {
  const [classes, setClasses] = useState<ClassResponse[]>([]);
  const [backgrounds, setBackgrounds] = useState<BackgroundResponse[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reference.classes().then(setClasses).catch(() => setClasses([]));
    reference.backgrounds().then(setBackgrounds).catch(() => setBackgrounds([]));
  }, []);

  // Close on Escape (mirrors LevelUpDialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const atCap = character.level >= MAX_TOTAL_LEVEL;
  const available = useMemo(() => {
    const taken = new Set(character.classes.map((c) => c.classId));
    return classes.filter((c) => !taken.has(c.id));
  }, [classes, character.classes]);

  async function add() {
    if (!selectedId || busy || atCap) return;
    setBusy(true);
    setError(null);
    try {
      const req = characterResponseToRequest(character, backgrounds);
      req.classes = [...req.classes, { classId: selectedId, level: 1 }];
      // Now multiclassed: the existing class stays the starting class (maxed first
      // hit die + save proficiencies); the new class is a level-1 dip.
      req.startingClassId =
        req.startingClassId ??
        character.startingClassId ??
        character.classes[0]?.classId ??
        undefined;
      const updated = await characters.update(character.id, req);
      onApplied(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? formatApiError(err)
          : "Could not reach the server.",
      );
      setBusy(false);
    }
  }

  return createPortal(
    <div className="acd-backdrop" onClick={onClose}>
      <div
        className="acd panel anim-pop-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Add a class"
      >
        <header className="acd__head">
          <h2>Multiclass</h2>
          <button className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="text-muted acd__hint">
          Add a new class at level 1 (total level {character.level}/
          {MAX_TOTAL_LEVEL}). 5e requires a 13+ in both your current class's and
          the new class's key abilities to multiclass — double-check your scores.
          After adding, advance the class with <strong>Level Up</strong>.
        </p>

        {error && <p className="acd__error">{error}</p>}

        {atCap ? (
          <p className="text-faint">
            At the level cap ({MAX_TOTAL_LEVEL}) — you can't add another class.
          </p>
        ) : available.length === 0 ? (
          <p className="text-faint">
            {classes.length === 0
              ? "Loading classes…"
              : "This character already has every available class."}
          </p>
        ) : (
          <div className="acd__picks">
            {available.map((c) => (
              <button
                key={c.id}
                type="button"
                className={
                  "acd__pick" + (c.id === selectedId ? " acd__pick--on" : "")
                }
                onClick={() => setSelectedId(c.id)}
              >
                <span className="acd__pick-name">{c.name}</span>
                {c.description && (
                  <span className="acd__pick-desc text-faint">
                    {c.description}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        <div className="acd__actions">
          <button
            className="btn btn--primary"
            disabled={!selectedId || busy || atCap}
            onClick={add}
          >
            {busy ? "Adding…" : "Add Class"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Surface ASP.NET problem-details field errors (e.g. multiclass prerequisite),
// not just the title — same shape the builder handles.
function formatApiError(err: ApiError): string {
  const body = err.body as { errors?: Record<string, string[]> } | undefined;
  const fieldMsgs = body?.errors ? Object.values(body.errors).flat() : [];
  return fieldMsgs.length
    ? `${err.status}: ${fieldMsgs.join("; ")}`
    : `${err.status}: ${err.message}`;
}
