// Suite B — Above-level-1 creation correctness.
//  - Convergence invariant: build-at-L20 must equal level-up-1->20 for the same
//    choices (the strongest cross-path test).
//  - Required-choice checks: ASIs / feats / subclass folded at creation.
//  - Spell gate negatives (cap / subset / level) and the creation negative matrix.
import { walkToMax, baselineCreateBody } from "../lib/levelup.mjs";

const levelled = (char) => (char.spells || []).filter((s) => (s.level ?? 1) > 0).length;

// Assemble a single level-20 create body that replays every choice the walk made.
function convergenceBody(cls, ctx, walk) {
  const base = baselineCreateBody(cls, ctx);
  base.name = `Conv ${cls.name}`;
  base.classes = [{ classId: cls.id, level: 20 }];

  const abilityImprovements = [];
  const fightingStyleIds = new Set(base.fightingStyleIds || []);
  const metamagicIds = new Set();
  const eldritchInvocationIds = new Set();
  const expertise = new Set();
  const extraSpellIds = [];
  let subclassId = null;

  for (const { plan, applyBody } of walk.history) {
    if (applyBody.subclassId) subclassId = applyBody.subclassId;
    if (applyBody.abilityImprovements) abilityImprovements.push(...applyBody.abilityImprovements);
    if (applyBody.cantripIds) extraSpellIds.push(...applyBody.cantripIds);
    if (applyBody.spellIds) extraSpellIds.push(...applyBody.spellIds);
    if (applyBody.featureChoices) {
      const sels = (plan.featureChoices || []).map((x) => x.selection || x);
      for (const fc of applyBody.featureChoices) {
        const type = sels.find((s) => s.id === fc.selectionId)?.type;
        if (type === 4) fc.optionIds.forEach((id) => fightingStyleIds.add(id));
        else if (type === 6) fc.optionIds.forEach((id) => metamagicIds.add(id));
        else if (type === 7) fc.optionIds.forEach((id) => eldritchInvocationIds.add(id));
        else if (type === 5) fc.optionIds.forEach((id) => expertise.add(id));
      }
    }
  }

  if (subclassId) base.classes[0].subclassId = subclassId;
  if (abilityImprovements.length) base.abilityImprovements = abilityImprovements;
  const allSpells = [...new Set([...(base.spellIds || []), ...extraSpellIds])];
  if (allSpells.length) base.spellIds = allSpells;
  if (fightingStyleIds.size) base.fightingStyleIds = [...fightingStyleIds];
  if (metamagicIds.size) base.metamagicIds = [...metamagicIds];
  if (eldritchInvocationIds.size) base.eldritchInvocationIds = [...eldritchInvocationIds];
  if (expertise.size) {
    base.skillProficiencies = base.skillProficiencies || [];
    for (const sp of base.skillProficiencies) if (expertise.has(sp.skillId)) sp.level = 2;
    for (const id of expertise) {
      if (!base.skillProficiencies.some((s) => s.skillId === id)) base.skillProficiencies.push({ skillId: id, level: 2 });
    }
  }
  base.allowHomebrewSelections = true; // match the relaxations the walk used
  return base;
}

function compareConverged(t, cls, w, c) {
  const px = `${cls.name} convergence`;
  t.eq(`${px}: level`, c.level, w.level);
  t.eq(`${px}: maxHitPoints`, c.maxHitPoints, w.maxHitPoints);
  t.eq(`${px}: proficiencyBonus`, c.proficiencyBonus, w.proficiencyBonus);
  // Order-independent: the two characters list abilityScores in different orders.
  const eff = (x) => x.abilityScores.map((a) => `${a.name}=${a.effective}`).sort().join(",");
  t.eq(`${px}: ability effectives`, eff(c), eff(w));
  const names = (x) => (x.features || []).map((f) => f.name).sort();
  t.eq(`${px}: feature set`, names(c), names(w));
  t.eq(`${px}: levelled spell count`, levelled(c), levelled(w));
  t.eq(`${px}: fightingStyles`, (c.fightingStyles || []).length, (w.fightingStyles || []).length);
  t.eq(`${px}: metamagics`, (c.metamagics || []).length, (w.metamagics || []).length);
  t.eq(`${px}: eldritchInvocations`, (c.eldritchInvocations || []).length, (w.eldritchInvocations || []).length);
}

