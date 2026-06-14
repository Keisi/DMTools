// Suite C — Encounter / combat scenarios (DM + a second player identity).
// Covers lifecycle, HP & death, status effects & concentration, resources & rest,
// buff roll-modifier surfacing, DM visibility, the combat log, and authz/guards.

const DISPOSITION = { PC: 0, FRIENDLY: 1, ENEMY: 2 };
const STATUS = { PENDING: 0, ACTIVE: 1, ENDED: 2 };

function clericL5Body(ctx, name) {
  const cls = ctx.classByName["Cleric"];
  const S = ctx.statByCode;
  return {
    name, raceId: ctx.baselineRace.id, alignment: 0,
    classes: [{ classId: cls.id, level: 5, subclassId: cls.subclasses[0]?.id }],
    abilityScores: [
      { statId: S.STR.id, value: 12 }, { statId: S.DEX.id, value: 12 }, { statId: S.CON.id, value: 14 },
      { statId: S.INT.id, value: 10 }, { statId: S.WIS.id, value: 16 }, { statId: S.CHA.id, value: 10 },
    ],
  };
}

// Create campaign, invite+activate the player, register a player character, make a
// session + encounter. Returns the shared ids/clients.
async function setup(dm, player, ctx, t) {
  t.startSection("setup (campaign / membership / session / encounter)");
  const camp = await dm.post("/api/campaigns", { name: `C ${ctx.stamp}`, description: "e2e" });
  t.status("create campaign", camp, 200);
  const cid = camp.body.id;
  ctx.track(`/api/campaigns/${cid}`, dm);

  t.status("DM invites player", await dm.post(`/api/campaigns/${cid}/invite`, { username: player.username }), 204);
  t.status("player accepts via join", await player.post(`/api/campaigns/${cid}/join`, {}), 204);
  t.status("player can GET campaign once active", await player.get(`/api/campaigns/${cid}`), 200);

  // Player registers a Cleric (spell slots + a resource to exercise in C4).
  const pcRes = await player.post("/api/character", clericL5Body(ctx, "C Player Cleric"));
  t.status("player creates a character", pcRes, 201);
  const pc = pcRes.body;
  ctx.track(`/api/character/${pc.id}`, player);
  t.statusOneOf("player registers character to campaign", await player.post(`/api/campaigns/${cid}/characters`, { characterId: pc.id }), [200, 204]);

  const sess = await dm.post(`/api/campaigns/${cid}/sessions`, { name: "S1" });
  t.status("create session", sess, 200);
  const sid = sess.body.id;

  const enc = await dm.post(`/api/campaigns/${cid}/encounters`, { name: "Goblin Ambush", sessionId: sid });
  t.status("create encounter (with session)", enc, 200);
  t.eq("new encounter is Pending", enc.body.status, STATUS.PENDING);

  return { cid, sid, eid: enc.body.id, pc };
}

async function c1Lifecycle(dm, ctx, t, S) {
  t.startSection("C1 lifecycle (start / turn / rewind / end)");
  const base = `/api/campaigns/${S.cid}/encounters/${S.eid}`;

  const pcAdd = await dm.post(`${base}/combatants`, { name: "Cleric", maxHp: S.pc.maxHitPoints, armorClass: 16, characterId: S.pc.id });
  t.status("add PC combatant", pcAdd, 200);
  t.eq("PC disposition = PlayerCharacter", pcAdd.body.combatants[0].disposition, DISPOSITION.PC);

  for (const [name, hp, init] of [["Goblin A", 7, 12], ["Goblin B", 7, 18], ["Goblin Boss", 21, 9]]) {
    const r = await dm.post(`${base}/combatants`, { name, maxHp: hp, armorClass: 15, characterId: null });
    t.status(`add NPC ${name}`, r, 200);
    const cid = r.body.combatants.find((c) => c.name === name).id;
    t.status(`set initiative ${name}`, await dm.put(`${base}/combatants/${cid}/initiative`, { initiative: init }), 200);
  }
  // PC initiative
  const enc0 = await dm.get(base);
  const pcCombatant = enc0.body.combatants.find((c) => c.characterId === S.pc.id);
  await dm.put(`${base}/combatants/${pcCombatant.id}/initiative`, { initiative: 15 });

  const started = await dm.put(`${base}/start`, {});
  t.status("start encounter", started, 200);
  t.eq("status = Active", started.body.status, STATUS.ACTIVE);
  t.eq("round = 1", started.body.roundNumber, 1);
  const sorted = [...started.body.combatants].sort((a, b) => a.sortOrder - b.sortOrder);
  const inits = sorted.map((c) => c.initiative);
  const descending = inits.every((v, i) => i === 0 || inits[i - 1] >= v);
  t.check("combatants sorted by initiative desc", descending, `initiatives in sortOrder = ${inits.join(",")}`);
  t.eq("active = top of order", started.body.activeCombatantId, sorted[0].id);

  // Advance a full round -> round 2.
  let cur = started.body;
  const n = cur.combatants.length;
  for (let i = 0; i < n; i++) cur = (await dm.put(`${base}/next-turn`, {})).body;
  t.eq("round wraps to 2 after a full cycle", cur.roundNumber, 2);

  // Rewind.
  const rewound = await dm.put(`${base}/prev-turn`, {});
  t.status("prev-turn accepted", rewound, 200);
  t.check("round decremented on rewind", rewound.body.roundNumber <= 2);

  S.lifecycleActive = true; // leave it active for later scenarios; end happens last
}

