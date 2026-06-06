import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { characters, reference } from "../api/endpoints";
import { ApiError } from "../api/client";
import {
  Alignment,
  SelectionType,
  SkillProficiencyLevel,
  type ArmorResponse,
  type CharacterClassRequest,
  type CharacterRequest,
  type ClassResponse,
  type RaceResponse,
  type SelectionResponse,
  type SkillResponse,
  type StatResponse,
  type WeaponResponse,
} from "../api/types";
import "./CharacterBuilder.css";

const STEPS = ["Race", "Class", "Abilities", "Skills", "Equipment", "Review"] as const;
const MAX_TOTAL_LEVEL = 20;

// 5e point-buy: 27 points, scores 8–15. Manual mode allows the backend's full 1–30.
type AbilityMode = "pointbuy" | "manual";
const POINT_BUDGET = 27;
const POINT_MIN = 8;
const POINT_MAX = 15;
// Manual mode's neutral baseline (D&D average, +0 mod) — point-buy stays at POINT_MIN.
const MANUAL_DEFAULT = 10;
const POINT_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};
const pointCost = (score: number) => POINT_COST[score] ?? 0;

// Surface ASP.NET problem-details field errors, not just the title.
function describeError(err: unknown): string {
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

/**
 * Character creation wizard. Collects a CharacterRequest: name, race, one or more
 * classes (multiclass, levels summing to <=20, with a designated starting class),
 * base ability scores for every default stat, optional class skill choices, and
 * optional equipped armor/shield/weapons. POSTs via characters.create().
 */
export default function CharacterBuilder() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);

  // Reference data.
  const [races, setRaces] = useState<RaceResponse[]>([]);
  const [classes, setClasses] = useState<ClassResponse[]>([]);
  const [stats, setStats] = useState<StatResponse[]>([]);
  const [skills, setSkills] = useState<SkillResponse[]>([]);
  const [armors, setArmors] = useState<ArmorResponse[]>([]);
  const [weapons, setWeapons] = useState<WeaponResponse[]>([]);

  // Selections.
  const [name, setName] = useState("");
  const [age, setAge] = useState(0);
  const [alignment, setAlignment] = useState<Alignment>(Alignment.TrueNeutral);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [picks, setPicks] = useState<CharacterClassRequest[]>([]);
  const [startingClassId, setStartingClassId] = useState<string | null>(null);
  const [abilities, setAbilities] = useState<Record<string, number>>({});
  const [abilityMode, setAbilityMode] = useState<AbilityMode>("pointbuy");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [armorId, setArmorId] = useState<string | null>(null);
  const [shieldId, setShieldId] = useState<string | null>(null);
  const [weaponIds, setWeaponIds] = useState<string[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    reference.races().then(setRaces).catch(() => setRaces([]));
    reference.classes().then(setClasses).catch(() => setClasses([]));
    reference
      .stats()
      .then((s) => {
        setStats(s);
        // Seed every default stat at the point-buy base so the budget starts full.
        setAbilities((prev) => {
          const next = { ...prev };
          for (const st of s)
            if (st.isDefault && next[st.id] === undefined) next[st.id] = POINT_MIN;
          return next;
        });
      })
      .catch(() => setStats([]));
    reference.skills().then(setSkills).catch(() => setSkills([]));
    reference.armors().then(setArmors).catch(() => setArmors([]));
    reference.weapons().then(setWeapons).catch(() => setWeapons([]));
  }, []);

  // skillId -> governing-ability label (stat code like "STR", else the ability name).
  const skillAbility = useMemo(() => {
    const statCode = new Map(stats.map((s) => [s.id, s.code]));
    const m = new Map<string, string>();
    for (const sk of skills) {
      const label =
        (sk.abilityStatId ? statCode.get(sk.abilityStatId) : null) ?? sk.ability;
      if (label) m.set(sk.id, label);
    }
    return m;
  }, [skills, stats]);

  const defaultStats = useMemo(() => stats.filter((s) => s.isDefault), [stats]);
  const totalLevel = useMemo(
    () => picks.reduce((sum, p) => sum + p.level, 0),
    [picks],
  );
  // Skill choices come from the starting class (the 5e source of initial skills).
  const skillSelection = useMemo(() => {
    const startId = startingClassId ?? picks[0]?.classId;
    const cls = classes.find((c) => c.id === startId);
    return cls?.selections.find((s) => s.type === SelectionType.Skill) ?? null;
  }, [classes, startingClassId, picks]);

  // Proficiency grants unioned across the chosen classes (by category id + item id).
  const proficiency = useMemo(() => {
    const armorCats = new Set<string>();
    const armorIds = new Set<string>();
    const weaponCats = new Set<string>();
    const weaponIds = new Set<string>();
    const primaryStats = new Set<string>();
    for (const p of picks) {
      const cls = classes.find((c) => c.id === p.classId);
      if (!cls) continue;
      cls.armorProficiencies?.categories.forEach((c) => armorCats.add(c.id));
      cls.armorProficiencies?.armors.forEach((a) => armorIds.add(a.id));
      cls.weaponProficiencies?.categories.forEach((c) => weaponCats.add(c.id));
      cls.weaponProficiencies?.weapons.forEach((w) => weaponIds.add(w.id));
      cls.primaryAbilities?.forEach((a) => primaryStats.add(a.id));
    }
    return { armorCats, armorIds, weaponCats, weaponIds, primaryStats };
  }, [picks, classes]);

  const armorProficient = (a: ArmorResponse) =>
    proficiency.armorCats.has(a.armorCategoryId) || proficiency.armorIds.has(a.id);
  const weaponProficient = (w: WeaponResponse) =>
    proficiency.weaponCats.has(w.weaponCategoryId) ||
    proficiency.weaponIds.has(w.id);

  const pointsSpent = useMemo(
    () =>
      abilityMode === "pointbuy"
        ? defaultStats.reduce(
            (sum, s) => sum + pointCost(abilities[s.id] ?? POINT_MIN),
            0,
          )
        : 0,
    [abilityMode, defaultStats, abilities],
  );
  const pointsRemaining = POINT_BUDGET - pointsSpent;

  const abilitiesComplete =
    defaultStats.length > 0 &&
    defaultStats.every((s) => {
      const v = abilities[s.id];
      if (!Number.isInteger(v)) return false;
      return abilityMode === "pointbuy"
        ? v >= POINT_MIN && v <= POINT_MAX
        : v >= 1 && v <= 30;
    }) &&
    // Point-buy must allocate the full budget (no leftover points).
    (abilityMode !== "pointbuy" || pointsRemaining === 0);
  const classesValid =
    picks.length >= 1 &&
    totalLevel <= MAX_TOTAL_LEVEL &&
    (picks.length === 1 || !!startingClassId);
  // The class's skill choice must be fully made (exactly `choose`), if it has one.
  const skillsComplete =
    !skillSelection || skillIds.length === skillSelection.choose;

  const canAdvance = [
    !!raceId, // Race
    classesValid, // Class
    abilitiesComplete, // Abilities
    skillsComplete, // Skills
    true, // Equipment (optional)
    false, // Review (uses Create)
  ][step];

  // Everything that must hold before "Create".
  const createMissing = [
    name.trim().length === 0 ? "a name" : null,
    !raceId ? "a race" : null,
    !classesValid
      ? picks.length === 0
        ? "a class"
        : !startingClassId
          ? "a starting class"
          : "class levels totalling ≤ 20"
      : null,
    !abilitiesComplete
      ? abilityMode === "pointbuy" && pointsRemaining !== 0
        ? `all ability points spent (${pointsRemaining} left)`
        : "all ability scores"
      : null,
    !skillsComplete
      ? `${skillSelection?.choose} skill${skillSelection?.choose === 1 ? "" : "s"} (${skillIds.length}/${skillSelection?.choose})`
      : null,
  ].filter(Boolean);
  const canCreate = createMissing.length === 0;

  // Per-step validity (Equipment is optional → always satisfied). Drives the
  // StepNav coloring: a prior step is only "done" (green) if it actually passes.
  const stepValid = [
    !!raceId,
    classesValid,
    abilitiesComplete,
    skillsComplete,
    true,
    canCreate,
  ];

  // Reason the current step's Next is blocked (shown inline near the nav).
  const stepReason = [
    !raceId ? "Pick a race to continue." : "",
    !classesValid
      ? picks.length === 0
        ? "Add at least one class."
        : !startingClassId
          ? "Choose which class is the starting class."
          : "Class levels must total 20 or fewer."
      : "",
    !abilitiesComplete
      ? abilityMode === "pointbuy" && pointsRemaining !== 0
        ? `Spend all ability points — ${pointsRemaining} left.`
        : "Set every ability score."
      : "",
    !skillsComplete && skillSelection
      ? `Choose ${skillSelection.choose} skill${skillSelection.choose === 1 ? "" : "s"} — ${skillIds.length}/${skillSelection.choose} selected.`
      : "",
    "",
    "",
  ][step];

  // ---- Class list handlers (multiclass) ----
  function addClass(id: string) {
    setPicks((prev) => {
      if (prev.some((p) => p.classId === id)) return prev;
      if (totalLevel >= MAX_TOTAL_LEVEL) return prev;
      return [...prev, { classId: id, level: 1 }];
    });
    setStartingClassId((prev) => prev ?? id); // first class added is the default start
  }
  function setClassLevel(id: string, level: number) {
    setPicks((prev) => {
      const others = prev.reduce(
        (sum, p) => (p.classId === id ? sum : sum + p.level),
        0,
      );
      const capped = Math.min(level, MAX_TOTAL_LEVEL - others);
      const clamped = Math.max(1, Math.min(20, capped));
      return prev.map((p) => (p.classId === id ? { ...p, level: clamped } : p));
    });
  }
  function removeClass(id: string) {
    setPicks((prev) => prev.filter((p) => p.classId !== id));
    setStartingClassId((prev) =>
      prev === id ? (picks.find((p) => p.classId !== id)?.classId ?? null) : prev,
    );
  }

  function changeAbilityMode(mode: AbilityMode) {
    setAbilityMode(mode);
    setAbilities((prev) => {
      const next = { ...prev };
      for (const s of defaultStats) {
        const v = next[s.id];
        if (mode === "pointbuy") {
          // Pull any out-of-range scores back into 8–15 so the budget is meaningful.
          next[s.id] = Math.max(POINT_MIN, Math.min(POINT_MAX, v ?? POINT_MIN));
        } else {
          // Manual baseline is 10: bump unset stats and untouched point-buy
          // floors (8) up to 10; keep anything the user explicitly raised.
          next[s.id] = v === undefined || v === POINT_MIN ? MANUAL_DEFAULT : v;
        }
      }
      return next;
    });
  }

  function toggleSkill(id: string) {
    setSkillIds((prev) => toggleCapped(prev, id, skillSelection?.choose));
  }
  function toggleWeapon(id: string) {
    setWeaponIds((prev) => toggleCapped(prev, id, undefined));
  }

  async function create() {
    if (!canCreate || !raceId) return;
    setBusy(true);
    setError(null);
    const payload: CharacterRequest = {
      name: name.trim(),
      raceId,
      classes: picks,
      // Single-class: backend defaults the starting class; multiclass: required.
      startingClassId:
        picks.length > 1 ? (startingClassId ?? undefined) : undefined,
      abilityScores: defaultStats.map((s) => ({
        statId: s.id,
        value: abilities[s.id],
      })),
      spellSlots: 0,
      alignment,
      experience: 0,
      age,
      hasJackOfAllTrades: false,
      skillProficiencies: skillIds.map((id) => ({
        skillId: id,
        level: SkillProficiencyLevel.Proficient,
      })),
      armorId: armorId ?? undefined,
      shieldId: shieldId ?? undefined,
      equippedWeaponIds: weaponIds.length ? weaponIds : undefined,
    };
    try {
      const created = await characters.create(payload);
      navigate(`/character/${created.id}`);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <div className="container builder">
      <div className="builder__head">
        <h1>New Character</h1>
        <Link to="/vault" className="btn btn--ghost">
          Cancel
        </Link>
      </div>

      <BuilderDetails
        name={name}
        onName={setName}
        age={age}
        onAge={setAge}
        alignment={alignment}
        onAlignment={setAlignment}
      />

      <StepNav current={step} valid={stepValid} onGo={setStep} />

      <div className="panel builder__body anim-fade-in" key={step}>
        {step === 0 && (
          <PickList
            label="race"
            items={races}
            selectedId={raceId}
            onPick={setRaceId}
          />
        )}

        {step === 1 && (
          <ClassStep
            classes={classes}
            picks={picks}
            totalLevel={totalLevel}
            startingClassId={startingClassId}
            onAdd={addClass}
            onLevel={setClassLevel}
            onRemove={removeClass}
            onSetStart={setStartingClassId}
          />
        )}

        {step === 2 && (
          <AbilitiesStep
            mode={abilityMode}
            onMode={changeAbilityMode}
            remaining={pointsRemaining}
            stats={defaultStats}
            abilities={abilities}
            primaryStats={proficiency.primaryStats}
            onChange={(statId, value) =>
              setAbilities((prev) => ({ ...prev, [statId]: value }))
            }
          />
        )}

        {step === 3 && (
          <SkillsStep
            selection={skillSelection}
            chosen={skillIds}
            hasClass={picks.length > 0}
            onToggle={toggleSkill}
            abilityFor={skillAbility}
          />
        )}

        {step === 4 && (
          <EquipmentStep
            armors={armors}
            weapons={weapons}
            armorId={armorId}
            shieldId={shieldId}
            weaponIds={weaponIds}
            onArmor={setArmorId}
            onShield={setShieldId}
            onToggleWeapon={toggleWeapon}
            hasClass={picks.length > 0}
            armorProficient={armorProficient}
            weaponProficient={weaponProficient}
          />
        )}

        {step === 5 && (
          <Review
            name={name}
            raceName={races.find((r) => r.id === raceId)?.name}
            picks={picks}
            classes={classes}
            startingClassId={startingClassId}
            alignment={alignment}
            stats={defaultStats}
            abilities={abilities}
            skillNames={
              skillSelection?.options
                .filter((o) => skillIds.includes(o.optionId))
                .map((o) => o.name) ?? []
            }
            armorName={armors.find((a) => a.id === armorId)?.name}
            shieldName={armors.find((a) => a.id === shieldId)?.name}
            weaponNames={weapons
              .filter((w) => weaponIds.includes(w.id))
              .map((w) => w.name)}
          />
        )}
      </div>

      {error && <p className="builder__error">{error}</p>}

      {/* Inline validation guidance: per-step block reason, or what's missing to create. */}
      {step === STEPS.length - 1
        ? !canCreate && (
            <p className="builder__validation">
              Still needed: {createMissing.join(", ")}.
            </p>
          )
        : !canAdvance &&
          stepReason && <p className="builder__validation">{stepReason}</p>}

      <BuilderNav
        isLast={step === STEPS.length - 1}
        busy={busy}
        canAdvance={canAdvance}
        canCreate={canCreate}
        onBack={() => setStep((s) => s - 1)}
        onNext={() => setStep((s) => s + 1)}
        onCreate={create}
        backDisabled={step === 0 || busy}
      />
    </div>
  );
}

