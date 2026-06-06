import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { characters, reference } from "../api/endpoints";
import {
  Alignment,
  SelectionType,
  SkillProficiencyLevel,
  type ArmorResponse,
  type BackgroundResponse,
  type CharacterClassRequest,
  type CharacterRequest,
  type CharacterResponse,
  type ClassResponse,
  type FeatResponse,
  type InventoryItemRequest,
  type ItemResponse,
  type RaceResponse,
  type SelectionResponse,
  type SkillResponse,
  type StatResponse,
  type WeaponResponse,
} from "../api/types";
import {
  AbilitiesStep,
  BackgroundStep,
  BuilderDetails,
  BuilderNav,
  ClassStep,
  describeError,
  EquipmentStep,
  FeatsStep,
  MANUAL_DEFAULT,
  MAX_TOTAL_LEVEL,
  PickList,
  POINT_BUDGET,
  POINT_MAX,
  POINT_MIN,
  pointCost,
  Review,
  SkillsStep,
  STEPS,
  StepNav,
  toggleCapped,
  ZERO_COINS,
  type AbilityMode,
  type Coins,
} from "./CharacterBuilder.steps";
import "./CharacterBuilder.css";

/**
 * Character create/edit wizard. Collects a CharacterRequest: name, race, one or
 * more classes (multiclass, levels summing to <=20, with a designated starting
 * class and an optional subclass once the class reaches its subclass level), base
 * ability scores, optional class skill choices, an optional background (with its
 * language choices), optional feats, and equipped armor/shield/weapons plus carried
 * inventory + coin. POSTs via characters.create() at /character/new, or — when
 * mounted at /character/:id/edit — loads the character, prefills, and PUTs via
 * characters.update(). On edit it preserves fields the wizard doesn't expose (HP/AC
 * overrides, known spells, status effects, character details, narrative) by carrying
 * them through from the loaded response, and relaxes Selection budgets so re-submitting
 * already-granted skills/languages isn't rejected.
 */
