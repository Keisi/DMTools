// Shared level-up machinery used by Suite A (assert per level) and Suite B
// (convergence: replay the same choices as a single high-level create).

// Build the L1 create body for a class, including its starting-skill picks and
// any level-1 feature selections (Fighter Fighting Style, Rogue Expertise) so the
// planner does not re-offer them and Expertise has proficient skills to upgrade.
export function baselineCreateBody(cls, ctx) {
  const oracle = ctx.oracleFor(cls);
  const body = {
    name: `E2E ${cls.name}`,
    raceId: oracle.baselineRaceId,
    classes: [{ classId: cls.id, level: 1 }],
    abilityScores: oracle.baselineAbilityScores(),
    alignment: 0,
  };

  // Starting skills (SelectionType.Skill = 1).
  const skillIds = [];
  for (const sel of (cls.selections || []).filter((s) => s.type === 1)) {
    for (const o of sel.options.slice(0, sel.choose)) skillIds.push(o.optionId);
  }

  // Level-1 feature selections.
  const fightingStyleIds = [];
  const expertiseSkillIds = new Set();
  for (const sel of (cls.featureSelections || []).filter((s) => s.level === 1)) {
    if (sel.type === 4) for (const o of sel.options.slice(0, sel.choose)) fightingStyleIds.push(o.optionId);
    // Expertise (5): upgrade `choose` of the skills we are already proficient in.
    if (sel.type === 5) for (const id of skillIds.slice(0, sel.choose)) expertiseSkillIds.add(id);
  }

  const skillProficiencies = skillIds.map((id) => ({
    skillId: id,
    level: expertiseSkillIds.has(id) ? 2 : 1,
  }));
  if (skillProficiencies.length) body.skillProficiencies = skillProficiencies;
  if (fightingStyleIds.length) body.fightingStyleIds = fightingStyleIds;

  // Level-1 starting cantrips + spells for casters (creation does not force these,
  // but they must be present for the level-20 spell-count totals to be correct).
  if (oracle.isCaster) {
    const p1 = oracle.prog[1];
    if (p1) {
      const ofLevel = (lvl) =>
        ctx.spells.filter((s) => s.level === lvl && (s.classes || []).includes(cls.name));
      const spellIds = [];
      if (p1.cantripsKnown) spellIds.push(...ofLevel(0).slice(0, p1.cantripsKnown).map((s) => s.id));
      const levelledNeed = p1.spellsKnown ?? p1.spellbookSize ?? 0;
      if (levelledNeed) spellIds.push(...ofLevel(1).slice(0, levelledNeed).map((s) => s.id));
      if (spellIds.length) body.spellIds = spellIds;
    }
  }
  return body;
}

// Pick ASI legs (sum exactly 2) that keep every score <= 20. Reads the
// API-reported `effective` from the latest character — never recomputes.
export function chooseAsi(char) {
  const scores = char.abilityScores.map((a) => ({ statId: a.statId, eff: a.effective }));
  const sorted = [...scores].sort((a, b) => a.eff - b.eff);
  const low = sorted.find((s) => s.eff <= 18);
  if (low) return [{ statId: low.statId, amount: 2 }];
  const ones = sorted.filter((s) => s.eff <= 19).slice(0, 2);
  if (ones.length === 2) return ones.map((s) => ({ statId: s.statId, amount: 1 }));
  return null; // no headroom — caller falls back to a feat if available
}

// Construct a valid levelup/apply body from a plan + the current character.
export function buildApply(plan, char, ctx) {
  const body = { classId: plan.classId, hitPoints: { mode: 0 } };

  if (plan.abilityScoreImprovementDue) {
    const asi = chooseAsi(char);
    if (asi) body.abilityImprovements = asi;
    else if (ctx?.feats?.[0]) body.featId = ctx.feats[0].id; // headroom exhausted -> take any feat
  }

  if (plan.subclassChoice && plan.subclassChoice.options?.length) {
    body.subclassId = plan.subclassChoice.options[0].optionId;
  }

  const sc = plan.spellChoices;
  if (sc) {
    const known = new Set((char.spells || []).map((s) => s.id));
    if (sc.newCantrips) {
      body.cantripIds = (sc.cantripPool || [])
        .filter((s) => !known.has(s.id))
        .slice(0, sc.newCantrips)
        .map((s) => s.id);
    }
    if (sc.newSpells) {
      body.spellIds = (sc.spellPool || [])
        .filter((s) => !known.has(s.id))
        .slice(0, sc.newSpells)
        .map((s) => s.id);
    }
  }

  if (plan.featureChoices?.length) {
    body.featureChoices = plan.featureChoices.map((fc) => {
      const sel = fc.selection || fc;
      return { selectionId: sel.id, optionIds: sel.options.slice(0, sel.choose).map((o) => o.optionId) };
    });
  }

  return body;
}

// Walk a freshly created level-1 character up to `maxLevel` (default 20) via
// plan -> apply. Optional `onPlan(plan, char, target)` runs before each apply
// (Suite A assertions). Returns { id, char, history:[{target, plan, applyBody}] }.
export async function walkToMax(client, cls, ctx, opts = {}) {
  const maxLevel = opts.maxLevel || 20;
  const created = await client.post("/api/character", baselineCreateBody(cls, ctx));
  if (created.status >= 400) {
    return { id: null, char: null, history: [], error: `create L1: ${created.status} ${JSON.stringify(created.body)}` };
  }
  let char = created.body;
  const id = char.id;
  if (ctx.track) ctx.track(`/api/character/${id}`, client);

  const history = [];
  for (let target = 2; target <= maxLevel; target++) {
    const pr = await client.post(`/api/character/${id}/levelup/plan`, { classId: cls.id });
    if (pr.status >= 400) {
      return { id, char, history, error: `plan ->L${target}: ${pr.status} ${JSON.stringify(pr.body)}` };
    }
    const plan = pr.body;
    if (opts.onPlan) opts.onPlan(plan, char, target);

    const applyBody = buildApply(plan, char, ctx);
    const ar = await client.post(`/api/character/${id}/levelup/apply`, applyBody);
    if (ar.status >= 400) {
      return {
        id, char, history,
        error: `apply ->L${target}: ${ar.status} ${JSON.stringify(ar.body)} | body=${JSON.stringify(applyBody)}`,
      };
    }
    char = ar.body;
    history.push({ target, plan, applyBody });
    if (opts.afterApply) opts.afterApply(char, target);
  }
  return { id, char, history };
}