// Toggle an id in a string[] respecting an optional max selection count.
function toggleCapped(
  prev: string[],
  id: string,
  max: number | null | undefined,
): string[] {
  if (prev.includes(id)) return prev.filter((x) => x !== id);
  if (max !== null && max !== undefined && prev.length >= max) return prev;
  return [...prev, id];
}

function BuilderNav({
  isLast,
  busy,
  canAdvance,
  canCreate,
  onBack,
  onNext,
  onCreate,
  backDisabled,
}: {
  isLast: boolean;
  busy: boolean;
  canAdvance: boolean;
  canCreate: boolean;
  onBack: () => void;
  onNext: () => void;
  onCreate: () => void;
  backDisabled: boolean;
}) {
  return (
    <div className="builder__nav">
      <button className="btn" disabled={backDisabled} onClick={onBack}>
        Back
      </button>
      {isLast ? (
        <button
          className="btn btn--primary"
          disabled={!canCreate || busy}
          onClick={onCreate}
        >
          {busy ? "Creating..." : "Create Character"}
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

function PickList({
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

function BuilderDetails({
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

function StepNav({
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

function ClassStep({
  classes,
  picks,
  totalLevel,
  startingClassId,
  onAdd,
  onLevel,
  onRemove,
  onSetStart,
}: {
  classes: ClassResponse[];
  picks: CharacterClassRequest[];
  totalLevel: number;
  startingClassId: string | null;
  onAdd: (id: string) => void;
  onLevel: (id: string, level: number) => void;
  onRemove: (id: string) => void;
  onSetStart: (id: string) => void;
}) {
  const added = new Set(picks.map((p) => p.classId));
  const available = classes.filter((c) => !added.has(c.id));
  return (
    <>
      <p className="text-muted builder__hint">
        Add one or more classes (total level ≤ {MAX_TOTAL_LEVEL}). The{" "}
        <strong>starting class</strong> grants saving-throw proficiencies and the
        maxed first hit die.
      </p>
      {picks.length > 0 && (
        <ul className="builder__classlist">
          {picks.map((p) => {
            const cls = classes.find((c) => c.id === p.classId);
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

function AbilitiesStep({
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
              primary={primaryStats.has(s.id)}
              value={abilities[s.id] ?? POINT_MIN}
              remaining={remaining}
              onChange={(v) => onChange(s.id, v)}
            />
          ) : (
            <label key={s.id} className="builder__ability">
              <span className="builder__ability-name">
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
  primary,
  value,
  remaining,
  onChange,
}: {
  name: string;
  primary: boolean;
  value: number;
  remaining: number;
  onChange: (v: number) => void;
}) {
  const nextCost = pointCost(value + 1) - pointCost(value);
  return (
    <div className="builder__ability">
      <span className="builder__ability-name">
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

function SkillsStep({
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

function EquipmentStep({
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
  const bodyArmors = armors.filter((a) => !a.isShield).map(armorOption);
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
            {weapons.map((w) => {
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
          The sheet shows the real (penalized) AC and attack bonuses after
          creation. Hover an item for details.
        </p>
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

function Review({
  name,
  raceName,
  picks,
  classes,
  startingClassId,
  alignment,
  stats,
  abilities,
  skillNames,
  armorName,
  shieldName,
  weaponNames,
}: {
  name: string;
  raceName?: string;
  picks: CharacterClassRequest[];
  classes: ClassResponse[];
  startingClassId: string | null;
  alignment: Alignment;
  stats: StatResponse[];
  abilities: Record<string, number>;
  skillNames: string[];
  armorName?: string;
  shieldName?: string;
  weaponNames: string[];
}) {
  const alignmentLabel =
    ALIGNMENTS.find((a) => a.value === alignment)?.label ?? "—";
  const classLine =
    picks
      .map((p) => {
        const cls = classes.find((c) => c.id === p.classId);
        const star = picks.length > 1 && p.classId === startingClassId ? "★" : "";
        return `${cls?.name ?? "?"} ${p.level}${star}`;
      })
      .join(" / ") || "No class";
  const gear = [
    armorName,
    shieldName ? `${shieldName} (shield)` : null,
    ...weaponNames,
  ].filter(Boolean);
  return (
    <div className="builder__review">
      <h2 className="builder__review-name">{name || "Unnamed hero"}</h2>
      <p className="text-muted">
        {raceName ?? "No race"} · {classLine} · {alignmentLabel}
      </p>
      <div className="builder__review-abilities">
        {stats.map((s) => (
          <div key={s.id} className="builder__review-ability">
            <span className="builder__ability-name">{s.code ?? s.name}</span>
            <strong>{abilities[s.id] ?? "—"}</strong>
          </div>
        ))}
      </div>
      {skillNames.length > 0 && (
        <p className="text-muted">Skills: {skillNames.join(", ")}</p>
      )}
      {gear.length > 0 && (
        <p className="text-muted">Equipment: {gear.join(", ")}</p>
      )}
    </div>
  );
}