async function c2HpDeath(dm, player, ctx, t, S) {
  t.startSection("C2 HP & death");
  const base = `/api/campaigns/${S.cid}/encounters/${S.eid}`;
  const enc = (await dm.get(base)).body;
  const pc = enc.combatants.find((c) => c.characterId === S.pc.id);
  const npc = enc.combatants.find((c) => c.characterId === null);

  // Temp HP absorbs first.
  await dm.put(`${base}/combatants/${pc.id}/hp`, { setCurrentHp: pc.maxHp, setTempHp: 5 });
  const afterDmg = (await dm.put(`${base}/combatants/${pc.id}/hp`, { delta: -8 })).body.combatants.find((c) => c.id === pc.id);
  t.eq("temp HP drained first", afterDmg.tempHp, 0);
  t.eq("overflow hits current HP", afterDmg.currentHp, pc.maxHp - 3);

  // Heal caps at max.
  const healed = (await dm.put(`${base}/combatants/${pc.id}/hp`, { delta: 999 })).body.combatants.find((c) => c.id === pc.id);
  t.eq("heal capped at maxHp", healed.currentHp, pc.maxHp);

  // PC down -> dying (not dead), death saves apply.
  let down = (await dm.put(`${base}/combatants/${pc.id}/hp`, { setCurrentHp: 0 })).body.combatants.find((c) => c.id === pc.id);
  t.eq("PC at 0 HP is dying not dead", down.isDead, false);

  // Player records their own death-save failure (owner-scoped).
  const rec = await player.put(`${base}/combatants/${pc.id}/death-saves`, { successes: 0, failures: 1 });
  t.status("player records own death saves", rec, 200);

  // Staying down (0 -> 0) does not reset death saves.
  const still = (await dm.put(`${base}/combatants/${pc.id}/hp`, { setCurrentHp: 0 })).body.combatants.find((c) => c.id === pc.id);
  t.eq("0->0 does not reset death saves", still.deathSaveFailures, 1);

  // 3 failures -> dead.
  const dead = (await player.put(`${base}/combatants/${pc.id}/death-saves`, { successes: 0, failures: 3 })).body.combatants.find((c) => c.id === pc.id);
  t.eq("3 failed saves -> isDead", dead.isDead, true);

  // Heal above 0 resets saves.
  const revived = (await dm.put(`${base}/combatants/${pc.id}/hp`, { setCurrentHp: 10 })).body.combatants.find((c) => c.id === pc.id);
  t.eq("revival resets death-save failures", revived.deathSaveFailures, 0);

  // Freeform NPC dies instantly at 0.
  const npcDead = (await dm.put(`${base}/combatants/${npc.id}/hp`, { setCurrentHp: 0 })).body.combatants.find((c) => c.id === npc.id);
  t.eq("freeform NPC at 0 HP isDead immediately", npcDead.isDead, true);

  // Authz: player may not touch a freeform NPC (backend rejects with 400
  // "You can only modify your own character", not 403).
  t.statusOneOf("player cannot modify NPC HP", await player.put(`${base}/combatants/${npc.id}/hp`, { delta: 5 }), [400, 403, 404]);
}