async function convergence(client, ctx, t) {
  t.startSection("convergence (build-at-20 == levelup-1->20)");
  for (const cls of ctx.classes) {
    if (ctx.only && !ctx.only.has(cls.name)) continue;
    const walk = await walkToMax(client, cls, ctx);
    if (walk.error || !walk.char) {
      t.fail(`${cls.name}: convergence walk`, walk.error);
      continue;
    }
    const body = convergenceBody(cls, ctx, walk);
    const created = await client.post("/api/character", body);
    if (created.status >= 400) {
      // Creation could not replay the level-up choices (e.g. expertise on a
      // proficiency the create path doesn't accept) — a creation/level-up
      // asymmetry worth noting, not a hard engine failure.
      t.finding(`${cls.name}: convergence create rejected`, `${created.status} ${JSON.stringify(created.body)?.slice(0, 200)}`);
      continue;
    }
    ctx.track(`/api/character/${created.body.id}`, client);
    compareConverged(t, cls, walk.char, created.body);
  }
}

function baseBody(ctx, className, level, extra = {}) {
  const cls = ctx.classByName[className];
  return {
    name: `B ${className} L${level}`,
    raceId: ctx.baselineRace.id,
    classes: [{ classId: cls.id, level }],
    abilityScores: ctx.baselineAbilityScores(),
    alignment: 0,
    ...extra,
  };
}

async function requiredChoices(client, ctx, t) {
  t.startSection("required choices accounted for at creation");
  const S = ctx.statByCode;

  // ASI fold: Fighter L8 earns ASIs at 4,6,8 -> 3 legs (6 points into STR: 13 -> 19).
  const asiBody = baseBody(ctx, "Fighter", 8, {
    abilityImprovements: [
      { statId: S.STR.id, amount: 2 },
      { statId: S.STR.id, amount: 2 },
      { statId: S.STR.id, amount: 2 },
    ],
  });
  const asi = await client.post("/api/character", asiBody);
  if (t.status("Fighter L8 with 3 ASI legs accepted", asi, 201)) {
    ctx.track(`/api/character/${asi.body.id}`, client);
    const str = asi.body.abilityScores.find((a) => a.name === "Strength");
    t.eq("Fighter L8: STR improvementModifier folded (+6)", str.improvementModifier, 6);
    t.eq("Fighter L8: STR effective = 13+6", str.effective, 19);
  }

  // Under-applied ASIs: does creation enforce earned-ASI completeness?
  const under = await client.post("/api/character", baseBody(ctx, "Fighter", 8, {
    abilityImprovements: [{ statId: S.STR.id, amount: 2 }],
  }));
  if (under.status === 201) {
    ctx.track(`/api/character/${under.body.id}`, client);
    t.finding("creation does not enforce earned-ASI completeness", "Fighter L8 accepted with 1 of 3 ASI legs (only levelup/apply forces it)");
  } else {
    t.statusOneOf("creation rejects under-applied ASIs", under, [400, 422]);
  }

  // Feat fold: pick a feat that grants an ability modifier, if one exists.
  const featWithMod = ctx.feats.find((f) => (f.abilityModifiers || []).length > 0);
  if (featWithMod) {
    const fb = await client.post("/api/character", baseBody(ctx, "Fighter", 4, { featIds: [featWithMod.id] }));
    if (t.status(`Fighter L4 with feat '${featWithMod.name}' accepted`, fb, 201)) {
      ctx.track(`/api/character/${fb.body.id}`, client);
      t.check("feat present on character", (fb.body.feats || []).some((f) => f.id === featWithMod.id));
      const mod = featWithMod.abilityModifiers[0];
      const stat = fb.body.abilityScores.find((a) => a.statId === mod.statId);
      t.check("feat ability modifier folded", stat && stat.featModifier >= mod.modifier,
        `expected featModifier >= ${mod.modifier}, got ${stat?.featModifier}`);
    }
  } else {
    t.finding("no feat with ability modifiers in catalog", "skipped feat-fold assertion");
  }

  // Subclass at creation (Fighter L3, Champion).
  const fighter = ctx.classByName["Fighter"];
  const sub = fighter.subclasses[0];
  const sb = await client.post("/api/character", baseBody(ctx, "Fighter", 3, {
    classes: [{ classId: fighter.id, level: 3, subclassId: sub.id }],
  }));
  if (t.status("Fighter L3 with subclass accepted", sb, 201)) {
    ctx.track(`/api/character/${sb.body.id}`, client);
    t.check("subclass set on character", !!sb.body.classes[0].subclass);
  }
}

