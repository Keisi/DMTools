// Preflight: authenticate a throwaway account, fetch every reference catalog,
// and build name->id maps + a per-class oracle the suites assert against.
import { ApiClient } from "./client.mjs";

export function decodeUserId(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
    return payload.sub || payload.nameid || payload.userId || payload.unique_name || null;
  } catch {
    return null;
  }
}

// Register a throwaway user (falls back to login if it already exists), set the
// token + decoded userId on a fresh client.
export async function makeClient(username, password = "Passw0rd!23", base) {
  const c = new ApiClient(base);
  let r = await c.post("/api/auth/register", { username, password });
  if (r.status >= 400 || !r.body?.token) {
    r = await c.post("/api/auth/login", { username, password });
  }
  if (!r.body?.token) {
    throw new Error(`auth failed for ${username}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  c.setToken(r.body.token);
  c.username = username;
  c.userId = decodeUserId(r.body.token);
  return c;
}

const byName = (arr) => {
  const m = {};
  for (const x of arr) m[x.name] = x;
  return m;
};

export async function preflight(client) {
  const get = async (p) => {
    const r = await client.get(p);
    if (r.status >= 400) throw new Error(`preflight ${p} -> ${r.status} ${JSON.stringify(r.body)}`);
    return r.body;
  };
  const [
    classes, races, backgrounds, feats, spells, stats, skills,
    fightingStyles, metamagics, eldritch, languages, statusEffects, armors, weapons, items,
  ] = await Promise.all([
    get("/api/classes"), get("/api/races"), get("/api/backgrounds"), get("/api/feats"),
    get("/api/spells"), get("/api/stats"), get("/api/skills"), get("/api/fightingstyles"),
    get("/api/metamagics"), get("/api/eldritchinvocations"), get("/api/languages"),
    get("/api/statuseffects"), get("/api/armors"), get("/api/weapons"), get("/api/items"),
  ]);

  const statByCode = {};
  for (const s of stats) statByCode[s.code] = s;

  // Baseline race: minimal ability modifiers so per-level HP/ability math stays clean
  // and ASIs have headroom. Half-Elf only touches CHA in the seed data.
  const baselineRace =
    races.find((r) => r.name === "Half-Elf") ||
    races.find((r) => (r.abilityModifiers || []).length <= 1) ||
    races[0];

  // Moderate base scores (<=14) leave room for ~7 ASIs without breaching 20.
  const baselineAbilityScores = () => [
    { statId: statByCode.STR.id, value: 13 },
    { statId: statByCode.DEX.id, value: 13 },
    { statId: statByCode.CON.id, value: 14 },
    { statId: statByCode.INT.id, value: 13 },
    { statId: statByCode.WIS.id, value: 13 },
    { statId: statByCode.CHA.id, value: 12 },
  ];

  const oracleFor = (cls) => {
    const asiLevels = (cls.features || [])
      .filter((f) => f.kind === 1)
      .map((f) => f.level)
      .sort((a, b) => a - b);
    const subSel = (cls.selections || []).find((s) => s.type === 2);
    const prog = {};
    if (cls.spellcasting) for (const p of cls.spellcasting.progression) prog[p.classLevel] = p;
    const featureSelLevels = new Set((cls.featureSelections || []).map((s) => s.level));
    return {
      id: cls.id,
      name: cls.name,
      hitDie: cls.hitDie,
      asiLevels,
      subclassLevel: subSel ? subSel.level : 99,
      isCaster: !!cls.spellcasting,
      isPrepared: cls.spellcasting?.isPrepared ?? null,
      prog,
      featureSelLevels,
      baselineRaceId: baselineRace.id,
      baselineAbilityScores,
    };
  };

  return {
    classes, races, backgrounds, feats, spells, stats, skills,
    fightingStyles, metamagics, eldritch, languages, statusEffects, armors, weapons, items,
    statByCode,
    classByName: byName(classes),
    raceByName: byName(races),
    backgroundByName: byName(backgrounds),
    spellByName: byName(spells),
    featByName: byName(feats),
    skillByName: byName(skills),
    baselineRace,
    baselineAbilityScores,
    oracleFor,
  };
}
