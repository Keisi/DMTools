import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { characters } from "../api/endpoints";
import { ApiError } from "../api/client";
import type { CharacterResponse } from "../api/types";
import "./EditHpDialog.css";

const HP_MIN = 1;
const HP_MAX = 9999;

/**
 * Quick HP-override editor opened from the sheet. Persists via the focused
 * PUT /api/character/{id}/hp endpoint (backend #10): a number sets
 * hitPointsOverride, null clears it (HP reverts to the derived value). Returns
 * the updated character. No whole-character reconstruction, so no wipe risk.
 *
 * HP is normally DERIVED (starting-class die maxed at L1 + average per later
 * level + CON x level + passive effects). An override replaces that fixed max and
 * does NOT track later level/CON changes — hence the warning.
 */
export default function EditHpDialog({
  character,
  onClose,
  onApplied,
}: {
  character: CharacterResponse;
  onClose: () => void;
  onApplied: (updated: CharacterResponse) => void;
}) {
  const { id, derivedMaxHitPoints, hitPointsOverride } = character;
  const [value, setValue] = useState<number | "">(hitPointsOverride ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inRange =
    typeof value === "number" && value >= HP_MIN && value <= HP_MAX;
  const isOverridden = typeof hitPointsOverride === "number";

  async function submit(override: number | null) {
    setBusy(true);
    setError(null);
    try {
      const updated = await characters.updateHp(id, {
        hitPointsOverride: override,
      });
      onApplied(updated);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? `${err.status}: ${err.message}`
          : "Could not reach the server.",
      );
      setBusy(false);
    }
  }

  return createPortal(
    <div className="hp-backdrop" onClick={onClose}>
      <div
        className="hp panel anim-pop-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Edit hit points"
      >
        <header className="hp__head">
          <h2>Edit Hit Points</h2>
          <button className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <p className="text-muted hp__derived">
          Derived max: <strong>{derivedMaxHitPoints}</strong>
          {isOverridden && (
            <span className="text-faint">
              {" "}
              · current override {hitPointsOverride}
            </span>
          )}
        </p>

        <label className="hp__field">
          <span className="hp__label">Override</span>
          <input
            className="input"
            type="number"
            min={HP_MIN}
            max={HP_MAX}
            value={value}
            placeholder={`${derivedMaxHitPoints}`}
            onChange={(e) =>
              setValue(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        </label>

        <p className="text-faint hp__warn">
          ⚠ An override replaces the derived max ({derivedMaxHitPoints}). It won't
          update when you level up or change CON — clear it to return to the
          calculated value.
        </p>

        {error && <p className="hp__error">{error}</p>}

        <div className="hp__actions">
          <button
            className="btn"
            disabled={busy || !isOverridden}
            onClick={() => submit(null)}
            title={
              isOverridden ? "Remove the override" : "No override set"
            }
          >
            Use derived
          </button>
          <button
            className="btn btn--primary"
            disabled={busy || !inRange}
            onClick={() => submit(value as number)}
          >
            {busy ? "Saving..." : "Set override"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
