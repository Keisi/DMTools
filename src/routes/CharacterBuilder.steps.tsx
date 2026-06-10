/* eslint-disable react-refresh/only-export-components -- this module deliberately co-locates a few wizard constants/helpers with its step components; the rule is a dev-only Fast-Refresh optimisation, not a correctness gate. */
/* ============================================================================
   CharacterBuilder presentational layer — the wizard's step renderers, shared
   constants, and pure helpers. The stateful orchestrator lives in
   CharacterBuilder.tsx and imports from here; this module imports nothing back
   from it (one-directional, no cycle).
   ========================================================================== */
import { useMemo, useState } from "react";
import { ApiError } from "../api/client";
import {
  Alignment,
  SelectionType,
  type ArmorResponse,
  type BackgroundResponse,
  type CharacterClassRequest,
  type ClassResponse,
  type FeatResponse,
  type InventoryItemRequest,
  type ItemResponse,
  type SelectionResponse,
  type StatResponse,
  type WeaponResponse,
} from "../api/types";

export const STEPS = [
  "Race",
  "Class",
  "Abilities",
  "Skills",
  "Choices",
  "Spells",
  "Background",
  "Details",
  "Feats",
  "Equipment",
  "Review",
] as const;
export const MAX_TOTAL_LEVEL = 20;
// Soft advisory threshold: 5e multiclassing into this many classes is unusual and
// mechanically weak (levels spread thin → delayed high-level features). Non-blocking.
export const MULTICLASS_WARN_AT = 3;

// 5e point-buy: 27 points, scores 8–15. Manual mode allows the backend's full 1–30.
export type AbilityMode = "pointbuy" | "manual";
export const POINT_BUDGET = 27;
export const POINT_MIN = 8;
export const POINT_MAX = 15;
// Manual mode's neutral baseline (D&D average, +0 mod) — point-buy stays at POINT_MIN.
export const MANUAL_DEFAULT = 10;
const POINT_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};
export const pointCost = (score: number) => POINT_COST[score] ?? 0;

export type Coins = { cp: number; sp: number; ep: number; gp: number; pp: number };
export const ZERO_COINS: Coins = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };

// Surface ASP.NET problem-details field errors, not just the title.
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    const body = err.body as { errors?: Record<string, string[]> } | undefined;
    const fieldMsgs = body?.errors ? Object.values(body.errors).flat() : [];
    return fieldMsgs.length
      ? `${err.status}: ${fieldMsgs.join("; ")}`
      : `${err.status}: ${err.message}`;
  }
  return "Could not reach the server.";
}

const ALIGNMENTS: { value: Alignment; label: string }[] = [
  { value: Alignment.LawfulGood, label: "Lawful Good" },
  { value: Alignment.NeutralGood, label: "Neutral Good" },
  { value: Alignment.ChaoticGood, label: "Chaotic Good" },
  { value: Alignment.LawfulNeutral, label: "Lawful Neutral" },
  { value: Alignment.TrueNeutral, label: "True Neutral" },
  { value: Alignment.ChaoticNeutral, label: "Chaotic Neutral" },
  { value: Alignment.LawfulEvil, label: "Lawful Evil" },
  { value: Alignment.NeutralEvil, label: "Neutral Evil" },
  { value: Alignment.ChaoticEvil, label: "Chaotic Evil" },
];

// Toggle an id in a string[] respecting an optional max selection count.
export function toggleCapped(
  prev: string[],
  id: string,
  max: number | null | undefined,
): string[] {
  if (prev.includes(id)) return prev.filter((x) => x !== id);
  if (max !== null && max !== undefined && prev.length >= max) return prev;
  return [...prev, id];
}

export function BuilderNav({
  isLast,
  isEdit,
  busy,
  canAdvance,
  canCreate,
  onBack,
  onNext,
  onCreate,
  hideBack,
  backDisabled,
}: {
  isLast: boolean;
  isEdit: boolean;
  busy: boolean;
  canAdvance: boolean;
  canCreate: boolean;
  onBack: () => void;
  onNext: () => void;
  onCreate: () => void;
  hideBack: boolean;
  backDisabled: boolean;
}) {
  const verb = isEdit ? "Save Changes" : "Create Character";
  const busyVerb = isEdit ? "Saving..." : "Creating...";
  return (
    <div className="builder__nav">
      {/* On the first step Back does nothing, so hide it. The empty span keeps
          space-between alignment so the primary action stays on the right. */}
      {hideBack ? (
        <span aria-hidden="true" />
      ) : (
        <button className="btn" disabled={backDisabled} onClick={onBack}>
          Back
        </button>
      )}
      {isLast ? (
        <button
          className="btn btn--primary"
          disabled={!canCreate || busy}
          onClick={onCreate}
        >
          {busy ? busyVerb : verb}
        </button>
      ) : (
        <button
          className="btn btn--primary"
          disabled={!canAdvance}
          onClick={onNext}
        >
          Next
        </button>
      )}
    </div>
  );
}