export default function CharacterBuilder() {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = !!editId;
  const [step, setStep] = useState(0);

  // Reference data.
  const [races, setRaces] = useState<RaceResponse[]>([]);
  const [classes, setClasses] = useState<ClassResponse[]>([]);
  const [stats, setStats] = useState<StatResponse[]>([]);
  const [skills, setSkills] = useState<SkillResponse[]>([]);
  const [armors, setArmors] = useState<ArmorResponse[]>([]);
  const [weapons, setWeapons] = useState<WeaponResponse[]>([]);
  const [feats, setFeats] = useState<FeatResponse[]>([]);
  const [backgrounds, setBackgrounds] = useState<BackgroundResponse[]>([]);
  const [items, setItems] = useState<ItemResponse[]>([]);

  // Selections.
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [age, setAge] = useState(0);
  const [alignment, setAlignment] = useState<Alignment>(Alignment.TrueNeutral);
  const [raceId, setRaceId] = useState<string | null>(null);
  const [picks, setPicks] = useState<CharacterClassRequest[]>([]);
  const [startingClassId, setStartingClassId] = useState<string | null>(null);
  const [abilities, setAbilities] = useState<Record<string, number>>({});
  const [abilityMode, setAbilityMode] = useState<AbilityMode>("pointbuy");
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [backgroundId, setBackgroundId] = useState<string | null>(null);
  const [languageIds, setLanguageIds] = useState<string[]>([]);
  const [featIds, setFeatIds] = useState<string[]>([]);
  const [armorId, setArmorId] = useState<string | null>(null);
  const [shieldId, setShieldId] = useState<string | null>(null);
  const [weaponIds, setWeaponIds] = useState<string[]>([]);
  const [inventory, setInventory] = useState<InventoryItemRequest[]>([]);
  const [coins, setCoins] = useState<Coins>(ZERO_COINS);

  // Edit mode: the loaded character (carries fields the wizard doesn't edit).
  const [original, setOriginal] = useState<CharacterResponse | null>(null);

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
        // Edit mode prefills real base scores instead (see the load effect below).
        if (!editId)
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
    reference.feats().then(setFeats).catch(() => setFeats([]));
    reference.backgrounds().then(setBackgrounds).catch(() => setBackgrounds([]));
    reference.items().then(setItems).catch(() => setItems([]));
  }, [editId]);

  // Edit mode: load the existing character and prefill every wizard-owned field.
  // Backgrounds are fetched alongside so the chosen background-language picks can be
  // recovered (the only languages the wizard re-submits) — all writes happen inside
  // the promise callback, never synchronously in the effect body.
  useEffect(() => {
    if (!editId) return;
    Promise.all([characters.get(editId), reference.backgrounds()])
      .then(([ch, bgs]) => {
        setOriginal(ch);
        setName(ch.name);
        setDescription(ch.description ?? "");
        setAge(ch.age);
        setAlignment(ch.alignment);
        setRaceId(ch.race?.id ?? null);
        setPicks(
          ch.classes.map((c) => ({
            classId: c.classId,
            level: c.level,
            subclassId: c.subclassId ?? undefined,
          })),
        );
        setStartingClassId(ch.startingClassId ?? ch.classes[0]?.classId ?? null);
        setAbilityMode("manual");
        setAbilities(
          Object.fromEntries(ch.abilityScores.map((a) => [a.statId, a.base])),
        );
        setSkillIds(ch.skills.filter((s) => s.isProficient).map((s) => s.skillId));
        setBackgroundId(ch.background?.id ?? null);
        setFeatIds(ch.feats.map((f) => f.id));
        setArmorId(ch.equippedArmor?.id ?? null);
        setShieldId(ch.equippedShield?.id ?? null);
        setWeaponIds(ch.equippedWeapons.map((w) => w.id));
        setInventory(
          ch.inventory.map((i) => ({
            itemId: i.itemId,
            quantity: i.quantity,
            isAttuned: i.isAttuned,
          })),
        );
        setCoins({
          cp: ch.copperPieces,
          sp: ch.silverPieces,
          ep: ch.electrumPieces,
          gp: ch.goldPieces,
          pp: ch.platinumPieces,
        });
        // Recover which of the character's languages were the background-Selection picks.
        const sel = bgs
          .find((b) => b.id === ch.background?.id)
          ?.selections.find((s) => s.type === SelectionType.Language);
        if (sel) {
          const optionIds = new Set(sel.options.map((o) => o.optionId));
          setLanguageIds(
            ch.languages.filter((l) => optionIds.has(l.id)).map((l) => l.id),
          );
        }
      })
      .catch((err) => setError(describeError(err)));
  }, [editId]);

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

  const selectedBackground = useMemo(
    () => backgrounds.find((b) => b.id === backgroundId) ?? null,
    [backgrounds, backgroundId],
  );
  // A background's "languages of your choice" Selection (e.g. Acolyte's two).
  const bgLanguageSelection = useMemo(
    () =>
      selectedBackground?.selections.find(
        (s) => s.type === SelectionType.Language,
      ) ?? null,
    [selectedBackground],
  );

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
  // Edit re-submits already-granted skills with the homebrew flag, so don't gate it there.
  const skillsComplete =
    isEdit || !skillSelection || skillIds.length === skillSelection.choose;
  // A chosen background's language Selection must be satisfied (relaxed on edit).
  const languagesComplete =
    isEdit ||
    !bgLanguageSelection ||
    languageIds.length === bgLanguageSelection.choose;

  const canAdvance = [
    !!raceId, // Race
    classesValid, // Class
    abilitiesComplete, // Abilities
    skillsComplete, // Skills
    languagesComplete, // Background (only the language pick can block)
    true, // Feats (optional)
    true, // Equipment (optional)
    false, // Review (uses Save)
  ][step];

  // Everything that must hold before saving.
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
    !languagesComplete
      ? `${bgLanguageSelection?.choose} background language${bgLanguageSelection?.choose === 1 ? "" : "s"} (${languageIds.length}/${bgLanguageSelection?.choose})`
      : null,
  ].filter(Boolean);
  const canCreate = createMissing.length === 0;

  // Per-step validity (optional steps are always satisfied). Drives the StepNav
  // coloring: a prior step is only "done" (green) if it actually passes.
  const stepValid = [
    !!raceId,
    classesValid,
    abilitiesComplete,
    skillsComplete,
    languagesComplete,
    true,
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
    !languagesComplete && bgLanguageSelection
      ? `Choose ${bgLanguageSelection.choose} background language${bgLanguageSelection.choose === 1 ? "" : "s"} — ${languageIds.length}/${bgLanguageSelection.choose} selected.`
      : "",
    "",
    "",
    "",
  ][step];

  // ---- Class list handlers (multiclass) ----
  function subclassSelectionFor(classId: string): SelectionResponse | null {
    return (
      classes
        .find((c) => c.id === classId)
        ?.selections.find((s) => s.type === SelectionType.Subclass) ?? null
    );
  }
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
      return prev.map((p) => {
        if (p.classId !== id) return p;
        // Drop a now-ineligible subclass if the level fell below its grant level.
        const sel = subclassSelectionFor(id);
        const keepSub = sel ? clamped >= sel.level : false;
        return { ...p, level: clamped, subclassId: keepSub ? p.subclassId : undefined };
      });
    });
  }
  function setClassSubclass(id: string, subclassId: string | null) {
    setPicks((prev) =>
      prev.map((p) =>
        p.classId === id ? { ...p, subclassId: subclassId ?? undefined } : p,
      ),
    );
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
  function toggleLanguage(id: string) {
    setLanguageIds((prev) => toggleCapped(prev, id, bgLanguageSelection?.choose));
  }
  function toggleFeat(id: string) {
    setFeatIds((prev) => toggleCapped(prev, id, undefined));
  }
  function toggleWeapon(id: string) {
    setWeaponIds((prev) => toggleCapped(prev, id, undefined));
  }

  // ---- Inventory handlers ----
  function addInventory(itemId: string) {
    setInventory((prev) => {
      const existing = prev.find((i) => i.itemId === itemId);
      if (existing)
        return prev.map((i) =>
          i.itemId === itemId ? { ...i, quantity: (i.quantity ?? 1) + 1 } : i,
        );
      return [...prev, { itemId, quantity: 1, isAttuned: false }];
    });
  }
  function setInventoryQty(itemId: string, quantity: number) {
    setInventory((prev) =>
      quantity <= 0
        ? prev.filter((i) => i.itemId !== itemId)
        : prev.map((i) => (i.itemId === itemId ? { ...i, quantity } : i)),
    );
  }
  function toggleAttune(itemId: string) {
    setInventory((prev) =>
      prev.map((i) =>
        i.itemId === itemId ? { ...i, isAttuned: !i.isAttuned } : i,
      ),
    );
  }
  function removeInventory(itemId: string) {
    setInventory((prev) => prev.filter((i) => i.itemId !== itemId));
  }

  function buildPayload(): CharacterRequest {
    const payload: CharacterRequest = {
      name: name.trim(),
      description: description.trim() || undefined,
      raceId: raceId!,
      classes: picks.map((p) => ({
        classId: p.classId,
        level: p.level,
        subclassId: p.subclassId ?? undefined,
      })),
      // Single-class: backend defaults the starting class; multiclass: required.
      startingClassId:
        picks.length > 1 ? (startingClassId ?? undefined) : undefined,
      abilityScores: defaultStats.map((s) => ({
        statId: s.id,
        value: abilities[s.id],
      })),
      spellSlots: original?.spellSlots ?? 0,
      alignment,
      experience: original?.experience ?? 0,
      age,
      hasJackOfAllTrades: original?.hasJackOfAllTrades ?? false,
      skillProficiencies: skillIds.map((id) => ({
        skillId: id,
        level: SkillProficiencyLevel.Proficient,
      })),
      backgroundId: backgroundId ?? undefined,
      languageIds: languageIds.length ? languageIds : undefined,
      featIds: featIds.length ? featIds : undefined,
      armorId: armorId ?? undefined,
      shieldId: shieldId ?? undefined,
      equippedWeaponIds: weaponIds.length ? weaponIds : undefined,
      inventory: inventory.length ? inventory : undefined,
      copperPieces: coins.cp,
      silverPieces: coins.sp,
      electrumPieces: coins.ep,
      goldPieces: coins.gp,
      platinumPieces: coins.pp,
    };
    if (isEdit && original) {
      // Carry through everything the wizard doesn't expose so the PUT doesn't wipe it.
      payload.hitPointsOverride = original.hitPointsOverride ?? undefined;
      payload.armorClassOverride = original.armorClassOverride ?? undefined;
      payload.spellIds = original.spells.length
        ? original.spells.map((s) => s.id)
        : undefined;
      payload.statusEffects = original.statusEffects.length
        ? original.statusEffects.map((s) => ({
            statusEffectId: s.statusEffectId,
            source: s.source ?? undefined,
          }))
        : undefined;
      payload.personalityTraits = original.personalityTraits ?? undefined;
      payload.ideals = original.ideals ?? undefined;
      payload.bonds = original.bonds ?? undefined;
      payload.flaws = original.flaws ?? undefined;
      payload.backstory = original.backstory ?? undefined;
      payload.height = original.height ?? undefined;
      payload.weight = original.weight ?? undefined;
      payload.eyes = original.eyes ?? undefined;
      payload.skin = original.skin ?? undefined;
      payload.hair = original.hair ?? undefined;
      // Re-submitting class-granted skills/languages would bust the Selection budgets;
      // the homebrew flag relaxes the subset/count checks (level gates still apply).
      payload.allowHomebrewSelections = true;
    }
    return payload;
  }

  async function save() {
    if (!canCreate || !raceId) return;
    setBusy(true);
    setError(null);
    try {
      const saved =
        isEdit && editId
          ? await characters.update(editId, buildPayload())
          : await characters.create(buildPayload());
      navigate(`/character/${saved.id}`);
    } catch (err) {
      setError(describeError(err));
      setBusy(false);
    }
  }

  return (
    <div className="container builder">
      <div className="builder__head">
        <h1>{isEdit ? "Edit Character" : "New Character"}</h1>
        <Link
          to={isEdit ? `/character/${editId}` : "/vault"}
          className="btn btn--ghost"
        >
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
            onSetSubclass={setClassSubclass}
            subclassSelectionFor={subclassSelectionFor}
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
          <BackgroundStep
            backgrounds={backgrounds}
            selectedId={backgroundId}
            onPick={setBackgroundId}
            languageSelection={bgLanguageSelection}
            chosenLanguages={languageIds}
            onToggleLanguage={toggleLanguage}
          />
        )}

        {step === 5 && (
          <FeatsStep feats={feats} chosen={featIds} onToggle={toggleFeat} />
        )}

        {step === 6 && (
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
            items={items}
            inventory={inventory}
            onAddItem={addInventory}
            onItemQty={setInventoryQty}
            onToggleAttune={toggleAttune}
            onRemoveItem={removeInventory}
            coins={coins}
            onCoins={setCoins}
          />
        )}

        {step === 7 && (
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
            backgroundName={selectedBackground?.name}
            languageNames={
              bgLanguageSelection?.options
                .filter((o) => languageIds.includes(o.optionId))
                .map((o) => o.name) ?? []
            }
            featNames={feats
              .filter((f) => featIds.includes(f.id))
              .map((f) => f.name)}
            armorName={armors.find((a) => a.id === armorId)?.name}
            shieldName={armors.find((a) => a.id === shieldId)?.name}
            weaponNames={weapons
              .filter((w) => weaponIds.includes(w.id))
              .map((w) => w.name)}
            itemCount={inventory.reduce((n, i) => n + (i.quantity ?? 1), 0)}
            coins={coins}
          />
        )}
      </div>

      {error && <p className="builder__error">{error}</p>}

      {/* Inline validation guidance: per-step block reason, or what's missing to save. */}
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
        isEdit={isEdit}
        busy={busy}
        canAdvance={canAdvance}
        canCreate={canCreate}
        onBack={() => setStep((s) => s - 1)}
        onNext={() => setStep((s) => s + 1)}
        onCreate={save}
        backDisabled={step === 0 || busy}
      />
    </div>
  );
}