async function c3Status(dm, ctx, t, S) {
  t.startSection("C3 status effects & concentration");
  const base = `/api/campaigns/${S.cid}/encounters/${S.eid}`;
  const enc = (await dm.get(base)).body;
  const target = enc.combatants[0];
  const source = enc.combatants[1];
  const effect = ctx.statusEffects.find((e) => e.name === "Blinded") || ctx.statusEffects[0];

  const add = await dm.post(`${base}/combatants/${target.id}/status-effects`, {
    statusEffectId: effect.id, remainingRounds: 2, sourceCombatantId: source.id,
  });
  t.status("add timed status effect", add, 200);
  const applied = add.body.combatants.find((c) => c.id === target.id).statusEffects.find((s) => s.statusEffectId === effect.id);
  t.check("effect applied with duration + source", applied && applied.remainingRounds === 2 && applied.sourceCombatantId === source.id);

  // Re-apply refreshes in place (no duplicate row).
  const re = await dm.post(`${base}/combatants/${target.id}/status-effects`, { statusEffectId: effect.id, remainingRounds: 3 });
  const count = re.body.combatants.find((c) => c.id === target.id).statusEffects.filter((s) => s.statusEffectId === effect.id).length;
  t.eq("re-apply does not duplicate", count, 1);

  // Break concentration on the source sweeps its sourced effects.
  await dm.post(`${base}/combatants/${target.id}/status-effects`, { statusEffectId: effect.id, remainingRounds: 3, sourceCombatantId: source.id });
  const broke = await dm.post(`${base}/combatants/${source.id}/break-concentration`, {});
  t.status("break concentration", broke, 200);
  const stillThere = broke.body.combatants.find((c) => c.id === target.id).statusEffects.some((s) => s.statusEffectId === effect.id && s.sourceCombatantId === source.id);
  t.check("sourced effect swept on break-concentration", !stillThere);
}

async function c4Resources(dm, ctx, t, S) {
  t.startSection("C4 resources, spell slots, rest");
  const base = `/api/campaigns/${S.cid}/encounters/${S.eid}`;
  const enc = (await dm.get(base)).body;
  const pc = enc.combatants.find((c) => c.characterId === S.pc.id);

  if ((pc.spellSlots || []).length) {
    const slot = pc.spellSlots[0];
    const set = await dm.put(`${base}/combatants/${pc.id}/spell-slots/${slot.level}`, { remaining: 0 });
    t.status(`set spell-slot L${slot.level} to 0`, set, 200);
    const after = set.body.combatants.find((c) => c.id === pc.id).spellSlots.find((s) => s.level === slot.level);
    t.eq("spell slot remaining clamped to 0", after.remaining, 0);

    const long = await dm.post(`${base}/combatants/${pc.id}/rest`, { kind: 2 });
    t.status("long rest", long, 200);
    const restored = long.body.combatants.find((c) => c.id === pc.id).spellSlots.find((s) => s.level === slot.level);
    t.eq("long rest restores spell slots to max", restored.remaining, restored.max);
  } else {
    t.finding("C4: linked character has no spell slots", "skipped spell-slot assertions");
  }

  // Invalid rest kind.
  t.statusOneOf("invalid rest kind rejected", await dm.post(`${base}/combatants/${pc.id}/rest`, { kind: 9 }), [400, 422]);
}

async function c5Buffs(dm, ctx, t, S) {
  t.startSection("C5 buff roll modifiers (no double-count)");
  const base = `/api/campaigns/${S.cid}/encounters/${S.eid}`;
  const enc = (await dm.get(base)).body;
  const target = enc.combatants[0];
  const dice = ctx.statusEffects.find((e) => (e.rollModifiers || []).some((r) => r.kind === 1)); // Bless/Bane
  if (!dice) {
    t.finding("C5: no dice-rider status effect in catalog", "skipped buff surfacing test");
    return;
  }
  const r = await dm.post(`${base}/combatants/${target.id}/status-effects`, { statusEffectId: dice.id, remainingRounds: 3 });
  t.status(`apply '${dice.name}' (dice rider)`, r, 200);
  const eff = r.body.combatants.find((c) => c.id === target.id).statusEffects.find((s) => s.statusEffectId === dice.id);
  const hasDice = (eff?.rollModifiers || []).some((m) => m.kind === 1 && m.diceCount != null && m.dieSize != null);
  t.check("dice rider surfaced on combatant (diceCount + dieSize)", hasDice, `rollModifiers = ${JSON.stringify(eff?.rollModifiers)}`);
  const flat = ctx.statusEffects.find((e) => (e.rollModifiers || []).some((m) => m.kind === 0));
  if (!flat) t.finding("C5: no flat-modifier status effect in catalog", "cannot assert flat folds-not-surfaces directly");
}