async function spellGateNegatives(client, ctx, t) {
  t.startSection("spell gate negatives + minimum behavior");
  const wizard = ctx.classByName["Wizard"];
  const wizL1 = ctx.spells.filter((s) => s.level === 1 && (s.classes || []).includes("Wizard"));
  const wizCantrips = ctx.spells.filter((s) => s.level === 0 && (s.classes || []).includes("Wizard"));
  const nonWizSpell = ctx.spells.find((s) => s.level === 1 && !(s.classes || []).includes("Wizard"));
  const highLevel = ctx.spells.find((s) => s.level >= 3 && (s.classes || []).includes("Wizard"));

  // Over-fill prepared beyond cap (no homebrew) at L5.
  const over = await client.post("/api/character", baseBody(ctx, "Wizard", 5, {
    spellIds: [...wizCantrips.slice(0, 4), ...wizL1.slice(0, 12)].map((s) => s.id),
  }));
  t.statusOneOf("Wizard L5: over-cap prepared rejected", over, [400, 422]);

  // Off-class-list spell.
  if (nonWizSpell) {
    const off = await client.post("/api/character", baseBody(ctx, "Wizard", 5, { spellIds: [nonWizSpell.id] }));
    t.statusOneOf("Wizard L5: off-list spell rejected", off, [400, 422]);
  }

  // Spell above max castable level (level-3 spell on a L1 wizard).
  if (highLevel) {
    const tooHigh = await client.post("/api/character", baseBody(ctx, "Wizard", 1, { spellIds: [highLevel.id] }));
    t.statusOneOf("Wizard L1: too-high spell level rejected", tooHigh, [400, 422]);
  }

  // Minimum enforcement: a high-level caster with zero spells.
  const empty = await client.post("/api/character", baseBody(ctx, "Wizard", 11));
  if (empty.status === 201) {
    ctx.track(`/api/character/${empty.body.id}`, client);
    t.finding("creation does not enforce minimum spell counts", "Wizard L11 accepted with zero spells/spellbook (only levelup/apply forces counts)");
  } else {
    t.statusOneOf("creation rejects under-filled spellbook", empty, [400, 422]);
  }
}

async function multiclassAndNegatives(client, ctx, t) {
  t.startSection("multiclass creation + negative matrix");
  const S = ctx.statByCode;
  const fighter = ctx.classByName["Fighter"];
  const wizard = ctx.classByName["Wizard"];

  // Valid multiclass: Fighter 6 / Wizard 4, starting Fighter.
  const mc = await client.post("/api/character", {
    name: "B Multiclass", raceId: ctx.baselineRace.id, alignment: 0,
    abilityScores: ctx.baselineAbilityScores(),
    classes: [{ classId: fighter.id, level: 6 }, { classId: wizard.id, level: 4 }],
    startingClassId: fighter.id,
  });
  if (t.status("Fighter6/Wizard4 multiclass accepted", mc, 201)) {
    ctx.track(`/api/character/${mc.body.id}`, client);
    t.eq("multiclass total level", mc.body.level, 10);
    const proficientSaves = (mc.body.savingThrows || []).filter((s) => s.isProficient).map((s) => s.name).sort();
    t.check("save proficiencies from starting class (STR+CON)",
      proficientSaves.includes("Strength") && proficientSaves.includes("Constitution"),
      `proficient saves = ${proficientSaves.join(",")}`);
  }

  // Prereq fail: INT below 13 for the Wizard half (no homebrew).
  const lowInt = ctx.baselineAbilityScores().map((a) => (a.statId === S.INT.id ? { ...a, value: 10 } : a));
  const badMc = await client.post("/api/character", {
    name: "B MC bad", raceId: ctx.baselineRace.id, alignment: 0, abilityScores: lowInt,
    classes: [{ classId: fighter.id, level: 6 }, { classId: wizard.id, level: 4 }],
    startingClassId: fighter.id,
  });
  t.statusOneOf("multiclass prereq (INT<13) rejected", badMc, [400, 422]);

  // Negative matrix.
  const neg = async (name, body, codes = [400, 422]) =>
    t.statusOneOf(name, await client.post("/api/character", body), codes);

  await neg("empty classes rejected", baseBody(ctx, "Fighter", 1, { classes: [] }));
  await neg("total level > 20 rejected", {
    name: "B over20", raceId: ctx.baselineRace.id, alignment: 0, abilityScores: ctx.baselineAbilityScores(),
    classes: [{ classId: fighter.id, level: 15 }, { classId: wizard.id, level: 10 }], startingClassId: fighter.id,
  });
  await neg("duplicate class rejected", {
    name: "B dup", raceId: ctx.baselineRace.id, alignment: 0, abilityScores: ctx.baselineAbilityScores(),
    classes: [{ classId: fighter.id, level: 2 }, { classId: fighter.id, level: 2 }],
  });
  await neg("missing required stat rejected",
    baseBody(ctx, "Fighter", 1, { abilityScores: ctx.baselineAbilityScores().slice(0, 5) }));
  await neg("invalid alignment rejected", baseBody(ctx, "Fighter", 1, { alignment: 99 }));
  await neg("nonexistent race rejected",
    baseBody(ctx, "Fighter", 1, { raceId: "00000000-0000-0000-0000-000000000000" }));
}

export async function runSuiteB(client, ctx, t) {
  t.setSuite("B: creation correctness");
  await convergence(client, ctx, t);
  await requiredChoices(client, ctx, t);
  await spellGateNegatives(client, ctx, t);
  await multiclassAndNegatives(client, ctx, t);
}