export function PickList({
  label,
  items,
  selectedId,
  onPick,
}: {
  label: string;
  items: { id: string; name: string; description?: string | null }[];
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  if (items.length === 0)
    return <p className="text-faint">No {label}s loaded (is the API running?).</p>;
  return (
    <div className="builder__picks">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          className={
            "builder__pick" +
            (it.id === selectedId ? " builder__pick--selected" : "")
          }
          onClick={() => onPick(it.id)}
        >
          <span className="builder__pick-name">{it.name}</span>
          {it.description && (
            <span className="builder__pick-desc text-faint">
              {it.description}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

export function BuilderDetails({
  name,
  onName,
  age,
  onAge,
  alignment,
  onAlignment,
}: {
  name: string;
  onName: (v: string) => void;
  age: number;
  onAge: (v: number) => void;
  alignment: Alignment;
  onAlignment: (v: Alignment) => void;
}) {
  return (
    <div className="builder__details">
      <input
        className="input"
        placeholder="Character name"
        value={name}
        onChange={(e) => onName(e.target.value)}
      />
      <input
        className="input builder__age"
        type="number"
        min={0}
        placeholder="Age"
        value={age || ""}
        onChange={(e) => onAge(Math.max(0, Number(e.target.value) || 0))}
      />
      <select
        className="input"
        value={alignment}
        onChange={(e) => onAlignment(Number(e.target.value) as Alignment)}
      >
        {ALIGNMENTS.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function StepNav({
  current,
  valid,
  onGo,
}: {
  current: number;
  valid: boolean[];
  onGo: (step: number) => void;
}) {
  return (
    <ol className="builder__steps">
      {STEPS.map((s, i) => {
        const done = valid[i] && i < current; // a prior step that actually passes
        const skipped = !valid[i] && i < current; // moved past, still incomplete
        return (
          <li
            key={s}
            className={
              "builder__step" +
              (i === current ? " builder__step--active" : "") +
              (done ? " builder__step--done" : "") +
              (skipped ? " builder__step--todo" : "")
            }
            onClick={() => onGo(i)}
          >
            <span className="builder__step-num">{i + 1}</span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}

export function ClassStep({
  classes,
  picks,
  totalLevel,
  startingClassId,
  onAdd,
  onLevel,
  onRemove,
  onSetStart,
  onSetSubclass,
  subclassSelectionFor,
}: {
  classes: ClassResponse[];
  picks: CharacterClassRequest[];
  totalLevel: number;
  startingClassId: string | null;
  onAdd: (id: string) => void;
  onLevel: (id: string, level: number) => void;
  onRemove: (id: string) => void;
  onSetStart: (id: string) => void;
  onSetSubclass: (id: string, subclassId: string | null) => void;
  subclassSelectionFor: (id: string) => SelectionResponse | null;
}) {
  const added = new Set(picks.map((p) => p.classId));
  const available = classes.filter((c) => !added.has(c.id));
  return (
    <>
      <p className="text-muted builder__hint">
        Add one or more classes (total level ≤ {MAX_TOTAL_LEVEL}). The{" "}
        <strong>starting class</strong> grants saving-throw proficiencies and the
        maxed first hit die. A <strong>subclass</strong> can be chosen once a class
        reaches its subclass level.
      </p>
      {picks.length > 0 && (
        <ul className="builder__classlist">
          {picks.map((p) => {
            const cls = classes.find((c) => c.id === p.classId);
            const subSel = subclassSelectionFor(p.classId);
            const subclassEligible = !!subSel && p.level >= subSel.level;
            return (
              <li key={p.classId} className="builder__classrow">
                <label className="builder__startradio">
                  <input
                    type="radio"
                    name="startclass"
                    checked={startingClassId === p.classId}
                    onChange={() => onSetStart(p.classId)}
                  />
                  start
                </label>
                <span className="builder__classrow-name">{cls?.name ?? "?"}</span>
                {subSel &&
                  (subclassEligible ? (
                    <select
                      className="input builder__subclass"
                      value={p.subclassId ?? ""}
                      onChange={(e) =>
                        onSetSubclass(p.classId, e.target.value || null)
                      }
                    >
                      <option value="">— {subSel.name} —</option>
                      {subSel.options.map((o) => (
                        <option key={o.optionId} value={o.optionId}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-faint builder__subclass-locked">
                      subclass at L{subSel.level}
                    </span>
                  ))}
                <input
                  className="input builder__level"
                  type="number"
                  min={1}
                  max={20}
                  value={p.level}
                  onChange={(e) =>
                    onLevel(p.classId, Number(e.target.value) || 1)
                  }
                />
                <button
                  className="btn btn--ghost"
                  onClick={() => onRemove(p.classId)}
                >
                  remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="text-faint builder__total">
        Total level: {totalLevel}/{MAX_TOTAL_LEVEL}
      </p>
      {picks.length >= MULTICLASS_WARN_AT && (
        <p className="builder__multiclass-warn" role="alert">
          ⚠ {picks.length} classes selected. Multiclassing this widely spreads
          your levels thin — you'll unlock high-level class features much later,
          and most builds use just 1–2 classes. 5e also requires a 13+ in each
          class's key ability to multiclass, so double-check your scores.
        </p>
      )}
      {totalLevel >= MAX_TOTAL_LEVEL ? (
        <p className="text-faint">
          At the level cap — lower a class's level to add another.
        </p>
      ) : (
        <PickList
          label="class"
          items={available}
          selectedId={null}
          onPick={onAdd}
        />
      )}
    </>
  );
}

export function AbilitiesStep({
  mode,
  onMode,
  remaining,
  stats,
  abilities,
  primaryStats,
  onChange,
}: {
  mode: AbilityMode;
  onMode: (m: AbilityMode) => void;
  remaining: number;
  stats: StatResponse[];
  abilities: Record<string, number>;
  primaryStats: Set<string>;
  onChange: (statId: string, value: number) => void;
}) {
  if (stats.length === 0)
    return (
      <p className="text-faint">No default stats loaded (is the API running?).</p>
    );
  return (
    <>
      <div className="builder__abimode">
        <div className="builder__chips">
          <button
            type="button"
            className={"builder__chip" + (mode === "pointbuy" ? " builder__chip--on" : "")}
            onClick={() => onMode("pointbuy")}
          >
            Point Buy
          </button>
          <button
            type="button"
            className={"builder__chip" + (mode === "manual" ? " builder__chip--on" : "")}
            onClick={() => onMode("manual")}
          >
            Manual
          </button>
        </div>
        {mode === "pointbuy" && (
          <span
            className={
              "builder__points" + (remaining < 0 ? " builder__points--over" : "")
            }
          >
            {remaining} / {POINT_BUDGET} points left
          </span>
        )}
        {mode === "manual" && (
          <span className="text-faint builder__abimode-hint">
            Free entry 1–30 (homebrew / rolled stats; no budget).
          </span>
        )}
      </div>

      <div className="builder__abilities">
        {stats.map((s) =>
          mode === "pointbuy" ? (
            <PointBuyStat
              key={s.id}
              name={s.code ?? s.name}
              description={s.description}
              primary={primaryStats.has(s.id)}
              value={abilities[s.id] ?? POINT_MIN}
              remaining={remaining}
              onChange={(v) => onChange(s.id, v)}
            />
          ) : (
            <label key={s.id} className="builder__ability">
              <span
                className={
                  "builder__ability-name" + (s.description ? " tip" : "")
                }
                data-tooltip={s.description ?? undefined}
              >
                {s.code ?? s.name}
                {primaryStats.has(s.id) && <PrimaryTag />}
              </span>
              <input
                className="input"
                type="number"
                min={1}
                max={30}
                value={abilities[s.id] ?? ""}
                placeholder="10"
                onChange={(e) => onChange(s.id, Number(e.target.value))}
              />
            </label>
          ),
        )}
      </div>
    </>
  );
}

function PrimaryTag() {
  return (
    <span
      className="builder__primary-tag tip"
      data-tooltip="Primary ability for the chosen class — prioritise this score."
    >
      primary
    </span>
  );
}

function PointBuyStat({
  name,
  description,
  primary,
  value,
  remaining,
  onChange,
}: {
  name: string;
  description?: string | null;
  primary: boolean;
  value: number;
  remaining: number;
  onChange: (v: number) => void;
}) {
  const nextCost = pointCost(value + 1) - pointCost(value);
  return (
    <div className="builder__ability">
      <span
        className={"builder__ability-name" + (description ? " tip" : "")}
        data-tooltip={description ?? undefined}
      >
        {name}
        {primary && <PrimaryTag />}
      </span>
      <div className="builder__stepper">
        <button
          type="button"
          className="btn"
          disabled={value <= POINT_MIN}
          onClick={() => onChange(value - 1)}
        >
          −
        </button>
        <span className="builder__stepper-val">{value}</span>
        <button
          type="button"
          className="btn"
          disabled={value >= POINT_MAX || nextCost > remaining}
          onClick={() => onChange(value + 1)}
        >
          +
        </button>
      </div>
    </div>
  );
}

export function SkillsStep({
  selection,
  chosen,
  hasClass,
  onToggle,
  abilityFor,
}: {
  selection: SelectionResponse | null;
  chosen: string[];
  hasClass: boolean;
  onToggle: (id: string) => void;
  abilityFor: Map<string, string>;
}) {
  if (!selection || selection.options.length === 0)
    return (
      <p className="text-faint">
        {hasClass
          ? "The starting class defines no skill choices — skip ahead."
          : "Pick a class first to see its skill choices."}
      </p>
    );
  return (
    <>
      <p className="text-muted">
        Choose {selection.choose} skill{selection.choose === 1 ? "" : "s"} (
        {chosen.length}/{selection.choose} selected).
      </p>
      <div className="builder__chips">
        {selection.options.map((o) => {
          const ability = abilityFor.get(o.optionId);
          return (
            <button
              key={o.optionId}
              type="button"
              className={
                "builder__chip" +
                (chosen.includes(o.optionId) ? " builder__chip--on" : "")
              }
              onClick={() => onToggle(o.optionId)}
            >
              {o.name}
              {ability && <span className="text-faint"> ({ability})</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

export function BackgroundStep({
  backgrounds,
  selectedId,
  onPick,
  languageSelection,
  chosenLanguages,
  onToggleLanguage,
  classSkillIds,
  classSkillPool,
  bgSkillSwaps,
  onSwap,
}: {
  backgrounds: BackgroundResponse[];
  selectedId: string | null;
  onPick: (id: string | null) => void;
  languageSelection: SelectionResponse | null;
  chosenLanguages: string[];
  onToggleLanguage: (id: string) => void;
  classSkillIds: string[];
  // Class skill pool options for swap replacements (skills not yet chosen).
  classSkillPool: { optionId: string; name: string }[];
  bgSkillSwaps: Record<string, string>;
  onSwap: (bgSkillId: string, replacementId: string | null) => void;
}) {
  if (backgrounds.length === 0)
    return (
      <p className="text-faint">
        No backgrounds loaded (is the API running?). A background is optional.
      </p>
    );
  const bg = backgrounds.find((b) => b.id === selectedId) ?? null;
  const dupSkills = bg
    ? bg.skills.filter((s) => classSkillIds.includes(s.id))
    : [];
  return (
    <>
      <p className="text-muted builder__hint">
        A background is optional. It grants fixed skill / tool / language
        proficiencies and a feature.
      </p>
      <div className="builder__picks">
        <button
          type="button"
          className={
            "builder__pick" + (selectedId === null ? " builder__pick--selected" : "")
          }
          onClick={() => onPick(null)}
        >
          <span className="builder__pick-name">No background</span>
        </button>
        {backgrounds.map((b) => (
          <button
            key={b.id}
            type="button"
            className={
              "builder__pick" + (b.id === selectedId ? " builder__pick--selected" : "")
            }
            onClick={() => onPick(b.id)}
          >
            <span className="builder__pick-name">{b.name}</span>
            {b.description && (
              <span className="builder__pick-desc text-faint">{b.description}</span>
            )}
          </button>
        ))}
      </div>

      {bg && (
        <div className="builder__bg-detail">
          {(bg.skills.length > 0 ||
            bg.tools.length > 0 ||
            bg.languages.length > 0) && (
            <div className="builder__bg-grants">
              <span className="text-faint">Grants:</span>
              {bg.skills.map((s) => {
                const dup = classSkillIds.includes(s.id);
                return (
                  <span
                    key={`sk-${s.id}`}
                    className={
                      "builder__bg-tag" +
                      (dup ? " builder__bg-tag--dup tip" : "")
                    }
                    data-tooltip={
                      dup
                        ? "Already chosen as a class skill — use the swap picker below to replace it."
                        : undefined
                    }
                  >
                    {dup && "⚠ "}
                    {s.name}
                  </span>
                );
              })}
              {bg.tools.map((t) => (
                <span key={`tl-${t.id}`} className="builder__bg-tag">
                  {t.name}
                </span>
              ))}
              {bg.languages.map((l) => (
                <span key={`ln-${l.id}`} className="builder__bg-tag">
                  {l.name}
                </span>
              ))}
            </div>
          )}
          {dupSkills.length > 0 && (
            <div className="builder__bg-swaps">
              {dupSkills.map((s) => {
                const usedSwaps = new Set(
                  Object.entries(bgSkillSwaps)
                    .filter(([k]) => k !== s.id)
                    .map(([, v]) => v)
                    .filter(Boolean),
                );
                const available = classSkillPool.filter(
                  (o) =>
                    !classSkillIds.includes(o.optionId) &&
                    !usedSwaps.has(o.optionId),
                );
                return (
                  <div key={s.id} className="builder__bg-swap">
                    <span className="builder__bg-swap-label">⚠ {s.name}</span>
                    <select
                      className="input builder__bg-swap-sel"
                      value={bgSkillSwaps[s.id] ?? ""}
                      onChange={(e) => onSwap(s.id, e.target.value || null)}
                    >
                      <option value="">— keep duplicate —</option>
                      {available.map((o) => (
                        <option key={o.optionId} value={o.optionId}>
                          Swap → {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          )}
          {bg.featureName && (
            <p className="text-muted">
              <strong>{bg.featureName}</strong>
              {bg.featureDescription && (
                <span className="text-faint"> — {bg.featureDescription}</span>
              )}
            </p>
          )}
        </div>
      )}

      {languageSelection ? (
        <div className="builder__bg-langs">
          <h4 className="builder__equip-title">
            Languages — choose {languageSelection.choose} (
            {chosenLanguages.length}/{languageSelection.choose})
          </h4>
          <div className="builder__chips">
            {languageSelection.options.map((o) => (
              <button
                key={o.optionId}
                type="button"
                className={
                  "builder__chip" +
                  (chosenLanguages.includes(o.optionId) ? " builder__chip--on" : "")
                }
                onClick={() => onToggleLanguage(o.optionId)}
              >
                {o.name}
              </button>
            ))}
          </div>
        </div>
      ) : !selectedId ? (
        <p className="text-faint builder__hint">
          Some backgrounds grant a language pick — select one above to unlock it.
        </p>
      ) : null}
    </>
  );
}

export function FeatsStep({
  feats,
  chosen,
  onToggle,
}: {
  feats: FeatResponse[];
  chosen: string[];
  onToggle: (id: string) => void;
}) {
  if (feats.length === 0)
    return (
      <p className="text-faint">
        No feats loaded (is the API running?). Feats are optional.
      </p>
    );
  return (
    <>
      <p className="text-muted builder__hint">
        Feats are optional. Normally a feat is taken in place of an ability score
        improvement at level-up, but a DM can grant them freely here.
      </p>
      <div className="builder__picks">
        {feats.map((f) => {
          const mods = f.abilityModifiers
            .map((m) => `${m.stat ?? "ability"} ${m.modifier >= 0 ? "+" : ""}${m.modifier}`)
            .join(", ");
          return (
            <button
              key={f.id}
              type="button"
              className={
                "builder__pick" + (chosen.includes(f.id) ? " builder__pick--selected" : "")
              }
              onClick={() => onToggle(f.id)}
            >
              <span className="builder__pick-name">{f.name}</span>
              {f.prerequisite && (
                <span className="text-faint builder__feat-prereq">
                  Prerequisite: {f.prerequisite}
                </span>
              )}
              {mods && <span className="text-faint">{mods}</span>}
              {f.description && (
                <span className="builder__pick-desc text-faint">
                  {f.description}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}

// Above-L1 ability-score improvements: allocate the ASIs the character earned, kept
// as a separate improvement modifier (base scores stay intact). Free allocation — the
// reference API doesn't expose the per-class ASI schedule, so we guide with a hint and
// cap each stat so base + improvement <= 20 (the backend's effective cap).
export function ImprovementsPanel({
  stats,
  base,
  improvements,
  earned,
  primaryStats,
  onChange,
}: {
  stats: StatResponse[];
  base: Record<string, number>;
  improvements: Record<string, number>;
  earned: number;
  primaryStats: Set<string>;
  onChange: (statId: string, amount: number) => void;
}) {
  const total = Object.values(improvements).reduce((a, b) => a + b, 0);
  const budget = earned * 2; // each ASI = +2 to one or +1 to two
  return (
    <div className="builder__improvements">
      <h4 className="builder__equip-title">Ability Score Improvements</h4>
      <p className="text-faint builder__hint">
        Your classes have earned <strong>{earned}</strong> Ability Score Improvement
        {earned === 1 ? "" : "s"} (levels 4 / 8 / 12 / 16 / 19, plus Fighter 6 / 14 and
        Rogue 10) — up to <strong>{budget}</strong> points (each ASI is +2 to one or +1 to
        two). Prefer a feat instead? Take it in the Feats step. These keep your base scores
        intact ({total}/{budget} allocated).
      </p>
      <div className="builder__abilities">
        {stats.map((s) => {
          const b = base[s.id] ?? 0;
          const inc = improvements[s.id] ?? 0;
          return (
            <div key={s.id} className="builder__ability">
              <span className="builder__ability-name">
                {s.code ?? s.name}
                {primaryStats.has(s.id) && <PrimaryTag />}
              </span>
              <div className="builder__stepper">
                <button
                  type="button"
                  className="btn"
                  disabled={inc <= 0}
                  onClick={() => onChange(s.id, inc - 1)}
                >
                  −
                </button>
                <span className="builder__stepper-val">{b}</span>
                <button
                  type="button"
                  className="btn"
                  disabled={b + inc >= 20 || total >= budget}
                  onClick={() => onChange(s.id, inc + 1)}
                >
                  +
                </button>
              </div>
              {/* Annotation on its own line so the stepper row stays aligned with
                  the untouched stats across the grid (instead of wrapping inside
                  the value and spreading the buttons). */}
              {inc > 0 && (
                <span className="builder__ability-delta">
                  +{inc} = {b + inc}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// A generic "choose N from a set" group — drives the Fighting Style / Expertise /
// Metamagic pickers in the Choices step (and any future sub-feature choice).
export interface ChoiceGroup {
  key: string;
  title: string;
  hint?: string;
  choose: number;
  options: { optionId: string; name: string; description?: string | null }[];
  chosen: string[];
  onToggle: (optionId: string) => void;
  emptyNote?: string;
}

// Sub-feature choices the character's classes/subclasses grant at their chosen levels:
// Fighting Style (incl. a Fighter's L1 style, unreachable via level-up), Rogue/Bard
// Expertise, Sorcerer Metamagic, Warlock Eldritch Invocations. Empty when the build owes none.
export function ChoicesStep({ groups }: { groups: ChoiceGroup[] }) {
  if (groups.length === 0)
    return (
      <p className="text-faint">
        This build has no Fighting Style, Expertise, Metamagic, or Eldritch Invocation
        choices at the chosen levels — skip ahead.
      </p>
    );
  return (
    <div className="builder__choices">
      {groups.map((g) => (
        <div key={g.key} className="builder__choice-group">
          <h4 className="builder__equip-title">
            {g.title} — choose {g.choose} ({g.chosen.length}/{g.choose})
          </h4>
          {g.hint && <p className="text-faint builder__hint">{g.hint}</p>}
          {g.options.length === 0 ? (
            <p className="text-faint">{g.emptyNote ?? "No options available."}</p>
          ) : (
            <div className="builder__chips">
              {g.options.map((o) => {
                const on = g.chosen.includes(o.optionId);
                const atCap = !on && g.chosen.length >= g.choose;
                return (
                  <button
                    key={o.optionId}
                    type="button"
                    disabled={atCap}
                    className={
                      "builder__chip" +
                      (on ? " builder__chip--on" : "") +
                      (o.description ? " tip" : "")
                    }
                    data-tooltip={o.description ?? undefined}
                    onClick={() => g.onToggle(o.optionId)}
                  >
                    {o.name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// One "choose N" spell picker (cantrips or levelled spells), with a search box for
// the larger pools. Used by SpellsStep.
export interface SpellPick {
  choose: number;
  pool: { id: string; name: string; level: number }[];
  chosen: string[];
  onToggle: (id: string) => void;
}
function SpellPickList({ title, pick }: { title: string; pick: SpellPick }) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = q
    ? pick.pool.filter(
        (s) => pick.chosen.includes(s.id) || s.name.toLowerCase().startsWith(q),
      )
    : pick.pool;
  return (
    <div className="builder__spell-group">
      <h4 className="builder__equip-title">
        {pick.choose > 0
          ? `${title} — choose ${pick.choose} (${pick.chosen.length}/${pick.choose})`
          : `${title} — optional (${pick.chosen.length} selected)`}
      </h4>
      {pick.pool.length > 8 && (
        <input
          className="input"
          placeholder={`Search ${pick.pool.length} ${title.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="builder__chips">
        {shown.map((s) => {
          const on = pick.chosen.includes(s.id);
          const atCap = pick.choose > 0 && !on && pick.chosen.length >= pick.choose;
          return (
            <button
              key={s.id}
              type="button"
              disabled={atCap}
              className={"builder__chip" + (on ? " builder__chip--on" : "")}
              onClick={() => pick.onToggle(s.id)}
            >
              {s.name}
              {s.level > 0 && <span className="text-faint"> · L{s.level}</span>}
            </button>
          );
        })}
        {shown.length === 0 && <span className="text-faint">No matches.</span>}
      </div>
    </div>
  );
}

// Spell selection at creation: required cantrips/spells for known casters, plus an
// optional pre-population picker for prepared casters (Paladin, Cleric, Druid, Wizard)
// once they have castable spell levels.
export function SpellsStep({
  casterNames,
  cantrips,
  spells,
}: {
  casterNames: string[];
  cantrips: SpellPick | null;
  spells: SpellPick | null;
}) {
  const hasPreparedOptional = spells?.choose === 0;
  if (!cantrips && !spells)
    return (
      <p className="text-faint">
        No spells at this level — either a non-caster, or a prepared caster that hasn't
        reached their first spell slots yet (e.g. Paladin before level 2).
      </p>
    );
  return (
    <div className="builder__spells">
      <p className="text-muted builder__hint">
        Spells for {casterNames.join(", ")} at your chosen level.
        {hasPreparedOptional
          ? " Prepared spells are optional here — skip if you prefer to pick them later via Manage Spells on the sheet."
          : " Known casters must fill their required count before advancing."}
      </p>
      {cantrips && <SpellPickList title="Cantrips" pick={cantrips} />}
      {spells && <SpellPickList title="Spells" pick={spells} />}
    </div>
  );
}

export function EquipmentStep({
  armors,
  weapons,
  armorId,
  shieldId,
  weaponIds,
  onArmor,
  onShield,
  onToggleWeapon,
  hasClass,
  armorProficient,
  weaponProficient,
  items,
  inventory,
  onAddItem,
  onItemQty,
  onToggleAttune,
  onRemoveItem,
  coins,
  onCoins,
}: {
  armors: ArmorResponse[];
  weapons: WeaponResponse[];
  armorId: string | null;
  shieldId: string | null;
  weaponIds: string[];
  onArmor: (id: string | null) => void;
  onShield: (id: string | null) => void;
  onToggleWeapon: (id: string) => void;
  hasClass: boolean;
  armorProficient: (a: ArmorResponse) => boolean;
  weaponProficient: (w: WeaponResponse) => boolean;
  items: ItemResponse[];
  inventory: InventoryItemRequest[];
  onAddItem: (id: string) => void;
  onItemQty: (id: string, qty: number) => void;
  onToggleAttune: (id: string) => void;
  onRemoveItem: (id: string) => void;
  coins: Coins;
  onCoins: (c: Coins) => void;
}) {
  const armorOption = (a: ArmorResponse) => {
    const prof = armorProficient(a);
    const cat = a.armorCategory ?? "this armor";
    return {
      id: a.id,
      name: a.name,
      meta: a.isShield ? `+${a.baseArmorClass} AC` : armorMeta(a),
      nonProficient: hasClass && !prof,
      title: !hasClass
        ? armorTip(a)
        : prof
          ? `Proficient with ${cat}.`
          : `Not proficient with ${cat}: you can't cast spells and have disadvantage on STR/DEX checks, saves, and attacks while wearing it.`,
    };
  };
  const bodyArmors = [...armors]
    .filter((a) => !a.isShield)
    .sort((a, b) =>
      (a.armorCategory ?? "").localeCompare(b.armorCategory ?? "") ||
      a.name.localeCompare(b.name),
    )
    .map(armorOption);
  const shields = armors.filter((a) => a.isShield).map(armorOption);
  return (
    <div className="builder__equip">
      <SingleChoice title="Armor" options={bodyArmors} selected={armorId} onPick={onArmor} />
      <SingleChoice title="Shield" options={shields} selected={shieldId} onPick={onShield} />
      <div>
        <h4 className="builder__equip-title">Weapons</h4>
        {weapons.length === 0 ? (
          <p className="text-faint">No weapons loaded.</p>
        ) : (
          <div className="builder__chips">
            {[...weapons]
              .sort(
                (a, b) =>
                  (a.weaponCategory ?? "").localeCompare(
                    b.weaponCategory ?? "",
                  ) || a.name.localeCompare(b.name),
              )
              .map((w) => {
              const prof = weaponProficient(w);
              const nonProficient = hasClass && !prof;
              const cat = w.weaponCategory ?? "this weapon";
              return (
                <button
                  key={w.id}
                  type="button"
                  data-tooltip={
                    !hasClass
                      ? weaponTip(w)
                      : prof
                        ? `Proficient with ${cat}.`
                        : `Not proficient with ${cat}: attacks don't add your proficiency bonus.`
                  }
                  className={
                    "builder__chip tip" +
                    (weaponIds.includes(w.id) ? " builder__chip--on" : "") +
                    (nonProficient ? " builder__chip--nonprof" : "")
                  }
                  onClick={() => onToggleWeapon(w.id)}
                >
                  {nonProficient && <span className="builder__nonprof-mark">⚠ </span>}
                  {w.name}
                  {weaponMeta(w) && (
                    <span className="text-faint"> · {weaponMeta(w)}</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <InventorySection
        items={items}
        inventory={inventory}
        onAddItem={onAddItem}
        onItemQty={onItemQty}
        onToggleAttune={onToggleAttune}
        onRemoveItem={onRemoveItem}
      />

      <CurrencySection coins={coins} onCoins={onCoins} />

      <div className="builder__equip-note">
        <p>
          {hasClass ? (
            <>
              <strong>⚠ Items in red aren't in your class's proficiencies.</strong>{" "}
              You can still equip them, but 5e penalties apply:
            </>
          ) : (
            <>
              <strong>Pick a class to see proficiency.</strong> Equipping
              non-proficient gear is allowed, but carries 5e penalties:
            </>
          )}
        </p>
        <ul>
          <li>
            <strong>Armor</strong> you lack proficiency with: you{" "}
            <strong>can't cast spells</strong> and have disadvantage on any STR/DEX
            ability check, save, or attack while wearing it.
          </li>
          <li>
            <strong>Weapons</strong> you lack proficiency with: attacks don't add
            your proficiency bonus.
          </li>
        </ul>
        <p className="text-faint">
          The sheet shows the real (penalized) AC and attack bonuses after saving.
          Hover an item for details.
        </p>
      </div>
    </div>
  );
}

function InventorySection({
  items,
  inventory,
  onAddItem,
  onItemQty,
  onToggleAttune,
  onRemoveItem,
}: {
  items: ItemResponse[];
  inventory: InventoryItemRequest[];
  onAddItem: (id: string) => void;
  onItemQty: (id: string, qty: number) => void;
  onToggleAttune: (id: string) => void;
  onRemoveItem: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const itemsById = useMemo(
    () => new Map(items.map((i) => [i.id, i])),
    [items],
  );
  // The catalog is large (hundreds of items) — only show matches once searching,
  // and cap the rendered list so the step stays light. Already-added items drop out.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return [];
    const inCart = new Set(inventory.map((i) => i.itemId));
    return items
      .filter((i) => i.name.toLowerCase().startsWith(q) && !inCart.has(i.id))
      .slice(0, 30);
  }, [query, items, inventory]);

  return (
    <div className="builder__inventory">
      <h4 className="builder__equip-title">Inventory</h4>
      {inventory.length > 0 && (
        <ul className="builder__cart">
          {inventory.map((line) => {
            const item = itemsById.get(line.itemId);
            const qty = line.quantity ?? 1;
            return (
              <li key={line.itemId} className="builder__cart-row">
                <span className="builder__cart-name">
                  {item?.name ?? "Unknown item"}
                  {item?.isMagic && (
                    <span className="text-faint"> · magic</span>
                  )}
                </span>
                <div className="builder__stepper builder__cart-qty">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onItemQty(line.itemId, qty - 1)}
                  >
                    −
                  </button>
                  <span className="builder__stepper-val">{qty}</span>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => onItemQty(line.itemId, qty + 1)}
                  >
                    +
                  </button>
                </div>
                {item?.requiresAttunement && (
                  <button
                    type="button"
                    className={
                      "builder__chip" + (line.isAttuned ? " builder__chip--on" : "")
                    }
                    onClick={() => onToggleAttune(line.itemId)}
                  >
                    {line.isAttuned ? "attuned" : "attune"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => onRemoveItem(line.itemId)}
                >
                  remove
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {items.length === 0 ? (
        <p className="text-faint">No items loaded.</p>
      ) : (
        <>
          <input
            className="input"
            placeholder="Search items to add…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query.trim() && (
            <div className="builder__chips">
              {matches.length === 0 ? (
                <span className="text-faint">No matches.</span>
              ) : (
                matches.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    className="builder__chip"
                    onClick={() => onAddItem(it.id)}
                  >
                    + {it.name}
                    {it.isMagic && <span className="text-faint"> · magic</span>}
                  </button>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const COIN_FIELDS: { key: keyof Coins; label: string }[] = [
  { key: "cp", label: "CP" },
  { key: "sp", label: "SP" },
  { key: "ep", label: "EP" },
  { key: "gp", label: "GP" },
  { key: "pp", label: "PP" },
];

function CurrencySection({
  coins,
  onCoins,
}: {
  coins: Coins;
  onCoins: (c: Coins) => void;
}) {
  return (
    <div className="builder__currency">
      <h4 className="builder__equip-title">Currency</h4>
      <div className="builder__coins">
        {COIN_FIELDS.map((f) => (
          <label key={f.key} className="builder__coin">
            <span className="builder__ability-name">{f.label}</span>
            <input
              className="input"
              type="number"
              min={0}
              value={coins[f.key] || ""}
              placeholder="0"
              onChange={(e) =>
                onCoins({ ...coins, [f.key]: Math.max(0, Number(e.target.value) || 0) })
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function armorMeta(a: ArmorResponse): string {
  const bits = [a.armorCategory, `AC ${a.baseArmorClass}`];
  if (a.stealthDisadvantage) bits.push("stealth disadv");
  return bits.filter(Boolean).join(" · ");
}
function armorTip(a: ArmorResponse): string {
  return `${a.armorCategory ?? "Armor"}: if your class isn't proficient, you can't cast spells and have disadvantage on STR/DEX checks, saves, and attacks while wearing it.`;
}
function weaponMeta(w: WeaponResponse): string {
  return [w.damage, w.isRanged ? "ranged" : null, w.isFinesse ? "finesse" : null]
    .filter(Boolean)
    .join(" · ");
}
function weaponTip(w: WeaponResponse): string {
  return `${w.weaponCategory ?? "Weapon"}: if your class isn't proficient with it, your attacks don't add your proficiency bonus.`;
}

// ---- Details step (backstory + appearance) ----

export type DetailsFields = {
  personalityTraits: string;
  ideals: string;
  bonds: string;
  flaws: string;
  backstory: string;
  height: string;
  weight: string;
  eyes: string;
  skin: string;
  hair: string;
};

export function DetailsStep({
  fields,
  onChange,
}: {
  fields: DetailsFields;
  onChange: (f: keyof DetailsFields, v: string) => void;
}) {
  const textarea = (
    f: keyof DetailsFields,
    label: string,
    full?: boolean,
  ) => (
    <div
      className={
        "builder__details-field" +
        (full ? " builder__details-field--full" : "")
      }
    >
      <label htmlFor={`detail-${f}`}>{label}</label>
      <textarea
        id={`detail-${f}`}
        className="input"
        rows={3}
        value={fields[f]}
        onChange={(e) => onChange(f, e.target.value)}
      />
    </div>
  );
  const textinput = (f: keyof DetailsFields, label: string) => (
    <div className="builder__details-field">
      <label htmlFor={`detail-${f}`}>{label}</label>
      <input
        id={`detail-${f}`}
        className="input"
        type="text"
        value={fields[f]}
        onChange={(e) => onChange(f, e.target.value)}
      />
    </div>
  );
  return (
    <div className="builder__details-form">
      <p className="text-faint builder__hint">
        Optional — fill in backstory and appearance details. Everything here can
        be edited on the sheet later.
      </p>
      <div className="builder__details-grid">
        {textarea("personalityTraits", "Personality Traits")}
        {textarea("ideals", "Ideals")}
        {textarea("bonds", "Bonds")}
        {textarea("flaws", "Flaws")}
        {textarea("backstory", "Backstory", true)}
      </div>
      <div>
        <h4 className="builder__equip-title">Appearance</h4>
        <div className="builder__details-appearance">
          {textinput("height", "Height")}
          {textinput("weight", "Weight")}
          {textinput("eyes", "Eyes")}
          {textinput("skin", "Skin")}
          {textinput("hair", "Hair")}
        </div>
      </div>
    </div>
  );
}

function SingleChoice({
  title,
  options,
  selected,
  onPick,
}: {
  title: string;
  options: {
    id: string;
    name: string;
    meta?: string;
    title?: string;
    nonProficient?: boolean;
  }[];
  selected: string | null;
  onPick: (id: string | null) => void;
}) {
  return (
    <div>
      <h4 className="builder__equip-title">{title}</h4>
      <div className="builder__chips">
        <button
          type="button"
          className={"builder__chip" + (selected === null ? " builder__chip--on" : "")}
          onClick={() => onPick(null)}
        >
          None
        </button>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            data-tooltip={o.title}
            className={
              "builder__chip" +
              (selected === o.id ? " builder__chip--on" : "") +
              (o.title ? " tip" : "") +
              (o.nonProficient ? " builder__chip--nonprof" : "")
            }
            onClick={() => onPick(o.id)}
          >
            {o.nonProficient && <span className="builder__nonprof-mark">⚠ </span>}
            {o.name}
            {o.meta && <span className="text-faint"> · {o.meta}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Review({
  name,
  raceName,
  age,
  picks,
  classes,
  startingClassId,
  alignment,
  stats,
  abilities,
  skillNames,
  backgroundName,
  backgroundFeatureName,
  languageNames,
  featNames,
  armorName,
  shieldName,
  weaponNames,
  itemCount,
  coins,
}: {
  name: string;
  raceName?: string;
  age: number;
  picks: CharacterClassRequest[];
  classes: ClassResponse[];
  startingClassId: string | null;
  alignment: Alignment;
  stats: StatResponse[];
  abilities: Record<string, number>;
  skillNames: string[];
  backgroundName?: string;
  backgroundFeatureName?: string;
  languageNames: string[];
  featNames: string[];
  armorName?: string;
  shieldName?: string;
  weaponNames: string[];
  itemCount: number;
  coins: Coins;
}) {
  const alignmentLabel =
    ALIGNMENTS.find((a) => a.value === alignment)?.label ?? "—";
  const subclassName = (p: CharacterClassRequest) => {
    if (!p.subclassId) return "";
    const sel = classes
      .find((c) => c.id === p.classId)
      ?.selections.find((s) => s.type === SelectionType.Subclass);
    const name = sel?.options.find((o) => o.optionId === p.subclassId)?.name;
    return name ? ` (${name})` : "";
  };
  const classLine =
    picks
      .map((p) => {
        const cls = classes.find((c) => c.id === p.classId);
        const star = picks.length > 1 && p.classId === startingClassId ? "★" : "";
        return `${cls?.name ?? "?"} ${p.level}${subclassName(p)}${star}`;
      })
      .join(" / ") || "No class";
  const gear = [
    armorName,
    shieldName ? `${shieldName} (shield)` : null,
    ...weaponNames,
  ].filter(Boolean);
  const coinLine = COIN_FIELDS.filter((f) => coins[f.key] > 0)
    .map((f) => `${coins[f.key]} ${f.label}`)
    .join(", ");
  return (
    <div className="builder__review">
      <h2 className="builder__review-name">{name || "Unnamed hero"}</h2>
      <p className="text-muted">
        {raceName ?? "No race"} · {classLine} · {alignmentLabel}
        {backgroundName && ` · ${backgroundName}`}
        {age > 0 && ` · age ${age}`}
      </p>
      <div className="builder__review-abilities">
        {stats.map((s) => (
          <div key={s.id} className="builder__review-ability">
            <span className="builder__ability-name">{s.code ?? s.name}</span>
            <strong>{abilities[s.id] ?? "—"}</strong>
          </div>
        ))}
      </div>
      {backgroundFeatureName && (
        <p className="text-muted">
          Background feature: {backgroundFeatureName}
        </p>
      )}
      {skillNames.length > 0 && (
        <p className="text-muted">Skills: {skillNames.join(", ")}</p>
      )}
      {languageNames.length > 0 && (
        <p className="text-muted">Languages: {languageNames.join(", ")}</p>
      )}
      {featNames.length > 0 && (
        <p className="text-muted">Feats: {featNames.join(", ")}</p>
      )}
      {gear.length > 0 && (
        <p className="text-muted">Equipment: {gear.join(", ")}</p>
      )}
      {(itemCount > 0 || coinLine) && (
        <p className="text-muted">
          {itemCount > 0 && `Inventory: ${itemCount} item${itemCount === 1 ? "" : "s"}`}
          {itemCount > 0 && coinLine && " · "}
          {coinLine}
        </p>
      )}
    </div>
  );
}
