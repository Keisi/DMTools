// Suite A — Level-up 1 -> 20 for every class.
// Walks each class level by level, asserting the plan against the class's own
// declared progression data (engine-consistency) plus a few RAW spot-checks, and
// runs targeted negative tests at the first ASI level.
import { walkToMax, buildApply } from "../lib/levelup.mjs";

function assertPlan(t, plan, char, target, oracle, state) {
  const px = `${oracle.name} ->L${target}`;

  // --- Hit points ---
  t.eq(`${px}: hitDie`, plan.hitPoints.hitDie, oracle.hitDie);
  t.eq(`${px}: hp average`, plan.hitPoints.average, Math.floor(oracle.hitDie / 2) + 1);
  t.eq(`${px}: rollMin/Max`, [plan.hitPoints.rollMin, plan.hitPoints.rollMax], [1, oracle.hitDie]);
  const conMod = char.abilityScores.find((a) => a.name === "Constitution")?.modifier;
  t.eq(`${px}: conModifier matches API`, plan.hitPoints.conModifier, conMod);

  // --- ASI / feat due ---
  t.eq(`${px}: asiDue`, plan.abilityScoreImprovementDue, oracle.asiLevels.includes(target));

  // --- Subclass: offered exactly the first time target >= subclassLevel ---
  const expectSubclass = !state.subclassChosen && target >= oracle.subclassLevel;
  t.eq(`${px}: subclass offered`, !!plan.subclassChoice, expectSubclass);

  // --- Spells / cantrips (deltas from the progression table) ---
  if (oracle.isCaster && plan.spellChoices) {
    const cur = oracle.prog[target];
    const prev = oracle.prog[target - 1] || {};
    if (cur) {
      if (cur.cantripsKnown != null) {
        t.eq(`${px}: newCantrips`, plan.spellChoices.newCantrips, cur.cantripsKnown - (prev.cantripsKnown || 0));
      }
      // Known casters expose spellsKnown; Wizard exposes spellbookSize. The planner
      // folds both into spellChoices.newSpells, so assert against whichever is set.
      if (cur.spellsKnown != null) {
        t.eq(`${px}: newSpells (known)`, plan.spellChoices.newSpells, cur.spellsKnown - (prev.spellsKnown || 0));
      } else if (cur.spellbookSize != null) {
        t.eq(`${px}: newSpells (spellbook)`, plan.spellChoices.newSpells, cur.spellbookSize - (prev.spellbookSize || 0));
      }
      t.eq(`${px}: maxSpellLevel`, plan.spellChoices.maxSpellLevel, cur.maxSpellLevel);
    }
  }

  // --- Feature choices: if the catalog declares a featureSelection at this level,
  //     the plan must offer at least one (subclass-injected extras are allowed). ---
  if (oracle.featureSelLevels.has(target)) {
    t.check(`${px}: feature choice offered`, (plan.featureChoices || []).length > 0,
      `class declares a featureSelection at L${target} but plan.featureChoices is empty`);
  }
}

async function negativeTests(t, client, id, classId, oracle) {
  // Run at the first ASI level: drive the character there first, then probe.
  // (Called only when target === first ASI level, with a *fresh* plan available.)
  const pr = await client.post(`/api/character/${id}/levelup/plan`, { classId });
  if (pr.status >= 400) return;
  const plan = pr.body;

  // Bad HP roll (above die).
  const badRoll = await client.post(`/api/character/${id}/levelup/apply`, {
    classId, hitPoints: { mode: 1, rolledValue: oracle.hitDie + 5 },
  });
  t.statusOneOf(`${oracle.name}: out-of-range HP roll rejected`, badRoll, [400, 422]);

  // ASI + feat together (mutually exclusive). Use a real feat id if available.
  if (plan.abilityScoreImprovementDue) {
    const statId = oracle.baselineAbilityScores()[0].statId;
    const both = await client.post(`/api/character/${id}/levelup/apply`, {
      classId, hitPoints: { mode: 0 },
      abilityImprovements: [{ statId, amount: 2 }],
      featId: "00000000-0000-0000-0000-000000000000",
    });
    t.statusOneOf(`${oracle.name}: ASI+feat together rejected`, both, [400, 422]);

    // ASI sum != 2.
    const badSum = await client.post(`/api/character/${id}/levelup/apply`, {
      classId, hitPoints: { mode: 0 }, abilityImprovements: [{ statId, amount: 1 }],
    });
    t.statusOneOf(`${oracle.name}: ASI sum!=2 rejected`, badSum, [400, 422]);
  }
}

export async function runSuiteA(client, ctx, t) {
  t.setSuite("A: level-up 1->20");
  const only = ctx.only; // optional Set of class names
  for (const cls of ctx.classes) {
    if (only && !only.has(cls.name)) continue;
    t.startSection(cls.name);
    const oracle = ctx.oracleFor(cls);
    const state = { subclassChosen: false, negativesDone: false };

    const result = await walkToMax(client, cls, ctx, {
      onPlan: (plan, char, target) => {
        assertPlan(t, plan, char, target, oracle, state);
        if (plan.subclassChoice) state.subclassChosen = true;
      },
    });

    if (result.error) {
      t.fail(`${cls.name}: walk to 20`, result.error);
      continue;
    }

    // Terminal assertions.
    const c = result.char;
    t.eq(`${cls.name}: final level`, c.level, 20);
    t.eq(`${cls.name}: final class level`, c.classes[0].level, 20);
    t.eq(`${cls.name}: proficiency bonus`, c.proficiencyBonus, 6);
    t.check(`${cls.name}: subclass set`, !!c.classes[0].subclass, "no subclass on the level-20 character");

    if (oracle.isCaster) {
      const cur = oracle.prog[20];
      if (cur?.spellsKnown != null) {
        const levelled = (c.spells || []).filter((s) => (s.level ?? 1) > 0).length;
        t.check(`${cls.name}: levelled spells >= known(${cur.spellsKnown})`, levelled >= cur.spellsKnown,
          `expected >= ${cur.spellsKnown} levelled spells, got ${levelled}`);
      }
    }

    // Level cap: a further plan at 20 must be rejected.
    const capped = await client.post(`/api/character/${result.id}/levelup/plan`, { classId: cls.id });
    t.statusOneOf(`${cls.name}: plan at level 20 rejected`, capped, [400, 422]);

    // Negative tests on a fresh L1 character of the same class (so the walk's
    // terminal char stays intact for inspection).
    const probe = await walkToMax(client, cls, ctx, { maxLevel: oracle.asiLevels[0] - 1 || 1 });
    if (!probe.error && probe.id) {
      await negativeTests(t, client, probe.id, cls.id, oracle);
    }
  }

  // Single FINDING for the spellbook-vs-prepared-cap collision (the Wizard's
  // required spellbook count exceeds the prepared-spell cap on the apply path).
  if (ctx.spellCapClasses?.size) {
    t.finding(
      "Spellbook count exceeds prepared-spell cap on levelup/apply",
      `needed allowHomebrewSelections to advance: ${[...ctx.spellCapClasses].join(", ")} — the required spellbook size is validated against the prepared cap`,
    );
  }
}