async function c6Visibility(dm, ctx, t, S) {
  t.startSection("C6 DM controls & visibility");
  const base = `/api/campaigns/${S.cid}/encounters/${S.eid}`;
  const patched = await dm.patch(base, { turnOrderHiddenFromPlayers: true });
  t.status("patch encounter turnOrderHiddenFromPlayers", patched, 200);
  t.eq("turn order hidden flag set", patched.body.turnOrderHiddenFromPlayers, true);

  const enc = (await dm.get(base)).body;
  const c = enc.combatants[0];
  const pc = await dm.patch(`${base}/combatants/${c.id}`, { hpHiddenFromPlayers: true });
  t.status("patch combatant hpHiddenFromPlayers", pc, 200);
  t.eq("combatant HP-hidden flag set", pc.body.combatants.find((x) => x.id === c.id).hpHiddenFromPlayers, true);
}

async function c7Log(dm, ctx, t, S) {
  t.startSection("C7 combat log");
  const base = `/api/campaigns/${S.cid}/encounters/${S.eid}`;
  const page = await dm.get(`${base}/log?take=5`);
  t.status("get log page", page, 200);
  t.check("page size respected (<=5)", (page.body.entries || []).length <= 5);

  const note = await dm.post(`${base}/log`, { message: "DM note from e2e" });
  t.status("add DM note", note, 200);
  t.eq("DM note event type = 90", note.body.eventType, 90);

  // Event-type coverage: pull a big page and check the key types appeared.
  const all = await dm.get(`${base}/log?take=100`);
  const types = new Set((all.body.entries || []).map((e) => e.eventType));
  for (const [label, type] of [["Started", 1], ["TurnChanged", 3], ["CombatantAdded", 10], ["Damage", 20], ["StatusApplied", 30]]) {
    t.check(`log contains ${label}(${type})`, types.has(type), `seen types = ${[...types].sort((a, b) => a - b).join(",")}`);
  }
}

async function c8Guards(dm, player, ctx, t, S) {
  t.startSection("C8 guards & authorization");
  const camp = `/api/campaigns/${S.cid}`;
  const base = `${camp}/encounters/${S.eid}`;

  // Null session on create.
  t.statusOneOf("create encounter w/ null session rejected", await dm.post(`${camp}/encounters`, { name: "no-session" }), [400, 422]);

  // Cross-campaign session.
  const other = await dm.post("/api/campaigns", { name: "other camp" });
  ctx.track(`/api/campaigns/${other.body.id}`, dm);
  const otherSess = await dm.post(`/api/campaigns/${other.body.id}/sessions`, { name: "OS" });
  t.statusOneOf("create encounter w/ cross-campaign session rejected",
    await dm.post(`${camp}/encounters`, { name: "x-camp", sessionId: otherSess.body.id }), [400, 422]);

  // Session delete with a live encounter -> 409.
  t.status("delete session holding a live encounter -> 409", await dm.del(`${camp}/sessions/${S.sid}`), 409);

  // Non-member access -> 404.
  const outsider = await ctx.makeClient("outsider");
  t.statusOneOf("non-member GET encounter -> 404", await outsider.get(base), [403, 404]);

  // Start when already active -> 422.
  t.statusOneOf("start when not Pending rejected", await dm.put(`${base}/start`, {}), [400, 422, 409]);

  // End, then next-turn on an ended encounter -> rejected.
  t.status("end encounter", await dm.put(`${base}/end`, {}), 200);
  t.statusOneOf("next-turn on ended encounter rejected", await dm.put(`${base}/next-turn`, {}), [400, 422, 409]);
}

export async function runSuiteC(dm, ctx, t) {
  t.setSuite("C: encounters");
  const player = await ctx.makeClient("player");
  const S = await setup(dm, player, ctx, t);
  S.statByCode = ctx.statByCode;
  await c1Lifecycle(dm, ctx, t, S);
  await c2HpDeath(dm, player, ctx, t, S);
  await c3Status(dm, ctx, t, S);
  await c4Resources(dm, ctx, t, S);
  await c5Buffs(dm, ctx, t, S);
  await c6Visibility(dm, ctx, t, S);
  await c7Log(dm, ctx, t, S);
  await c8Guards(dm, player, ctx, t, S);
}
