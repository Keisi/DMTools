# DMTool API End-to-End Test Plan (pure HTTP / no browser)

**Target:** the DMTool JSON Web API (backend repo `..\DMTool`), hosted at
`http://localhost:3501` (IIS) or `http://localhost:5157` (Kestrel
`dotnet run --project DMTool --launch-profile http`).

**Method:** authenticate → JWT → drive endpoints with concrete request payloads →
assert on response bodies and status codes. No spectral, no DOM, no UI. Everything
here can run on a machine that only has the backend + an HTTP client.

**Three suites:**
- **Suite A** — Level-up correctness, level 1 → max (20), for every 5e class.
- **Suite B** — Above-level-1 character creation correctness (required spells / feats / ASIs / subclass accounted for).
- **Suite C** — Full encounter / combat scenarios.

This plan was authored against the **live seeded catalog** (12 classes, pulled
2026-06-13). The per-class fact table in §3.4 is the ground-truth oracle.

---

## 0. Test methodology — two complementary assertion modes

Every assertion in this plan is one of two kinds. Both matter; they catch
different failures.

1. **Engine-consistency (data-driven).** Derive the expectation from the
   reference catalog (`GET /api/classes`, `/api/races`, …) and assert the
   level-up `plan` / character `response` matches *its own declared data*. This
   honors the repo rule "rules come from backend data — never hardcode them"
   (CLAUDE.md) and catches **engine regressions** (planner stops surfacing an ASI
   that the feature rows still declare, spell-count delta drifts from the
   progression table, etc.).

2. **RAW ground-truth spot-checks.** A *small fixed* table of canonical 5e facts
   (ASI at 4/8/12/16/19; Fighter also 6/14; Rogue also 10; Wizard cantrips 3→5;
   Sorcerer 4 cantrips at L1; subclass levels; half-casters start at L2). Assert
   the catalog/engine against these literals. This catches **bad seed data** that
   mode (1) would happily rubber-stamp (engine-consistency can't tell you the
   seed itself is wrong).

> Mode (1) verifies the *engine*. Mode (2) verifies the *data*. A plan that only
> did (1) would pass even if the DB seeded Fighter ASIs at the wrong levels.

**Reporting:** each test emits `PASS` / `FAIL` / `FINDING`. A `FINDING` is
behavior that isn't a crash but is worth a `FRONTEND-REQUEST-*.md` (e.g.
"creation doesn't enforce minimum spell counts"). Findings are not failures.

---

## 1. Conventions

- **Wire format is integers for all enums** (no string enum converter). The enum
  tables this plan depends on:

  | Enum | Values |
  |---|---|
  | `SelectionType` | Skill=1, Subclass=2, Language=3, FightingStyle=4, Expertise=5, Metamagic=6, EldritchInvocation=7, Tool=8, Cantrip=9 |
  | `FeatureKind` | Normal=0, AbilityScoreImprovement=1, Subclass=2 |
  | `LevelUpHitPointMode` | Average=0, Roll=1 |
  | `SpellcastingTier` | None=0, Full=1, Half=2, PactMagic=3 |
  | `SkillProficiencyLevel` | Proficient=1, Expertise=2 |
  | `Alignment` | LawfulGood=0 … ChaoticEvil=8 |
  | `EncounterStatus` | Pending=0, Active=1, Ended=2 |
  | `CombatantDisposition` | PlayerCharacter=0, FriendlyNpc=1, Enemy=2 |
  | `RestKind` | Short=1, Long=2 |
  | `ResourceRecharge` | None=0, ShortRest=1, LongRest=2 |
  | `RollTarget` | AttackRoll=0, SavingThrow=1, AbilityCheck=2, IncomingAttackRoll=3 |
  | `RollModifierKind` | Flat=0, Dice=1, Advantage=2, Disadvantage=3 |
  | `CombatEventType` | Started=1, Ended=2, TurnChanged=3, TurnRewound=4, CombatantAdded=10, CombatantRemoved=11, InitiativeSet=12, Damage=20, Heal=21, HpSet=22, TempHpSet=23, StatusApplied=30, StatusRemoved=31, ResourceChanged=40, SpellSlotChanged=41, Rested=42, DmNote=90 |

- **Never hardcode GUIDs.** They change on every DB reset. Resolve every id at
  preflight (§2) into name→id maps and reference by symbolic name in payloads
  (this plan writes `{stat:STR}`, `{class:Wizard}`, `{spell:"Magic Missile"}`).

- **The six required ability scores** are the `StatResponse` rows with
  `isDefault:true` — confirmed: STR, DEX, CON, INT, WIS, CHA (all six). Every
  `CharacterRequest.abilityScores` must include all six or creation 400s
  ("Missing ability score for required stat").

- **Derived values are render-only — assert against what the API returns, never
  recompute them.** The API does not return the ability *modifier* as a
  standalone field on every DTO, but where a derived number is reported
  (`conModifier` on the level-up plan, `modifier` on the ability breakdown,
  `maxHitPoints`, `armorClass`, `proficiencyBonus`), the test asserts the
  **returned** value, not a client-side formula. (This is also a repo guardrail.)

- **Error-shape assertions.** Validation failures return `400`/`422` with a
  problem-details body whose `errors` is keyed by field. Assert *both* the status
  and a substring of the message — don't assert on exact wording (it changes).

- **Isolation & cleanup.** Run against a **dedicated throwaway account**
  (`POST /api/auth/register`), not `dungeonmaster` (whose seeded vault/campaign
  data is reused by the spectral recipe). Every created character/campaign is
  deleted at suite teardown (`DELETE /api/character/{id}`,
  `DELETE /api/campaigns/{id}`). Treat the run as read/write against a real DB.

- **No npm test runner exists** — this is an out-of-build harness (see §6). It
  must never be wired into `npm run build` or the deploy path.

---

## 2. Preflight / fixtures (run once per suite execution)

1. `GET /api/health` → expect `200`. Abort the run if the backend is down.
2. `POST /api/auth/register` `{username, password}` a throwaway user → capture
   `token`. (Fall back to `login` if the user already exists.)
3. Fetch and cache every reference catalog (all `[Authorize]`, send the Bearer):
   `/api/classes`, `/api/races`, `/api/backgrounds`, `/api/feats`,
   `/api/spells`, `/api/stats`, `/api/skills`, `/api/fightingstyles`,
   `/api/metamagics`, `/api/eldritchinvocations`, `/api/languages`,
   `/api/statuseffects`, `/api/armors`, `/api/weapons`, `/api/items`.
4. Build resolution maps: `statByCode`, `classByName`, `raceByName`,
   `backgroundByName`, `spellByName`, `featByName`, `skillByName`, etc.
5. From each `ClassResponse`, precompute the **expected per-class oracle**
   (data-driven mode 1):
   - `asiLevels` = `features.filter(kind===1).map(level)` sorted.
   - `subclassLevel` = `selections.find(type===2)?.level`.
   - `subclassOptions` = `subclasses[]`.
   - `spell.progression[]` keyed by `classLevel` (cantripsKnown, spellsKnown,
     maxSpellLevel, slots[], spellbookSize), `spell.isPrepared`.
   - `featureSelections[]` keyed by `level` (type, choose).
   Cross-check this against the **RAW table in §3.4** (mode 2).

---

## 3. Suite A — Level-up 1 → 20, every class

### 3.1 Shape of each class run

For each of the 12 classes:

1. **Create a level-1 single-class character** via `POST /api/character` with the
   minimum body (name, raceId = a no-modifier baseline race to keep math clean
   e.g. Human, the six base ability scores, one class at `level:1`). For classes
   with a level-1 subclass (Cleric/Sorcerer/Warlock) and level-1 feature picks
   (Fighter Fighting Style, Rogue Expertise) supply those at creation, or assert
   they aren't required at L1 and pick later — see §3.3.
