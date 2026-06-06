import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { characters, reference } from "../api/endpoints";
import { ApiError } from "../api/client";
import {
  LevelUpHitPointMode,
  type AbilityScoreResponse,
  type CharacterClassResponse,
  type CharacterResponse,
  type FeatResponse,
  type LevelUpApplyRequest,
  type LevelUpPlanResponse,
  type LevelUpSpellPoolEntryResponse,
} from "../api/types";
import "./LevelUpDialog.css";

// At an ASI level a character either bumps ability scores or takes a feat — never both.
type AsiMode = "asi" | "feat";

/**
 * Drives the two-phase level-up engine: POST .../levelup/plan to preview the
 * gains + forced choices for advancing one class, collect those choices, then
 * POST .../levelup/apply. On success it hands the updated character back so the
 * sheet re-renders. At an ASI level the player chooses between distributing two
 * ability points or taking a feat; HP, subclass, and spell picks are all handled.
 */
export default function LevelUpDialog({
  characterId,
  classes,
  abilityScores,
  onClose,
  onApplied,
}: {
  characterId: string;
  classes: CharacterClassResponse[];
  abilityScores: AbilityScoreResponse[];
  onClose: () => void;
  onApplied: (updated: CharacterResponse) => void;
}) {
  const [classId, setClassId] = useState<string | null>(
    classes.length === 1 ? classes[0].classId : null,
  );
  const [plan, setPlan] = useState<LevelUpPlanResponse | null>(null);
  // Which class `plan`/`error` currently reflect; while it lags classId we're loading.
  const [plannedClassId, setPlannedClassId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Collected choices.
  const [hpMode, setHpMode] = useState<LevelUpHitPointMode>(
    LevelUpHitPointMode.Average,
  );
  const [rolled, setRolled] = useState<number | "">("");
  const [asiMode, setAsiMode] = useState<AsiMode>("asi");
  const [asi, setAsi] = useState<Record<string, number>>({});
  const [featId, setFeatId] = useState<string | null>(null);
  const [subclassId, setSubclassId] = useState<string | null>(null);
  const [cantripIds, setCantripIds] = useState<string[]>([]);
  const [spellIds, setSpellIds] = useState<string[]>([]);

  // Feat catalog for the "take a feat instead of an ASI" choice (loaded once).
  const [feats, setFeats] = useState<FeatResponse[]>([]);
  useEffect(() => {
    reference.feats().then(setFeats).catch(() => setFeats([]));
  }, []);

  // Fetch the plan whenever the chosen class changes. All state writes happen in
  // the async callbacks (never synchronously in the effect body); `loading` is
  // derived so a class switch hides the stale plan until the new one resolves.
  useEffect(() => {
    if (!classId) return;
    let active = true;
    characters
      .levelUpPlan(characterId, { classId })
      .then((p) => {
        if (!active) return;
        setPlan(p);
        setError(null);
        setPlannedClassId(classId);
        // Reset collected choices for the new plan.
        setHpMode(LevelUpHitPointMode.Average);
        setRolled("");
        setAsiMode("asi");
        setAsi({});
        setFeatId(null);
        setSubclassId(null);
        setCantripIds([]);
        setSpellIds([]);
      })
      .catch((err) => {
        if (!active) return;
        setError(
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : "Could not reach the server.",
        );
        setPlan(null);
        setPlannedClassId(classId);
      });
    return () => {
      active = false;
    };
  }, [classId, characterId]);

  // Close on Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const loading = classId !== null && plannedClassId !== classId;

  const asiPoints = useMemo(
    () => Object.values(asi).reduce((a, b) => a + b, 0),
    [asi],
  );

  // Validation gates for Apply.
  const hpOk =
    hpMode === LevelUpHitPointMode.Average ||
    (typeof rolled === "number" &&
      plan !== null &&
      rolled >= plan.hitPoints.rollMin &&
      rolled <= plan.hitPoints.rollMax);
  // At an ASI level: either distribute exactly 2 ability points, or pick one feat.
  const asiOk =
    !plan?.abilityScoreImprovementDue ||
    (asiMode === "asi" ? asiPoints === 2 : !!featId);
  const subclassOk = !plan?.subclassChoice || !!subclassId;
  const cantripsOk =
    isUnset(plan?.spellChoices?.newCantrips) ||
    cantripIds.length === plan?.spellChoices?.newCantrips;
  const spellsOk =
    isUnset(plan?.spellChoices?.newSpells) ||
    spellIds.length === plan?.spellChoices?.newSpells;
  const canApply =
    !!plan && hpOk && asiOk && subclassOk && cantripsOk && spellsOk && !busy;

  // What's still required before Apply works — surfaced next to the button so a
  // disabled Apply (e.g. no subclass picked) isn't silent.
  const applyMissing = plan
    ? [
        !hpOk ? "a hit-point roll in range" : null,
        !asiOk
          ? asiMode === "asi"
            ? `2 ability points (${asiPoints}/2)`
            : "a feat"
          : null,
        !subclassOk ? (plan.subclassChoice?.name ?? "a subclass") : null,
        !cantripsOk
          ? `${plan.spellChoices?.newCantrips} cantrip(s) (${cantripIds.length} chosen)`
          : null,
        !spellsOk
          ? `${plan.spellChoices?.newSpells} spell(s) (${spellIds.length} chosen)`
          : null,
      ].filter(Boolean)
    : [];

  function setAsiPoint(statId: string, amount: number) {
    setAsi((prev) => {
      const next = { ...prev };
      if (amount <= 0) delete next[statId];
      else next[statId] = amount;
      return next;
    });
  }

  async function apply() {
    if (!plan || !classId || !canApply) return;
    setBusy(true);
    setError(null);
    const req: LevelUpApplyRequest = {
      classId,
      hitPoints: {
        mode: hpMode,
        rolledValue:
          hpMode === LevelUpHitPointMode.Roll && typeof rolled === "number"
            ? rolled
            : undefined,
      },
      // At an ASI level send exactly one of improvements / featId (backend rejects both).
      abilityImprovements:
        plan.abilityScoreImprovementDue && asiMode === "asi"
          ? Object.entries(asi).map(([statId, amount]) => ({ statId, amount }))
          : undefined,
      featId:
        plan.abilityScoreImprovementDue && asiMode === "feat"
          ? (featId ?? undefined)
          : undefined,
      subclassId: subclassId ?? undefined,
      cantripIds: cantripIds.length ? cantripIds : undefined,
      spellIds: spellIds.length ? spellIds : undefined,
    };
    try {
      const updated = await characters.levelUpApply(characterId, req);
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
    <div className="lvl-backdrop" onClick={onClose}>
      <div
        className="lvl panel anim-pop-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Level up"
      >
        <header className="lvl__head">
          <h2>Level Up</h2>
          <button className="btn btn--ghost" onClick={onClose}>
            Close
          </button>
        </header>

        {classes.length > 1 && (
          <ClassPicker
            classes={classes}
            selected={classId}
            onPick={setClassId}
          />
        )}

        {loading && <p className="text-faint">Planning...</p>}
        {!loading && error && <p className="lvl__error">{error}</p>}

        {plan && !loading && (
          <>
            <p className="lvl__summary text-muted">
              {plan.className} {plan.fromLevel} → {plan.toLevel} · total level{" "}
              {plan.totalLevelAfter}
            </p>

            <HpChoice
              plan={plan}
              mode={hpMode}
              onMode={setHpMode}
              rolled={rolled}
              onRolled={setRolled}
            />

            {plan.abilityScoreImprovementDue && (
              <AsiChoice
                abilityScores={abilityScores}
                mode={asiMode}
                onMode={setAsiMode}
                asi={asi}
                points={asiPoints}
                onSet={setAsiPoint}
                feats={feats}
                featId={featId}
                onFeat={setFeatId}
              />
            )}

            {plan.subclassChoice && (
              <SubclassChoice
                selection={plan.subclassChoice}
                selected={subclassId}
                onPick={setSubclassId}
              />
            )}

            {plan.spellChoices && (
              <SpellChoice
                title="Cantrips"
                count={plan.spellChoices.newCantrips}
                pool={plan.spellChoices.cantripPool}
                selected={cantripIds}
                onToggle={(id) => toggle(setCantripIds, id, plan.spellChoices!.newCantrips)}
              />
            )}
            {plan.spellChoices && (
              <SpellChoice
                title="Spells"
                count={plan.spellChoices.newSpells}
                pool={plan.spellChoices.spellPool}
                selected={spellIds}
                onToggle={(id) => toggle(setSpellIds, id, plan.spellChoices!.newSpells)}
              />
            )}

            {plan.gainedFeatures.length > 0 && (
              <GainsList plan={plan} />
            )}

            <div className="lvl__actions">
              {applyMissing.length > 0 && (
                <p className="lvl__needs">
                  Still needed: {applyMissing.join(", ")}.
                </p>
              )}
              <button
                className="btn btn--primary"
                disabled={!canApply}
                onClick={apply}
              >
                {busy ? "Applying..." : `Apply — Level ${plan.toLevel}`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

// Toggle an id in a string[] setter, respecting an optional max count.
function toggle(
  setter: React.Dispatch<React.SetStateAction<string[]>>,
  id: string,
  max: number | null | undefined,
) {
  setter((prev) => {
    if (prev.includes(id)) return prev.filter((x) => x !== id);
    if (!isUnset(max) && prev.length >= (max as number)) return prev;
    return [...prev, id];
  });
}

function ClassPicker({
  classes,
  selected,
  onPick,
}: {
  classes: CharacterClassResponse[];
  selected: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <div className="lvl__classes">
      {classes.map((c) => (
        <button
          key={c.classId}
          className={
            "lvl__class" + (c.classId === selected ? " lvl__class--on" : "")
          }
          onClick={() => onPick(c.classId)}
        >
          {c.name} {c.level}
        </button>
      ))}
    </div>
  );
}

function HpChoice({
  plan,
  mode,
  onMode,
  rolled,
  onRolled,
}: {
  plan: LevelUpPlanResponse;
  mode: LevelUpHitPointMode;
  onMode: (m: LevelUpHitPointMode) => void;
  rolled: number | "";
  onRolled: (v: number | "") => void;
}) {
  const hp = plan.hitPoints;
  return (
    <section className="lvl__block">
      <h3 className="lvl__block-title">Hit Points</h3>
      <div className="lvl__hp-modes">
        <label>
          <input
            type="radio"
            checked={mode === LevelUpHitPointMode.Average}
            onChange={() => onMode(LevelUpHitPointMode.Average)}
          />
          Average ({hp.average} + {fmtSigned(hp.conModifier)} CON)
        </label>
        <label>
          <input
            type="radio"
            checked={mode === LevelUpHitPointMode.Roll}
            onChange={() => onMode(LevelUpHitPointMode.Roll)}
          />
          Roll d{hp.hitDie} ({hp.rollMin}–{hp.rollMax})
        </label>
        {mode === LevelUpHitPointMode.Roll && (
          <input
            className="input lvl__roll"
            type="number"
            min={hp.rollMin}
            max={hp.rollMax}
            value={rolled}
            placeholder={`${hp.rollMin}-${hp.rollMax}`}
            onChange={(e) =>
              onRolled(e.target.value === "" ? "" : Number(e.target.value))
            }
          />
        )}
      </div>
    </section>
  );
}

function AsiChoice({
  abilityScores,
  mode,
  onMode,
  asi,
  points,
  onSet,
  feats,
  featId,
  onFeat,
}: {
  abilityScores: AbilityScoreResponse[];
  mode: AsiMode;
  onMode: (m: AsiMode) => void;
  asi: Record<string, number>;
  points: number;
  onSet: (statId: string, amount: number) => void;
  feats: FeatResponse[];
  featId: string | null;
  onFeat: (id: string) => void;
}) {
  return (
    <section className="lvl__block">
      <h3 className="lvl__block-title">Ability Score Improvement</h3>
      <div className="lvl__asi-modes">
        <button
          type="button"
          className={"lvl__option" + (mode === "asi" ? " lvl__option--on" : "")}
          onClick={() => onMode("asi")}
        >
          Improve abilities
        </button>
        <button
          type="button"
          className={"lvl__option" + (mode === "feat" ? " lvl__option--on" : "")}
          onClick={() => onMode("feat")}
        >
          Take a feat
        </button>
      </div>

      {mode === "asi" ? (
        <>
          <p className="text-faint lvl__hint">
            Allocate 2 points (max +2 to one) — {points}/2 chosen.
          </p>
          <div className="lvl__asi">
            {abilityScores.map((a) => {
              const v = asi[a.statId] ?? 0;
              const atCap = points >= 2 && v === 0;
              return (
                <div key={a.statId} className="lvl__asi-row">
                  <span className="lvl__asi-name">{a.name}</span>
                  <span className="lvl__asi-score">
                    {a.effective}
                    {v > 0 && ` → ${a.effective + v}`}
                  </span>
                  <div className="lvl__stepper">
                    <button
                      className="btn"
                      disabled={v <= 0}
                      onClick={() => onSet(a.statId, v - 1)}
                    >
                      −
                    </button>
                    <span className="lvl__asi-val">+{v}</span>
                    <button
                      className="btn"
                      disabled={v >= 2 || atCap}
                      onClick={() => onSet(a.statId, v + 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      ) : feats.length === 0 ? (
        <p className="text-faint lvl__hint">No feats loaded (is the API running?).</p>
      ) : (
        <div className="lvl__options lvl__feats">
          {feats.map((f) => {
            const mods = f.abilityModifiers
              .map(
                (m) =>
                  `${m.stat ?? "ability"} ${m.modifier >= 0 ? "+" : ""}${m.modifier}`,
              )
              .join(", ");
            return (
              <button
                key={f.id}
                className={
                  "lvl__option lvl__feat" + (f.id === featId ? " lvl__option--on" : "")
                }
                title={
                  [f.prerequisite ? `Prerequisite: ${f.prerequisite}` : null, f.description]
                    .filter(Boolean)
                    .join("\n") || undefined
                }
                onClick={() => onFeat(f.id)}
              >
                <span className="lvl__feat-name">{f.name}</span>
                {mods && <span className="text-faint"> · {mods}</span>}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function SubclassChoice({
  selection,
  selected,
  onPick,
}: {
  selection: NonNullable<LevelUpPlanResponse["subclassChoice"]>;
  selected: string | null;
  onPick: (id: string) => void;
}) {
  return (
    <section className="lvl__block">
      <h3 className="lvl__block-title">{selection.name}</h3>
      <div className="lvl__options">
        {selection.options.map((o) => (
          <button
            key={o.optionId}
            className={
              "lvl__option" + (o.optionId === selected ? " lvl__option--on" : "")
            }
            onClick={() => onPick(o.optionId)}
          >
            {o.name}
          </button>
        ))}
      </div>
    </section>
  );
}

function SpellChoice({
  title,
  count,
  pool,
  selected,
  onToggle,
}: {
  title: string;
  count: number | null | undefined;
  pool: LevelUpSpellPoolEntryResponse[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  if (pool.length === 0) return null;
  const informational = isUnset(count);
  const q = query.trim().toLowerCase();
  // Filter the pool by name; always keep already-selected entries visible so a
  // search can't hide a pick. Casting pools get large, so a filter matters here.
  const shown = q
    ? pool.filter((s) => selected.includes(s.id) || s.name.toLowerCase().includes(q))
    : pool;
  return (
    <section className="lvl__block">
      <h3 className="lvl__block-title">
        {title}
        {!informational
          ? ` — choose ${count} (${selected.length}/${count})`
          : " (known list)"}
      </h3>
      {pool.length > 8 && (
        <input
          className="input lvl__spell-search"
          placeholder={`Search ${pool.length} ${title.toLowerCase()}…`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="lvl__options">
        {shown.map((s) => {
          const on = selected.includes(s.id);
          return (
            <button
              key={s.id}
              className={"lvl__option" + (on ? " lvl__option--on" : "")}
              disabled={informational}
              onClick={() => onToggle(s.id)}
            >
              {s.name}
              {s.level > 0 && <span className="text-faint"> · L{s.level}</span>}
            </button>
          );
        })}
        {shown.length === 0 && <span className="text-faint">No matches.</span>}
      </div>
    </section>
  );
}

function GainsList({ plan }: { plan: LevelUpPlanResponse }) {
  return (
    <section className="lvl__block">
      <h3 className="lvl__block-title">Gained at this level</h3>
      <ul className="lvl__gains">
        {plan.gainedFeatures.map((f, i) => (
          <li key={i}>
            <strong>{f.name}</strong>
            {f.description && (
              <span className="text-faint"> — {f.description}</span>
            )}
          </li>
        ))}
        {plan.gainedResources.map((r, i) => (
          <li key={`r${i}`} className="text-muted">
            {r.name}: {r.max} ({r.source})
          </li>
        ))}
      </ul>
    </section>
  );
}

const fmtSigned = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
// True when a nullable count is absent (prepared-caster pools send null/undefined).
const isUnset = (n: number | null | undefined): boolean =>
  n === null || n === undefined;
