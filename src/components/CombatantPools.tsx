/* CombatantPools — pip-track spend/restore UI for per-combatant resource pools,
   spell slots, and pact slots (INCOMING #19, mig. 064).
   Used by both the DM combatant card (EncounterView) and the player's CombatCard
   (PlayerEncounterView). Mirrors DeathSaveTrack conventions. */
import type { CombatantResponse } from "../api/types";
import { ResourceRecharge, RestKind } from "../api/types";
import "./CombatantPools.css";

export interface CombatantPoolsProps {
  combatant: CombatantResponse;
  disabled: boolean;       // true while a mutation is in-flight (parent busy flag)
  interactive: boolean;    // false = display-only (ended encounters / other players)
  onSetResource: (resourceKey: string, remaining: number) => void;
  onSetSlot: (level: number, isPact: boolean, remaining: number) => void;
  onRest: (kind: RestKind) => void;
}

// Recharge label for the tooltip — omit the clause when recharge is None.
function rechargeLabel(recharge: number): string {
  if (recharge === ResourceRecharge.ShortRest) return "short rest";
  if (recharge === ResourceRecharge.LongRest) return "long rest";
  return "";
}

// Render a row of filled (●) and empty (○) pips, or a "remaining/max" text
// fallback when max > 8 (defensive against homebrew with large pools).
function PipTrack({
  remaining,
  max,
  disabled,
  interactive,
  onMinus,
  onPlus,
}: {
  remaining: number;
  max: number;
  disabled: boolean;
  interactive: boolean;
  onMinus: () => void;
  onPlus: () => void;
}) {
  const usePips = max <= 8;
  return (
    <span className="cpools__pip-group">
      {interactive && (
        <button
          type="button"
          className="cpools__adj cpools__adj--minus"
          disabled={disabled || remaining <= 0}
          onClick={onMinus}
          aria-label="Spend one"
        >
          −
        </button>
      )}
      {usePips ? (
        <span className="cpools__pips" aria-label={`${remaining} of ${max}`}>
          {Array.from({ length: max }, (_, i) => (
            <span
              key={i}
              className={`cpools__pip${i < remaining ? " cpools__pip--on" : ""}`}
              aria-hidden="true"
            />
          ))}
        </span>
      ) : (
        <span className="cpools__count">
          {remaining}/{max}
        </span>
      )}
      {interactive && (
        <button
          type="button"
          className="cpools__adj cpools__adj--plus"
          disabled={disabled || remaining >= max}
          onClick={onPlus}
          aria-label="Restore one"
        >
          +
        </button>
      )}
    </span>
  );
}

export default function CombatantPools({
  combatant,
  disabled,
  interactive,
  onSetResource,
  onSetSlot,
  onRest,
}: CombatantPoolsProps) {
  const { resources, spellSlots, pactSlot } = combatant;

  // Render nothing when the combatant has no pools at all.
  if (!resources?.length && !spellSlots?.length && !pactSlot) return null;

  return (
    <div className="cpools">
      {/* ---- Class resources ---- */}
      {resources?.map((r) => {
        const rechargeTxt = rechargeLabel(r.recharge);
        const tip = [
          `${r.remaining}/${r.max}`,
          r.name,
          r.source,
          rechargeTxt ? `recharges on ${rechargeTxt}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <div
            key={r.resourceKey}
            className="cpools__res-row tip"
            data-tooltip={tip}
          >
            <span className="cpools__label">{r.name}</span>
            <PipTrack
              remaining={r.remaining}
              max={r.max}
              disabled={disabled}
              interactive={interactive}
              onMinus={() => onSetResource(r.resourceKey, r.remaining - 1)}
              onPlus={() => onSetResource(r.resourceKey, r.remaining + 1)}
            />
          </div>
        );
      })}

      {/* ---- Standard spell slots ---- */}
      {spellSlots?.map((s) => (
        <div
          key={`slot-${s.level}`}
          className="cpools__slot-row tip"
          data-tooltip={`${s.remaining}/${s.max} level ${s.level} spell slots`}
        >
          <span className="cpools__label">L{s.level}</span>
          <PipTrack
            remaining={s.remaining}
            max={s.max}
            disabled={disabled}
            interactive={interactive}
            onMinus={() => onSetSlot(s.level, false, s.remaining - 1)}
            onPlus={() => onSetSlot(s.level, false, s.remaining + 1)}
          />
        </div>
      ))}

      {/* ---- Warlock pact slot ---- */}
      {pactSlot && (
        <div
          className="cpools__slot-row cpools__slot-row--pact tip"
          data-tooltip={`${pactSlot.remaining}/${pactSlot.max} pact slots (level ${pactSlot.level}) · recharges on short rest`}
        >
          <span className="cpools__label cpools__label--pact">
            Pact L{pactSlot.level}
          </span>
          <PipTrack
            remaining={pactSlot.remaining}
            max={pactSlot.max}
            disabled={disabled}
            interactive={interactive}
            onMinus={() => onSetSlot(pactSlot.level, true, pactSlot.remaining - 1)}
            onPlus={() => onSetSlot(pactSlot.level, true, pactSlot.remaining + 1)}
          />
        </div>
      )}

      {/* ---- Rest buttons (interactive mode only) ---- */}
      {interactive && (
        <div className="cpools__rest-row">
          <button
            type="button"
            className="btn cpools__rest-btn tip"
            disabled={disabled}
            onClick={() => onRest(RestKind.Short)}
            data-tooltip="Short Rest: restores short-rest resources and pact slots"
          >
            Short Rest
          </button>
          <button
            type="button"
            className="btn cpools__rest-btn tip"
            disabled={disabled}
            onClick={() => onRest(RestKind.Long)}
            data-tooltip="Long Rest: restores all resources and all spell slots"
          >
            Long Rest
          </button>
        </div>
      )}
    </div>
  );
}