2. **Loop `level = 2 … 20`:** for each level
   a. `POST /api/character/{id}/levelup/plan {classId}` → assert the **plan**
      (§3.2 checklist).
   b. Construct the matching `apply` body from the plan, `POST .../levelup/apply`
      → assert the returned `CharacterResponse` reflects the new level.
3. **At level 20**, assert the terminal state (§3.5) and that a further
   `levelup/plan` returns `400` ("already at the level cap of 20").

This walks **~240 level transitions** (12 classes × 19 each). It is the backbone
of the suite.

### 3.2 Per-level plan + apply assertion checklist

At every `level` transition assert all that apply:

**Hit points (always).**
- `plan.hitPoints.hitDie === class.hitDie`.
- `plan.hitPoints.average ===` half the hit die rounded down, plus 1 (d12→7,
  d10→6, d8→5, d6→4).
- `plan.hitPoints.rollMin === 1`, `rollMax === hitDie`.
- `plan.hitPoints.conModifier ===` the CON modifier the API already reports on
  the character's ability breakdown — read it from the character response, do not
  recompute it.
- Apply with **Average** (`{mode:0}`) on the main pass; on a parallel pass apply
  with **Roll** (`{mode:1, rolledValue:hitDie}`) and assert HP gained.
- Negative tests: `{mode:1, rolledValue:hitDie+1}` → `400`; `{mode:1}` with no
  `rolledValue` → `400`; `{mode:0, rolledValue:5}` → `400`.
- After apply, assert `response.maxHitPoints` increased by the expected amount
  (L1 die is taken at max; each later level = chosen value + CON, floored at 1).

**Ability Score Improvement / Feat.**
- `plan.abilityScoreImprovementDue === (level ∈ class.asiLevels)`.
- At an ASI level, run the apply **three ways** across the test matrix:
  - **(a) Distribute:** `abilityImprovements:[{statId, amount:2}]` (or two ×1 on
    distinct stats). Assert `response.abilityScores[stat].improvementModifier`
    grew by 2 and `effective = base+racial+subrace+feat+improvement`.
  - **(b) Feat:** `featId` only. Assert `response.feats[]` contains it and any
    feat ability-mods / effects (HP, AC) folded into the derived numbers.
  - **(c) Both → `400`** ("choose exactly one of …").
- Negative tests at an ASI level: `amount` sum ≠ 2 → `400`; pushing a score > 20
  → `400`; same stat twice in one apply → `400`.
- At a **non-ASI** level, sending `abilityImprovements`/`featId` → `400` ("this
  level does not grant …").

**Subclass.**
- `plan.subclassChoice` is non-null **exactly** at `class.subclassLevel` (first
  time reaching it, if not already chosen) and **null** at every other level.
- Apply the single available subclass (`subclassId`); assert
  `response.classes[0].subclass` set and subclass features appear in
  `response.features`.
- Negative: at the subclass level omit `subclassId` → `400` ("a subclass choice
  is required"); at a non-subclass level send a `subclassId` → `400`.
- **Cascade:** if the chosen subclass injects its own `featureSelections` (e.g. a
  Champion-style extra Fighting Style), assert those surface in
  `plan.featureChoices` at the correct level on subsequent plans (data-driven —
  read them off the plan, don't assume).

**Spells / cantrips.** (only for `class.spellcastingTier !== None`)
- Compute `expectedNewCantrips = prog[level].cantripsKnown − prog[level-1].cantripsKnown`
  and `expectedNewSpells = prog[level].spellsKnown − prog[level-1].spellsKnown`
  (cumulative deltas; treat a missing previous row as 0 — half-casters' first
  caster level is **L2**).
- **Known casters** (Bard, Sorcerer, Ranger, Warlock): assert
  `plan.spellChoices.newCantrips === expectedNewCantrips` and
  `newSpells === expectedNewSpells`; assert `maxSpellLevel === prog[level].maxSpellLevel`.
  Apply exactly that many ids drawn from `plan.spellChoices.cantripPool` /
  `spellPool`.
- **Prepared casters** (Cleric, Druid, Paladin): `newCantrips`/`newSpells` are
  **null** (informational), but the **cantrip count is still forced** where the
  class gains a cantrip — assert the cantrip pool + count, and that
  `maxSpellLevel` tracks the progression. Levelled prepared spells are not forced
  at level-up (preparation is dynamic) — assert that `newSpells` is null and the
  `spellPool` is populated for reference.
- **Wizard (prepared + spellbook):** `newSpells` is null **but `spellbookSize` is
  a required count** (INCOMING #24). Compute
  `expectedNewBook = prog[level].spellbookSize − prog[level-1].spellbookSize`
  (6 at L1, +2 each level → 44 at L20) and assert the plan requires that many
  spellbook spells; apply them; assert cantrip count too (3→5).
- Negative (known casters): wrong count → `400` ("must choose exactly N");
  off-list spell id → `400`; a spell above `maxSpellLevel` → `400`; a cantrip
  whose classes don't grant cantrips → `400`.

**Feature choices** (Fighting Style / Expertise / Metamagic / Eldritch Invocation).
- `plan.featureChoices` contains an entry **iff** the class declares a
  `featureSelection` at `level` (§3.4). Each entry's `selection.type` and
  `selection.choose` must match the catalog.
- Apply `featureChoices:[{selectionId, optionIds:[…]}]`:
  - **FightingStyle (4):** ids from `/api/fightingstyles`.
  - **Metamagic (6):** ids from `/api/metamagics`.
  - **EldritchInvocation (7):** ids from `/api/eldritchinvocations`.
  - **Expertise (5):** ids must be skills the character is **already proficient
    in** — assert picking a non-proficient skill → `400`.
- Negative: wrong count vs `choose` → `400`; out-of-pool id → `400`; a
  `selectionId` not offered this level → `400`.

**Resources & spell slots (gained).**
- `plan.newSpellSlots` matches `prog[level].slots` delta. Spot-check known
  levels: full caster has 2×L1 slots at class L1, reaches L5 slots at class L9,
  L9 slots at class L17; Warlock pact slots scale separately (1→4 slots, level
  1→5). Half-casters (Paladin/Ranger) max at L5 slots.
- `plan.gainedResources` and the post-apply `response.resources` reflect the
  class's resource progression — spot-check: Barbarian Rage uses by level, Monk
  Ki = level, Sorcerer Sorcery Points = level (from L2), Cleric/Paladin Channel
  Divinity uses, Bardic Inspiration count. (Assert the few you can derive from
  the resource rows; this is the weakest oracle so keep it to spot-checks.)

### 3.3 Level-1 starting choices

Confirm what creation forces at L1 vs what's deferred:
- Cleric/Sorcerer/Warlock: subclass is an **L1** choice — assert it's required at
  creation (or that the L1→2 plan does not re-offer it once set).
- Fighter Fighting Style (L1), Rogue Expertise (L1 ×2): assert these are
  selectable at creation via `fightingStyleIds` / `skillProficiencies` with
  `level:2` (Expertise) and that the planner doesn't re-offer them.
- Warlock Eldritch Invocations begin at **L2** (×2) — first surfaces on the
  L1→2 plan, not creation.

### 3.4 Ground-truth oracle (RAW spot-check table — live data 2026-06-13)

> 12 classes, **1 subclass each** in seed data (subclass-*variety* is not
> testable until more subclasses are seeded — note this as a coverage limit, not
> a failure). **No Artificer.** Half-casters (Paladin/Ranger) have 19
> progression rows (caster levels start at class L2). Wizard is the only class
> with a required `spellbookSize`.

| Class | Hit die | Caster tier | Prepared? | Subclass L | ASI levels | Cantrips L1→L20 | Spells known L1→L20 | Spellbook L1→L20 | Max spell L (L20) | Feature selections (type@level ×choose) |
|---|---|---|---|---|---|---|---|---|---|---|
| Barbarian | d12 | None | — | 3 | 4,8,12,16,19 | — | — | — | — | — |
| Bard | d8 | Full | known | 3 | 4,8,12,16,19 | 2→4 | 4→22 | — | 9 | Expertise(5)@3×2, @10×2 |
| Cleric | d8 | Full | prepared | 1 | 4,8,12,16,19 | 3→5 | (prepared) | — | 9 | — |
| Druid | d8 | Full | prepared | 2 | 4,8,12,16,19 | 2→4 | (prepared) | — | 9 | — |
| Fighter | d10 | None | — | 3 | **4,6,8,12,14,16,19** | — | — | — | — | FightingStyle(4)@1×1 |
| Monk | d8 | None | — | 3 | 4,8,12,16,19 | — | — | — | — | — |
| Paladin | d10 | Half | prepared | 3 | 4,8,12,16,19 | — | (prepared) | — | 5 | FightingStyle(4)@2×1 |
| Ranger | d10 | Half | known | 3 | 4,8,12,16,19 | — | 2→11 | — | 5 | FightingStyle(4)@2×1 |
| Rogue | d8 | None | — | 3 | **4,8,10,12,16,19** | — | — | — | — | Expertise(5)@1×2, @6×2 |
| Sorcerer | d6 | Full | known | 1 | 4,8,12,16,19 | 4→6 | 2→15 | — | 9 | Metamagic(6)@3×2, @10×1, @17×1 |
| Warlock | d8 | Pact | known | 1 | 4,8,12,16,19 | 2→4 | 2→15 | — | 5 | EldritchInvocation(7)@2×2, @5/7/9/12/15/18×1 |
| Wizard | d6 | Full | prepared | 2 | 4,8,12,16,19 | 3→5 | (prepared) | **6→44** | 9 | — |

### 3.5 Terminal (level-20) assertions

- `response.level === 20`, `response.classes[0].level === 20`.
- `proficiencyBonus === 6`.
- Number of `features` ≥ the count of base+subclass feature rows ≤ L20.
- For known casters, `response.spells.length` (levelled, excluding cantrips) ===
  cumulative `spellsKnown` at L20 (Bard 22, Sorcerer 15, Ranger 11, Warlock 15).
- Cantrips count === L20 cantrips (Bard 4, Cleric 5, Druid 4, Sorcerer 6,
  Warlock 4, Wizard 5).
- ASI count folded: number of applied ASIs === `len(asiLevels)` (Fighter 7,
  Rogue 6, others 5) unless some were spent on feats.
- `feats`, `fightingStyles`, `metamagics`, `eldritchInvocations` arrays match
  what was applied along the way.
- Further `levelup/plan` → `400` (level cap).

---

## 4. Suite B — Above-level-1 character creation correctness

The user's explicit ask: **create characters that don't start at level 1 and
check that each required spell / feat / ASI is accounted for at creation.**

### 4.1 The convergence invariant (strongest test)

For each class, build **two** level-20 characters and assert they're equivalent:

- **Path 1:** `POST /api/character` directly at level 20, supplying the *same*
  subclass, ASI legs (`abilityImprovements`), feats (`featIds`), spells
  (`spellPicks`), and feature picks (`fightingStyleIds`/`metamagicIds`/
  `eldritchInvocationIds`/Expertise `skillProficiencies`) that Suite A applied
  level-by-level.
- **Path 2:** the level-20 character produced at the end of the Suite A walk
  (Average HP mode, deterministic).

Assert the two `CharacterResponse`s are equal on: `level`,
`maxHitPoints` (Average path is deterministic — equal HP is the proof the L1-die
and per-level math agree), each `abilityScores[*]` breakdown,
`proficiencyBonus`, the set of `features`, `spellcasting` counts, `resources`,
and the chosen `fightingStyles`/`metamagics`/`eldritchInvocations`/`feats`.

**Any divergence is an engine bug** — creation and level-up are two code paths
that must produce the same character for the same choices.

### 4.2 "Required choices accounted for" checks

Create at representative non-1 levels and assert the derived response:

- **ASIs at creation.** Build a **Fighter L8** (earns ASIs at 4,6,8 → 3 ASIs).
  Supply 3 `abilityImprovements` legs (6 points). Assert the ability breakdown's
  `improvementModifier` totals 6 and `effective` reflects it. Then build the same
  Fighter L8 supplying **only 1** ASI leg and assert the actual behavior:
  - If the API rejects under-application of earned ASIs → assert `400` + message.
  - If it accepts (ASIs optional at creation) → record a **FINDING** (creation
    doesn't enforce earned-ASI completeness; only the level-up path forces it).
- **Feats.** Include `featIds` (e.g. a +1-stat feat and an HP feat like Tough).
  Assert `response.feats[]` present, the feat's `abilityModifiers` folded into
  the ability breakdown's `featModifier`, and feat `effects` (HP/AC) folded into
  the derived totals.
- **Subclass at creation.** Build a class at ≥ its subclass level with
  `classes[].subclassId`. Assert `response.classes[].subclass` set and subclass
  features present in `features`. Omit it at ≥ subclass level and assert behavior
  (forced? or deferred? — record actual).
- **Spells — the central "required spells accounted for" question.** Build a
  **Wizard L11** and a **Bard L11**:
  - Assert the **cap / subset / level** gates *are* enforced:
    - over-fill a prepared/known list beyond budget → `400` ("can prepare at most
      N");
    - an off-class-list spell → `400` ("not on any of this character's classes'
      spell lists");
    - a spell above the character's max spell level → `400`.
  - Then build the **same Wizard L11 with zero `spellPicks`** and assert the
    actual behavior of *minimum* enforcement:
    - If creation `400`s on an under-filled spellbook → assert message.
    - If it `200`s → record a **FINDING**: *creation does not enforce minimum
      required spell/spellbook counts; only the `levelup/apply` path forces exact
      counts.* (This is the likely outcome given the contract — file a
      `FRONTEND-REQUEST-*.md` if the product wants creation to enforce it.)
- **Racial spells / subrace selections.** Build a **High Elf Wizard L5**: assert
  `response.racialSpells[]` is populated (level-gated, own-ability DC), the
  subrace cantrip choice merged into `spells` (null source), and the extra
  language merged into `languages`.

### 4.3 Multiclass creation

- Build **Fighter 6 / Wizard 4** (totals to 10) with `startingClassId = Fighter`.
  - Assert `response.level === 10`, both classes present at the right levels.
  - Assert **save proficiencies** derive from `startingClassId` (Fighter: STR +
    CON saves), not from the second class.
  - Assert L1 HP uses the **starting class max die** (d10 maxed), later levels
    averaged.
- **Prerequisite gate:** build the same with INT 12 (below 13). Assert `400`
  ("multiclass ability-score prerequisite not met") unless
  `allowHomebrewSelections:true`, in which case it succeeds.
- **Missing `startingClassId` on a multiclass build:** assert actual behavior
  (defaulted server-side, or `400`).

### 4.4 Creation negative-path matrix

| Payload defect | Expected |
|---|---|
| `classes` empty | `400` (min 1) |
| total level > 20 | `400` ("exceeds the multiclass cap of 20") |
| duplicate class entry | `400` ("Duplicate classes…") |
| missing one of the 6 required stats | `400` ("Missing ability score…") |
| duplicate stat | `400` ("Duplicate ability scores…") |
| ability score < 1 or > 30 | `400` (range) |
| non-existent `raceId` | `400` ("Race '…' does not exist") |
| `subraceId` not under `raceId` | `400` |
| invalid `alignment` (>8) | `400` |
| skill not on class pool (no homebrew flag) | `400` ("not on this character's class selections") |
| over-count skills | `400` ("can choose at most N skills") |
| attune item that doesn't allow attunement | `400` |
| over-attunement (> limit) | `400` |

---

## 5. Suite C — Encounter / combat scenarios

### 5.0 Setup
`POST /api/campaigns` → `POST .../sessions` → register ≥2 PCs
(`POST .../characters`) → add to roster. Keep ids.

### 5.1 C1 — lifecycle happy path
1. `POST .../encounters {name, sessionId}` → assert `status:0`, `roundNumber:0`,
   `activeCombatantId:null`, `combatants:[]`.
2. Add combatants: 2 PC-linked (`characterId` set → disposition 0) + 3 freeform
   enemies (`characterId:null` → disposition 2). Assert `CombatantAdded` (10)
   logged; PC-linked combatants come back with snapshotted `resources` /
   `spellSlots` / `pactSlot`.
3. Initiative: `setInitiative` on a couple, then `roll-initiatives` (no body =
   roll all). Assert each `initiative` populated; PC-linked rolls include the Dex
   modifier (server-side d20+bonus).
4. `PUT .../start` → assert `status:1`, `roundNumber:1`, `combatants` sorted by
   `initiative` desc then name asc (`sortOrder` 0..n), `activeCombatantId ===`
   top combatant.
5. `next-turn` through a full cycle → assert `activeCombatantId` advances down
   `sortOrder`, **skips dead combatants**, and on wrap `roundNumber → 2` with a
   `TurnChanged` (3) log.
6. `prev-turn` → assert rewind to the previous living combatant, `roundNumber`
   decrements on wrap, a `TurnRewound` (4) log; at round 1 / first turn → `422`
   ("already at the first living turn"). **Effects are NOT re-incremented on
   rewind** — assert a previously-expired effect stays gone.
7. `PUT .../end` → assert `status:2`, `activeCombatantId:null`, `EncounterEnded`
   (2) log.

### 5.2 C2 — HP & death
- **Temp HP absorption:** set temp HP via `{setTempHp:5}`; deal `{delta:-8}`;
  assert temp drained first (temp 0, current −3 from the 8).
- **Heal cap:** `{delta:+999}` → assert `currentHp === maxHp` (no overheal).
- **Direct set:** `{setCurrentHp:n}` clamps to `[0, maxHp]`; logs `HpSet` (22).
- **PC dying:** drop a PC to 0 → `isDead:false`, death saves now applicable.
  `recordDeathSaves {failures:3}` → `isDead:true` + concentration swept.
- **Staying down:** PC at 0, apply `{delta:0}`/another 0→0 transition → death
  saves **not** reset.
- **Reset on revival:** heal a downed PC above 0 → death-save counts reset to 0.
- **NPC instant death:** freeform combatant to 0 → `isDead:true` immediately (no
  death saves), concentration it sourced is swept.
- **Authz:** a player can `updateHp` on their **own** PC combatant (`200`) but
  on another PC or a freeform NPC → `403`.

### 5.3 C3 — status effects & concentration
- Add a **timed** effect: `{statusEffectId, remainingRounds:2, sourceCombatantId}`
  → `StatusApplied` (30). Advance two full rounds → assert `remainingRounds`
  decrements on each wrap and the effect auto-removes at 0 with a
  `StatusRemoved` (31) log whose message reads "expired".
- **Re-apply / refresh:** add the same effect again before expiry → assert it
  refreshes `remainingRounds`/`sourceCombatantId` in place (no duplicate entry)
  and does **not** emit a second `StatusApplied` log.
- **Break concentration:** `break-concentration` on the source combatant → all
  effects with that `sourceCombatantId` swept, each logged `StatusRemoved` with
  "concentration-broken".
- **Source removal sweep:** `removeCombatant` on a source → its sourced effects
  swept first (logged), then `CombatantRemoved` (11).

### 5.4 C4 — resources, spell slots, rest
- Set a resource: `PUT .../resources/{key} {remaining:n}` → clamps to `[0,max]`,
  `ResourceChanged` (40). Setting an unknown key → `400`.
- Set a spell slot: `PUT .../spell-slots/{level} {remaining:n}` → clamp,
  `SpellSlotChanged` (41). Warlock pact: `{remaining:n, isPact:true}` targets the
  `pactSlot`. Unknown level / wrong pact flag → `400`.
- **Short rest** `{kind:1}` → only `recharge:ShortRest(1)` resources + pact slots
  restored to max; standard spell slots untouched. `Rested` (42) log.
- **Long rest** `{kind:2}` → all resources + all spell slots + pact restored.
- `{kind:0}` or `{kind:3}` → `422`.

### 5.5 C5 — buffs / roll modifiers (the no-double-count invariant)
Apply a status effect carrying `rollModifiers` and assert the split (CLAUDE.md
buffs rule):
- **Flat (kind 0)** riders are **pre-folded** into the linked character's derived
  numbers — assert they do **not** also appear as a separate live rider to
  re-apply. (Render-only; double-applying is the bug this guards.)
- **Dice (kind 1)** and **Advantage/Disadvantage (kind 2/3)** *do* surface via
  `combatant`/`CharacterResponse.rollModifiers` / `rollAdvantages` — assert
  `diceCount` (signed: Bless +1, Bane −1), `dieSize`, and `appliesToStatId`
  scope are present. Assert multiple advantage + disadvantage sources net per 5e
  (advantage+disadvantage = straight roll).

### 5.6 C6 — DM controls & visibility
- `PATCH .../encounters/{id} {turnOrderHiddenFromPlayers:true}` → assert flag set,
  full `EncounterResponse` returned.
- `PATCH .../combatants/{id} {isHiddenFromPlayers, hpHiddenFromPlayers,
  acHiddenFromPlayers, disposition}` → assert per-field COALESCE (null keeps
  current). Lowering `maxHp` below `currentHp` clamps `currentHp` down.

### 5.7 C7 — combat log
- `GET .../log?take=5` → newest-first page, ≤5 entries, `nextBefore` cursor;
  page backwards with `before=nextBefore`; `take` clamps to `[1,100]`.
- `POST .../log {message}` → `DmNote` (90) entry returned.
- Across the C1–C5 run assert the **event-type coverage**: at least one each of
  1,2,3,4,10,11,12,20,21,22,23,30,31,40,41,42,90.
- `DELETE .../log/{seq}` → `204`; deleting a non-existent seq → `404`. *(Note:
  the frontend wires `deleteLogEntry` but the backend route may be pending — if
  it `404`s/`405`s on a valid seq, that's a FINDING, not a test failure.)*

### 5.8 C8 — guards & authorization
| Action | Expected |
|---|---|
| Create encounter with `sessionId:null` | `422` (session required) |
| Create encounter with a session from another campaign | `422` |
| Delete a session that still holds a live (non-archived) encounter | `409` ("Session has encounters") |
| Non-member `GET` an encounter | `404` |
| Player mutates another player's PC combatant | `403` |
| Player mutates a freeform NPC | `403` |
| Player mutates **own** PC combatant HP / resources / status | `200` |
| `start` when status ≠ Pending | `422` |
| `next-turn` / `prev-turn` / `end` when status ≠ Active | `422` |
| `next-turn` with zero living combatants | `422` |
| Add combatant to an Ended encounter | `422` |

---

## 6. Execution harness (recommendation, not yet built)

- **Language:** the repo is TypeScript/Node 22 (global `fetch` available). The
  cleanest fit is a standalone, out-of-build harness in
  `tests/api-e2e/` (NOT under `src/`, NOT in `tsc -b`): a tiny `assert`/`expect`
  helper + a `client.ts` that wraps fetch with the Bearer, + one file per suite
  (`suite-a-levelup.ts`, `suite-b-creation.ts`, `suite-c-encounter.ts`) + a
  `preflight.ts` building the id maps. Run with `tsx tests/api-e2e/run.ts` or
  plain `node` after a one-off `esbuild` — keep it off the `npm run build` path.
- **Alternative for manual runs:** a set of `.http` / REST-client files with the
  payloads from §3–§5 (good for eyeballing single endpoints; poor for the ~240
  level transitions of Suite A — those need the loop).
- **Config:** `BASE` env var (`http://localhost:3501` IIS or `:5157` Kestrel),
  `TEST_USER` / `TEST_PASS` for the throwaway account.
- **Report:** emit a per-suite PASS/FAIL/FINDING matrix to stdout + a JSON
  artifact; non-zero exit on any FAIL.
- **DB hygiene:** register a throwaway account per run; delete every created
  character/campaign in teardown; never run Suite A/B against `dungeonmaster`
  (its vault/campaign data is reused by the spectral recipe).

## 7. Known coverage limits (call these out in the report)

- **1 subclass per class** in the seed data → subclass *variety* and
  subclass-specific feature trees beyond the single seeded option are untestable
  until more are seeded.
- **No Artificer** — 12 classes only.
- **Spell-slot / resource progression** is the weakest oracle (derive what you
  can from the rows; spot-check the rest). Don't over-assert here.
- **Roll-time randomness** (HP roll mode, initiative rolls) is non-deterministic
  — the convergence invariant (§4.1) must use **Average** HP mode.
- **`prev-turn` and `deleteLogEntry`** have frontend stubs whose backend routes
  may be pending — treat a missing route as a FINDING.
- Suite A is **~240 level transitions**; budget run time accordingly and allow
  per-class parallelism (independent characters, independent ids).

---

## 8. Per-class, per-level reference (generated from live seed data, 2026-06-13)

> Authoritative dump of the seeded catalog so an agent need not re-query `/api/classes`.
> Feature **names** only (descriptions omitted for scannability — fetch the class
> response if you need rules text). `kind=1`→**ASI/Feat** due that level; `kind=2`→**Subclass**
> choice due. Each class has exactly **one** seeded subclass (shown). Spell columns:
> Cant=cantrips known (cumulative), Spells=levelled spells known (known casters) /
> `prep`=prepared caster (count not fixed) / `book N`=Wizard spellbook size (required).
> MaxL=highest castable spell level. Slots=`level×count` (Warlock=pact slots).
> PB=proficiency bonus.

### Barbarian — d12, None. Subclass at L3: **Berserker**.

| Lvl | PB | Features (base + subclass) | Choices |
|----|----|----|----|
| 1 | +2 | Rage, Unarmored Defense | — |
| 2 | +2 | Danger Sense, Reckless Attack | — |
| 3 | +2 | Primal Path *(subclass)*, Frenzy _[Berserker]_ | — |
| 4 | +2 | **ASI/Feat** | — |
| 5 | +3 | Extra Attack, Fast Movement | — |
| 6 | +3 | Path feature, Mindless Rage _[Berserker]_ | — |
| 7 | +3 | Feral Instinct | — |
| 8 | +3 | **ASI/Feat** | — |
| 9 | +4 | Brutal Critical (1 die) | — |
| 10 | +4 | Path feature, Intimidating Presence _[Berserker]_ | — |
| 11 | +4 | Relentless Rage | — |
| 12 | +4 | **ASI/Feat** | — |
| 13 | +5 | Brutal Critical (2 dice) | — |
| 14 | +5 | Path feature, Retaliation _[Berserker]_ | — |
| 15 | +5 | Persistent Rage | — |
| 16 | +5 | **ASI/Feat** | — |
| 17 | +6 | Brutal Critical (3 dice) | — |
| 18 | +6 | Indomitable Might | — |
| 19 | +6 | **ASI/Feat** | — |
| 20 | +6 | Primal Champion | — |

### Bard — d8, Full (known). Subclass at L3: **Lore**.

| Lvl | PB | Features (base + subclass) | Choices | Cant | Spells | MaxL | Slots |
|----|----|----|----|----|----|----|----|
| 1 | +2 | Bardic Inspiration (d6), Spellcasting | — | 2 | 4 | 1 | 1×2 |
| 2 | +2 | Jack of All Trades, Song of Rest (d6) | — | 2 | 5 | 1 | 1×3 |
| 3 | +2 | Bard College *(subclass)*, Expertise, Cutting Words _[Lore]_, Bonus Proficiencies _[Lore]_ | Expertise ×2 | 2 | 6 | 2 | 1×4 2×2 |
| 4 | +2 | **ASI/Feat** | — | 3 | 7 | 2 | 1×4 2×3 |
| 5 | +3 | Bardic Inspiration (d8), Font of Inspiration | — | 3 | 8 | 3 | 1×4 2×3 3×2 |
| 6 | +3 | Bard College feature, Countercharm, Additional Magical Secrets _[Lore]_ | — | 3 | 9 | 3 | 1×4 2×3 3×3 |
| 7 | +3 | — | — | 3 | 10 | 4 | 1×4 2×3 3×3 4×1 |
| 8 | +3 | **ASI/Feat** | — | 3 | 11 | 4 | 1×4 2×3 3×3 4×2 |
| 9 | +4 | Song of Rest (d8) | — | 3 | 12 | 5 | 1×4 2×3 3×3 4×3 5×1 |
| 10 | +4 | Bardic Inspiration (d10), Expertise, Magical Secrets | Expertise ×2 | 4 | 14 | 5 | 1×4 2×3 3×3 4×3 5×2 |
| 11 | +4 | — | — | 4 | 15 | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 12 | +4 | **ASI/Feat** | — | 4 | 15 | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 13 | +5 | Song of Rest (d10) | — | 4 | 16 | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 14 | +5 | Bard College feature, Magical Secrets, Peerless Skill _[Lore]_ | — | 4 | 18 | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 15 | +5 | Bardic Inspiration (d12) | — | 4 | 19 | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 16 | +5 | **ASI/Feat** | — | 4 | 19 | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 17 | +6 | Song of Rest (d12) | — | 4 | 20 | 9 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 9×1 |
| 18 | +6 | Magical Secrets | — | 4 | 22 | 9 | 1×4 2×3 3×3 4×3 5×3 6×1 7×1 8×1 9×1 |
| 19 | +6 | **ASI/Feat** | — | 4 | 22 | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×1 8×1 9×1 |
| 20 | +6 | Superior Inspiration | — | 4 | 22 | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×2 8×1 9×1 |

### Cleric — d8, Full (prepared). Subclass at L1: **Life Domain**.

| Lvl | PB | Features (base + subclass) | Choices | Cant | Spells | MaxL | Slots |
|----|----|----|----|----|----|----|----|
| 1 | +2 | Divine Domain *(subclass)*, Domain Spells, Spellcasting, Disciple of Life _[Life Domain]_, Bonus Proficiency _[Life Domain]_ | — | 3 | prep | 1 | 1×2 |
| 2 | +2 | Channel Divinity (1/rest), Channel Divinity: Turn Undead, Divine Domain feature, Channel Divinity: Preserve Life _[Life Domain]_ | — | 3 | prep | 1 | 1×3 |
| 3 | +2 | Domain Spells | — | 3 | prep | 2 | 1×4 2×2 |
| 4 | +2 | **ASI/Feat** | — | 4 | prep | 2 | 1×4 2×3 |
| 5 | +3 | Destroy Undead (CR 1/2 or below), Domain Spells | — | 4 | prep | 3 | 1×4 2×3 3×2 |
| 6 | +3 | Channel Divinity (2/rest), Divine Domain feature, Blessed Healer _[Life Domain]_ | — | 4 | prep | 3 | 1×4 2×3 3×3 |
| 7 | +3 | Domain Spells | — | 4 | prep | 4 | 1×4 2×3 3×3 4×1 |
| 8 | +3 | **ASI/Feat**, Destroy Undead (CR 1 or below), Divine Domain feature, Divine Strike _[Life Domain]_ | — | 4 | prep | 4 | 1×4 2×3 3×3 4×2 |
| 9 | +4 | Domain Spells | — | 4 | prep | 5 | 1×4 2×3 3×3 4×3 5×1 |
| 10 | +4 | Divine Intervention | — | 5 | prep | 5 | 1×4 2×3 3×3 4×3 5×2 |
| 11 | +4 | Destroy Undead (CR 2 or below) | — | 5 | prep | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 12 | +4 | **ASI/Feat** | — | 5 | prep | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 13 | +5 | — | — | 5 | prep | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 14 | +5 | Destroy Undead (CR 3 or below) | — | 5 | prep | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 15 | +5 | — | — | 5 | prep | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 16 | +5 | **ASI/Feat** | — | 5 | prep | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 17 | +6 | Destroy Undead (CR 4 or below), Divine Domain feature, Supreme Healing | — | 5 | prep | 9 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 9×1 |
| 18 | +6 | Channel Divinity (3/rest) | — | 5 | prep | 9 | 1×4 2×3 3×3 4×3 5×3 6×1 7×1 8×1 9×1 |
| 19 | +6 | **ASI/Feat** | — | 5 | prep | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×1 8×1 9×1 |
| 20 | +6 | Divine Intervention Improvement | — | 5 | prep | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×2 8×1 9×1 |

### Druid — d8, Full (prepared). Subclass at L2: **Land**.

| Lvl | PB | Features (base + subclass) | Choices | Cant | Spells | MaxL | Slots |
|----|----|----|----|----|----|----|----|
| 1 | +2 | Druidic, Spellcasting | — | 2 | prep | 1 | 1×2 |
| 2 | +2 | Druid Circle *(subclass)*, Wild Shape (CR 1/4 or below, no flying or swim speed), Bonus Cantrip _[Land]_, Natural Recovery _[Land]_, Circle of the Land: Swamp _[Land]_, Circle of the Land: Forest _[Land]_, Circle of the Land _[Land]_, Circle of the Land: Coast _[Land]_, Circle of the Land: Grassland _[Land]_, Circle of the Land: Desert _[Land]_, Circle of the Land: Arctic _[Land]_, Circle of the Land: Mountain _[Land]_ | — | 2 | prep | 1 | 1×3 |
| 3 | +2 | Circle Spells _[Land]_ | — | 2 | prep | 2 | 1×4 2×2 |
| 4 | +2 | **ASI/Feat**, Wild Shape (CR 1/2 or below, no flying speed) | — | 3 | prep | 2 | 1×4 2×3 |
| 5 | +3 | Circle Spells _[Land]_ | — | 3 | prep | 3 | 1×4 2×3 3×2 |
| 6 | +3 | Druid Circle feature, Land's Stride _[Land]_ | — | 3 | prep | 3 | 1×4 2×3 3×3 |
| 7 | +3 | Circle Spells _[Land]_ | — | 3 | prep | 4 | 1×4 2×3 3×3 4×1 |
| 8 | +3 | **ASI/Feat**, Wild Shape (CR 1 or below) | — | 3 | prep | 4 | 1×4 2×3 3×3 4×2 |
| 9 | +4 | Circle Spells _[Land]_ | — | 3 | prep | 5 | 1×4 2×3 3×3 4×3 5×1 |
| 10 | +4 | Druid Circle feature, Nature's Ward _[Land]_ | — | 4 | prep | 5 | 1×4 2×3 3×3 4×3 5×2 |
| 11 | +4 | — | — | 4 | prep | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 12 | +4 | **ASI/Feat** | — | 4 | prep | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 13 | +5 | — | — | 4 | prep | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 14 | +5 | Druid Circle feature, Nature's Sanctuary _[Land]_ | — | 4 | prep | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 15 | +5 | — | — | 4 | prep | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 16 | +5 | **ASI/Feat** | — | 4 | prep | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 17 | +6 | — | — | 4 | prep | 9 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 9×1 |
| 18 | +6 | Beast Spells, Timeless Body | — | 4 | prep | 9 | 1×4 2×3 3×3 4×3 5×3 6×1 7×1 8×1 9×1 |
| 19 | +6 | **ASI/Feat** | — | 4 | prep | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×1 8×1 9×1 |
| 20 | +6 | Archdruid | — | 4 | prep | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×2 8×1 9×1 |

### Fighter — d10, None. Subclass at L3: **Champion**.

| Lvl | PB | Features (base + subclass) | Choices |
|----|----|----|----|
| 1 | +2 | Fighting Style, Second Wind | Fighting Style ×1 |
| 2 | +2 | Action Surge (1 use) | — |
| 3 | +2 | Martial Archetype *(subclass)*, Improved Critical _[Champion]_ | — |
| 4 | +2 | **ASI/Feat** | — |
| 5 | +3 | Extra Attack | — |
| 6 | +3 | **ASI/Feat** | — |
| 7 | +3 | Martial Archetype feature, Remarkable Athlete _[Champion]_ | — |
| 8 | +3 | **ASI/Feat** | — |
| 9 | +4 | Indomitable (1 use) | — |
| 10 | +4 | Martial Archetype feature, Additional Fighting Style _[Champion]_ | Fighting Style ×1 |
| 11 | +4 | Extra Attack (2) | — |
| 12 | +4 | **ASI/Feat** | — |
| 13 | +5 | Indomitable (2 uses) | — |
| 14 | +5 | **ASI/Feat** | — |
| 15 | +5 | Martial Archetype feature, Superior Critical _[Champion]_ | — |
| 16 | +5 | **ASI/Feat** | — |
| 17 | +6 | Action Surge (2 uses), Indomitable (3 uses) | — |
| 18 | +6 | Martial Archetype feature, Survivor _[Champion]_ | — |
| 19 | +6 | **ASI/Feat** | — |
| 20 | +6 | Extra Attack (3) | — |

### Monk — d8, None. Subclass at L3: **Open Hand**.

| Lvl | PB | Features (base + subclass) | Choices |
|----|----|----|----|
| 1 | +2 | Martial Arts, Unarmored Defense | — |
| 2 | +2 | Flurry of Blows, Ki, Patient Defense, Step of the Wind, Unarmored Movement | — |
| 3 | +2 | Deflect Missiles, Monastic Tradition *(subclass)*, Open Hand Technique _[Open Hand]_ | — |
| 4 | +2 | **ASI/Feat**, Slow Fall | — |
| 5 | +3 | Extra Attack, Stunning Strike | — |
| 6 | +3 | Ki Empowered Strikes, Monastic Tradition feature, Wholeness of Body _[Open Hand]_ | — |
| 7 | +3 | Evasion, Stillness of Mind | — |
| 8 | +3 | **ASI/Feat** | — |
| 9 | +4 | Unarmored Movement | — |
| 10 | +4 | Purity of Body | — |
| 11 | +4 | Monastic Tradition feature, Tranquility _[Open Hand]_ | — |
| 12 | +4 | **ASI/Feat** | — |
| 13 | +5 | Tongue of the Sun and Moon | — |
| 14 | +5 | Diamond Soul | — |
| 15 | +5 | Timeless Body | — |
| 16 | +5 | **ASI/Feat** | — |
| 17 | +6 | Monastic Tradition feature, Quivering Palm _[Open Hand]_ | — |
| 18 | +6 | Empty Body | — |
| 19 | +6 | **ASI/Feat** | — |
| 20 | +6 | Perfect Self | — |

### Paladin — d10, Half (prepared). Subclass at L3: **Devotion**.

| Lvl | PB | Features (base + subclass) | Choices | Cant | Spells | MaxL | Slots |
|----|----|----|----|----|----|----|----|
| 1 | +2 | Divine Sense, Lay on Hands | — | — | — | — | — |
| 2 | +2 | Divine Smite, Fighting Style, Spellcasting | Fighting Style ×1 | — | prep | 1 | 1×2 |
| 3 | +2 | Channel Divinity, Divine Health, Oath Spells, Sacred Oath *(subclass)*, Channel Divinity: Sacred Weapon _[Devotion]_, Channel Divinity: Turn the Unholy _[Devotion]_ | — | — | prep | 1 | 1×3 |
| 4 | +2 | **ASI/Feat** | — | — | prep | 1 | 1×3 |
| 5 | +3 | Extra Attack | — | — | prep | 2 | 1×4 2×2 |
| 6 | +3 | Aura of Protection | — | — | prep | 2 | 1×4 2×2 |
| 7 | +3 | Sacred Oath feature, Aura of Devotion _[Devotion]_ | — | — | prep | 2 | 1×4 2×3 |
| 8 | +3 | **ASI/Feat** | — | — | prep | 2 | 1×4 2×3 |
| 9 | +4 | — | — | — | prep | 3 | 1×4 2×3 3×2 |
| 10 | +4 | Aura of Courage | — | — | prep | 3 | 1×4 2×3 3×2 |
| 11 | +4 | Improved Divine Smite | — | — | prep | 3 | 1×4 2×3 3×3 |
| 12 | +4 | **ASI/Feat** | — | — | prep | 3 | 1×4 2×3 3×3 |
| 13 | +5 | — | — | — | prep | 4 | 1×4 2×3 3×3 4×1 |
| 14 | +5 | Cleansing Touch | — | — | prep | 4 | 1×4 2×3 3×3 4×1 |
| 15 | +5 | Sacred Oath feature, Purity of Spirit _[Devotion]_ | — | — | prep | 4 | 1×4 2×3 3×3 4×2 |
| 16 | +5 | **ASI/Feat** | — | — | prep | 4 | 1×4 2×3 3×3 4×2 |
| 17 | +6 | — | — | — | prep | 5 | 1×4 2×3 3×3 4×3 5×1 |
| 18 | +6 | Aura improvements | — | — | prep | 5 | 1×4 2×3 3×3 4×3 5×1 |
| 19 | +6 | **ASI/Feat** | — | — | prep | 5 | 1×4 2×3 3×3 4×3 5×2 |
| 20 | +6 | Sacred Oath feature, Holy Nimbus _[Devotion]_ | — | — | prep | 5 | 1×4 2×3 3×3 4×3 5×2 |

### Ranger — d10, Half (known). Subclass at L3: **Hunter**.

| Lvl | PB | Features (base + subclass) | Choices | Cant | Spells | MaxL | Slots |
|----|----|----|----|----|----|----|----|
| 1 | +2 | Favored Enemy, Favored Enemy (1 type), Natural Explorer (1 terrain type) | — | — | — | — | — |
| 2 | +2 | Fighting Style, Spellcasting | Fighting Style ×1 | — | 2 | 1 | 1×2 |
| 3 | +2 | Primeval Awareness, Ranger Archetype *(subclass)*, Hunter's Prey: Giant Killer _[Hunter]_, Hunter's Prey _[Hunter]_, Hunter's Prey: Colossus Slayer _[Hunter]_, Hunter's Prey: Horde Breaker _[Hunter]_ | — | — | 3 | 1 | 1×3 |
| 4 | +2 | **ASI/Feat** | — | — | 3 | 1 | 1×3 |
| 5 | +3 | Extra Attack | — | — | 4 | 2 | 1×4 2×2 |
| 6 | +3 | Favored Enemy (2 types), Natural Explorer (2 terrain types) | — | — | 4 | 2 | 1×4 2×2 |
| 7 | +3 | Ranger Archetype feature, Defensive Tactics _[Hunter]_, Defensive Tactics: Multiattack Defense _[Hunter]_, Defensive Tactics: Escape the Horde _[Hunter]_, Defensive Tactics: Steel Will _[Hunter]_ | — | — | 5 | 2 | 1×4 2×3 |
| 8 | +3 | **ASI/Feat**, Land's Stride | — | — | 5 | 2 | 1×4 2×3 |
| 9 | +4 | — | — | — | 6 | 3 | 1×4 2×3 3×2 |
| 10 | +4 | Hide in Plain Sight, Natural Explorer (3 terrain types) | — | — | 6 | 3 | 1×4 2×3 3×2 |
| 11 | +4 | Ranger Archetype feature, Multiattack: Whirlwind Attack _[Hunter]_, Multiattack _[Hunter]_, Multiattack: Volley _[Hunter]_ | — | — | 7 | 3 | 1×4 2×3 3×3 |
| 12 | +4 | **ASI/Feat** | — | — | 7 | 3 | 1×4 2×3 3×3 |
| 13 | +5 | — | — | — | 8 | 4 | 1×4 2×3 3×3 4×1 |
| 14 | +5 | Favored Enemy (3 enemies), Vanish | — | — | 8 | 4 | 1×4 2×3 3×3 4×1 |
| 15 | +5 | Ranger Archetype feature, Superior Hunter's Defense _[Hunter]_, Superior Hunter's Defense: Evasion _[Hunter]_, Superior Hunter's Defense: Uncanny Dodge _[Hunter]_, Superior Hunter's Defense: Stand Against the Tide _[Hunter]_ | — | — | 9 | 4 | 1×4 2×3 3×3 4×2 |
| 16 | +5 | **ASI/Feat** | — | — | 9 | 4 | 1×4 2×3 3×3 4×2 |
| 17 | +6 | — | — | — | 10 | 5 | 1×4 2×3 3×3 4×3 5×1 |
| 18 | +6 | Feral Senses | — | — | 10 | 5 | 1×4 2×3 3×3 4×3 5×1 |
| 19 | +6 | **ASI/Feat** | — | — | 11 | 5 | 1×4 2×3 3×3 4×3 5×2 |
| 20 | +6 | Foe Slayer | — | — | 11 | 5 | 1×4 2×3 3×3 4×3 5×2 |

### Rogue — d8, None. Subclass at L3: **Thief**.

| Lvl | PB | Features (base + subclass) | Choices |
|----|----|----|----|
| 1 | +2 | Expertise, Sneak Attack, Thieves' Cant | Expertise ×2 |
| 2 | +2 | Cunning Action | — |
| 3 | +2 | Roguish Archetype *(subclass)*, Fast Hands _[Thief]_, Second-Story Work _[Thief]_ | — |
| 4 | +2 | **ASI/Feat** | — |
| 5 | +3 | Uncanny Dodge | — |
| 6 | +3 | Expertise | Expertise ×2 |
| 7 | +3 | Evasion | — |
| 8 | +3 | **ASI/Feat** | — |
| 9 | +4 | Roguish Archetype feature, Supreme Sneak _[Thief]_ | — |
| 10 | +4 | **ASI/Feat** | — |
| 11 | +4 | Reliable Talent | — |
| 12 | +4 | **ASI/Feat** | — |
| 13 | +5 | Roguish Archetype feature, Use Magic Device _[Thief]_ | — |
| 14 | +5 | Blindsense | — |
| 15 | +5 | Slippery Mind | — |
| 16 | +5 | **ASI/Feat** | — |
| 17 | +6 | Roguish Archetype feature, Thief's Reflexes _[Thief]_ | — |
| 18 | +6 | Elusive | — |
| 19 | +6 | **ASI/Feat** | — |
| 20 | +6 | Stroke of Luck | — |

### Sorcerer — d6, Full (known). Subclass at L1: **Draconic**.

| Lvl | PB | Features (base + subclass) | Choices | Cant | Spells | MaxL | Slots |
|----|----|----|----|----|----|----|----|
| 1 | +2 | Sorcerous Origin *(subclass)*, Spellcasting, Dragon Ancestor: Copper - Acid Damage _[Draconic]_, Dragon Ancestor: Bronze - Lightning Damage _[Draconic]_, Dragon Ancestor: Silver - Cold Damage _[Draconic]_, Dragon Ancestor: Gold - Fire Damage _[Draconic]_, Dragon Ancestor _[Draconic]_, Draconic Resilience _[Draconic]_, Dragon Ancestor: Brass - Fire Damage _[Draconic]_, Dragon Ancestor: Red - Fire Damage _[Draconic]_, Dragon Ancestor: Blue - Lightning Damage _[Draconic]_, Dragon Ancestor: White - Cold Damage _[Draconic]_, Dragon Ancestor: Green - Poison Damage _[Draconic]_, Dragon Ancestor: Black - Acid Damage _[Draconic]_ | — | 4 | 2 | 1 | 1×2 |
| 2 | +2 | Flexible Casting: Converting Spell Slot, Flexible Casting: Creating Spell Slots, Font of Magic | — | 4 | 3 | 1 | 1×3 |
| 3 | +2 | Metamagic, Metamagic: Careful Spell, Metamagic: Distant Spell, Metamagic: Empowered Spell, Metamagic: Extended Spell, Metamagic: Heightened Spell, Metamagic: Quickened Spell, Metamagic: Subtle Spell, Metamagic: Twinned Spell | Metamagic ×2 | 4 | 4 | 2 | 1×4 2×2 |
| 4 | +2 | **ASI/Feat** | — | 5 | 5 | 2 | 1×4 2×3 |
| 5 | +3 | — | — | 5 | 6 | 3 | 1×4 2×3 3×2 |
| 6 | +3 | Sorcerous Origin feature, Elemental Affinity _[Draconic]_ | — | 5 | 7 | 3 | 1×4 2×3 3×3 |
| 7 | +3 | — | — | 5 | 8 | 4 | 1×4 2×3 3×3 4×1 |
| 8 | +3 | **ASI/Feat** | — | 5 | 9 | 4 | 1×4 2×3 3×3 4×2 |
| 9 | +4 | — | — | 5 | 10 | 5 | 1×4 2×3 3×3 4×3 5×1 |
| 10 | +4 | Metamagic | Metamagic ×1 | 6 | 11 | 5 | 1×4 2×3 3×3 4×3 5×2 |
| 11 | +4 | — | — | 6 | 12 | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 12 | +4 | **ASI/Feat** | — | 6 | 12 | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 13 | +5 | — | — | 6 | 13 | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 14 | +5 | Sorcerous Origin feature, Dragon Wings _[Draconic]_ | — | 6 | 13 | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 15 | +5 | — | — | 6 | 14 | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 16 | +5 | **ASI/Feat** | — | 6 | 14 | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 17 | +6 | Metamagic | Metamagic ×1 | 6 | 15 | 9 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 9×1 |
| 18 | +6 | Sorcerous Origin feature, Draconic Presence _[Draconic]_ | — | 6 | 15 | 9 | 1×4 2×3 3×3 4×3 5×3 6×1 7×1 8×1 9×1 |
| 19 | +6 | **ASI/Feat** | — | 6 | 15 | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×1 8×1 9×1 |
| 20 | +6 | Sorcerous Restoration | — | 6 | 15 | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×2 8×1 9×1 |

### Warlock — d8, Pact (known). Subclass at L1: **Fiend**.

| Lvl | PB | Features (base + subclass) | Choices | Cant | Spells | MaxL | Slots |
|----|----|----|----|----|----|----|----|
| 1 | +2 | Otherworldly Patron *(subclass)*, Pact Magic, Dark One's Blessing _[Fiend]_ | — | 2 | 2 | 1 | 1×1 |
| 2 | +2 | Eldritch Invocations | Eldritch Invocation ×2 | 2 | 3 | 1 | 1×2 |
| 3 | +2 | Pact Boon, Pact of the Blade, Pact of the Chain, Pact of the Tome | — | 2 | 4 | 2 | 2×2 |
| 4 | +2 | **ASI/Feat** | — | 3 | 5 | 2 | 2×2 |
| 5 | +3 | Eldritch Invocations | Eldritch Invocation ×1 | 3 | 6 | 3 | 3×2 |
| 6 | +3 | Otherworldly Patron feature, Dark One's Own Luck _[Fiend]_ | — | 3 | 7 | 3 | 3×2 |
| 7 | +3 | Eldritch Invocations | Eldritch Invocation ×1 | 3 | 8 | 4 | 4×2 |
| 8 | +3 | **ASI/Feat** | — | 3 | 9 | 4 | 4×2 |
| 9 | +4 | Eldritch Invocations | Eldritch Invocation ×1 | 3 | 10 | 5 | 5×2 |
| 10 | +4 | Otherworldly Patron feature, Fiendish Resilience _[Fiend]_ | — | 4 | 10 | 5 | 5×2 |
| 11 | +4 | Mystic Arcanum (6th level) | — | 4 | 11 | 5 | 5×3 |
| 12 | +4 | **ASI/Feat**, Eldritch Invocations | Eldritch Invocation ×1 | 4 | 11 | 5 | 5×3 |
| 13 | +5 | Mystic Arcanum (7th level) | — | 4 | 12 | 5 | 5×3 |
| 14 | +5 | Otherworldly Patron feature, Hurl Through Hell _[Fiend]_ | — | 4 | 12 | 5 | 5×3 |
| 15 | +5 | Eldritch Invocations, Mystic Arcanum (8th level) | Eldritch Invocation ×1 | 4 | 13 | 5 | 5×3 |
| 16 | +5 | **ASI/Feat** | — | 4 | 13 | 5 | 5×3 |
| 17 | +6 | Mystic Arcanum (9th level) | — | 4 | 14 | 5 | 5×4 |
| 18 | +6 | Eldritch Invocations | Eldritch Invocation ×1 | 4 | 14 | 5 | 5×4 |
| 19 | +6 | **ASI/Feat** | — | 4 | 15 | 5 | 5×4 |
| 20 | +6 | Eldritch Master | — | 4 | 15 | 5 | 5×4 |

### Wizard — d6, Full (prepared). Subclass at L2: **Evocation**.

| Lvl | PB | Features (base + subclass) | Choices | Cant | Spells | MaxL | Slots |
|----|----|----|----|----|----|----|----|
| 1 | +2 | Arcane Recovery, Spellcasting | — | 3 | book 6 | 1 | 1×2 |
| 2 | +2 | Arcane Tradition *(subclass)*, Evocation Savant _[Evocation]_, Sculpt Spells _[Evocation]_ | — | 3 | book 8 | 1 | 1×3 |
| 3 | +2 | — | — | 3 | book 10 | 2 | 1×4 2×2 |
| 4 | +2 | **ASI/Feat** | — | 4 | book 12 | 2 | 1×4 2×3 |
| 5 | +3 | — | — | 4 | book 14 | 3 | 1×4 2×3 3×2 |
| 6 | +3 | Arcane Tradition feature, Potent Cantrip _[Evocation]_ | — | 4 | book 16 | 3 | 1×4 2×3 3×3 |
| 7 | +3 | — | — | 4 | book 18 | 4 | 1×4 2×3 3×3 4×1 |
| 8 | +3 | **ASI/Feat** | — | 4 | book 20 | 4 | 1×4 2×3 3×3 4×2 |
| 9 | +4 | — | — | 4 | book 22 | 5 | 1×4 2×3 3×3 4×3 5×1 |
| 10 | +4 | Arcane Tradition feature, Empowered Evocation _[Evocation]_ | — | 5 | book 24 | 5 | 1×4 2×3 3×3 4×3 5×2 |
| 11 | +4 | — | — | 5 | book 26 | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 12 | +4 | **ASI/Feat** | — | 5 | book 28 | 6 | 1×4 2×3 3×3 4×3 5×2 6×1 |
| 13 | +5 | — | — | 5 | book 30 | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 14 | +5 | Arcane Tradition feature, Overchannel _[Evocation]_ | — | 5 | book 32 | 7 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 |
| 15 | +5 | — | — | 5 | book 34 | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 16 | +5 | **ASI/Feat** | — | 5 | book 36 | 8 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 |
| 17 | +6 | — | — | 5 | book 38 | 9 | 1×4 2×3 3×3 4×3 5×2 6×1 7×1 8×1 9×1 |
| 18 | +6 | Spell Mastery | — | 5 | book 40 | 9 | 1×4 2×3 3×3 4×3 5×3 6×1 7×1 8×1 9×1 |
| 19 | +6 | **ASI/Feat** | — | 5 | book 42 | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×1 8×1 9×1 |
| 20 | +6 | Signature Spell | — | 5 | book 44 | 9 | 1×4 2×3 3×3 4×3 5×3 6×2 7×2 8×1 9×1 |

