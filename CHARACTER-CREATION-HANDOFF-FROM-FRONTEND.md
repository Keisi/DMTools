# HANDOFF TO BACKEND — full-fidelity character creation at any level

**To:** the backend session (`C:\Users\keisi\source\repos\DMTool`)
**From:** the DMTool-FrontEnd session
**Date:** 2026-06-07
**Re:** Creating a character **above level 1** (and multiclass) currently drops the
player choices that level should grant. Persistence is already correct — the gaps
are **metadata exposure + two seed holes**. Details, evidence, and precise asks below.

---

## The goal

A user should be able to build a character at **any** total level (1–20), including
**multiclass**, and be prompted for **every choice that level entitles them to** —
ability-score improvements/feats, subclass, known spells/cantrips, and the
sub-feature picks (Fighting Style / Expertise / Metamagic).

## What we verified (live against `:3501` + source read)

Simulation: created characters via the real API and leveled them 1→20 (single-class
Fighter, and a Fighter+Wizard multiclass), plus created a Fighter **directly at L20**
the way the builder's level dial allows. Then traced the planner, the create/update
controller, and the seed.

**The level-up *engine* is correct, and Apply persistence is verified end-to-end.**
`LevelUpPlanner.Plan` surfaces ASI (`:35`), subclass (`:40-46`), spells (`:85-115`), and
the sub-feature `featureChoices` (`:64-72`) at the right levels. Leveling 1→20 works.
`ApplyLevelUp` (`CharacterController.cs:267-321`) collects/validates and mutates the
aggregate with fighting styles, metamagics, expertise, ASIs (as a separate
`AbilityImprovements` collection — base/improvement split preserved), and spells, then
persists via `UpdateAsync`. **Empirically confirmed (2026-06-07):** leveling a Paladin
and a Ranger 1→2 surfaced their Fighting Style choice (type 4, correctly restricted
options), and after Apply + a fresh `GET` the chosen style was present in the DB —
i.e. the `CharacterFightingStyles` join table is written. **The level-up + apply path
needs no backend work.**

**The create/update path already PERSISTS every choice.** `CharacterController` create
(`:883-895`) writes `Spells`, `Feats`, `FightingStyles`, `Metamagics`,
Expertise-level `SkillProficiencies`, and base `AbilityScores` straight onto the entity.
`CharacterRequest` already carries `FightingStyleIds`, `MetamagicIds`, `SpellIds`,
`SkillProficiencies` (with `SkillProficiencyLevel.Expertise`), and `FeatIds`.
**So we do not need new write fields** — the builder can send these today.

**Two structural facts that aren't bugs but shape the design:**
1. The planner only diffs `N → N+1` and **never computes `toLevel == 1`**. So a
   **level-1 feature's choice is unreachable by level-up** — most importantly the
   Fighter's Fighting Style (`f.Level == 1`). The Selection exists and is correctly
   wired (migration `037_FeatureSelections.sql` §C3a/C3b), it's just orphaned: nothing
   surfaces a level-1 feature's selection. **Creation is the only place that can.**
2. The engine cannot apply the **first level of any class** (`LevelUpPlanner.cs:24-25`
   throws if the character lacks the class). So every multiclass *entry* level has the
   same level-1 choice hole. Again, creation must own it.

Conclusion: we will collect level-up-able choices through the existing level-up wizard,
but **entry-level (level-1-of-each-class) choices must be collected at creation** and
sent via the existing `CharacterRequest` fields. For that, the frontend needs metadata
it currently can't get. That's the backend work.

---

## Backend work requested (prioritized)

### 1. [BLOCKER] Expose ClassFeature-sourced selections (Fighting Style / Expertise / Metamagic) in the reference API

`ClassReferenceRepository` already **loads** these and attaches them to
`feature.Selections` (`:66` selects `SourceType IN (1,3)`; `:77,:99`), but
`ClassResponse` (`ReferenceContracts.cs:187-201`) only exposes Job-sourced `Selections`
(skill + subclass) and `Subclasses` (whose `SubclassFeatureResponse` has **no** nested
selections, `:220-224`). **The type-4/5/6 selections never reach the client**, so the
builder cannot render a Fighting Style / Expertise / Metamagic picker, nor know at which
level (and cumulative `choose` count) they apply.

**Ask:** surface the ClassFeature-sourced selections in the class reference response.
Either is fine for us:
- add a `Features` collection to `ClassResponse` with each feature's `Level` + nested
  `Selections` (preferred — also covers subclass features), **or**
- add a flat `FeatureSelections: IReadOnlyList<SelectionResponse>` to `ClassResponse`
  (each `SelectionResponse` already carries `Type`, `Choose`, `Level`, `Options`).

**Acceptance:** `GET /api/classes` for Fighter includes the Fighting Style selection
(type 4, choose 1, level 1, with the 6 style options); Rogue/Bard include Expertise
(type 5) at their levels; Sorcerer includes Metamagic (type 6) with its per-level
`choose`. We render the pickers from this and POST the ids via the existing request
fields. No write-side change needed.

### 2. [BLOCKER for casters] Populate known-caster spell counts in the seed

`Seed/05_Classes.sql` has `CantripsKnown = NULL, SpellsKnown = NULL` on **every**
`ClassSpellcasting` row (`:64+`). The planner computes
`newSpells = progTo.SpellsKnown − progFrom.SpellsKnown` (`LevelUpPlanner.cs:94-95`), so
NULL means **no spell pick is ever prompted** — for level-up *or* creation. A freshly
created Sorcerer knows **0 spells** (verified live).

This is correct for *prepared* casters (Wizard/Cleric/Druid/Paladin — they prepare from
the full list, keep NULL). It is **wrong for known casters**: **Sorcerer, Bard, Ranger,
Warlock** need real `CantripsKnown`/`SpellsKnown` progressions per SRD.

**Ask:** fill `CantripsKnown`/`SpellsKnown` for the four known casters. **Acceptance:**
`POST /levelup/plan` for a Sorcerer returns non-null `newCantrips`/`newSpells`; the
frontend can also read the per-level known counts (via item #1's data or a spellcasting
lookup) to know how many to collect at creation.

### 3. Attach a Fighting Style selection to subclass-granted extra styles

Migration `037_FeatureSelections.sql` §C3a wires only base-class features named exactly
`'Fighting Style'` with `SubclassId IS NULL` (`:166`). The Champion's **"Additional
Fighting Style"** (subclass feature, L10) gets no Selection, so no choice surfaces
(verified — it shows as a granted feature with no pick). The planner already includes
subclass features at `toLevel` (`LevelUpPlanner.cs:53-55,66-72`), so once the Selection
exists it will surface automatically.

**Ask:** extend the seed to attach a type-4 Selection to subclass features that grant an
additional fighting style. **Acceptance:** leveling a Champion to 10 returns a
`featureChoices` entry for the extra style.

### 4. [DECISION] Ability-score improvements on direct creation

`CharacterRequest.AbilityScores` is **base only** — there's no field to express the
`ImprovementModifier` that level-up produces (`AbilityScoreResponse` splits
`Base`/`ImprovementModifier`, but create only sets `Base`, `:883-884`). For a character
built directly at e.g. L12, the user's ASIs have to be **baked into the base scores**
(our "Manual" ability mode, 1–30). Mechanically identical for all derived stats, but the
sheet then shows e.g. STR base 18 instead of base 14 + 4 improvement, and **feats taken
in lieu of ASI** are still expressible (via `FeatIds`).

**Ask — pick one:**
- (a) **Accept baking** ASIs into base scores for direct creation (we'll document it in
  the builder). No backend change. *Recommended for now.*
- (b) Add an optional `AbilityImprovements` input to `CharacterRequest` if you want the
  base/improvement split preserved on direct creation. Optional fidelity, not required
  to hit the goal.

### 5. [CONFIRM] Count validation on create is existence-only (intended for a DM tool?)

On create, fighting styles / metamagic / spells appear to be validated for **existence
only** (`ResolveDistinctIds`, `:758-767`) — not gated to level-appropriate counts (skills
/ languages / subclass *are* gated via `SelectionValidator`, `:606,:754`). For a DM
toolkit, permissive is good and we'll make the **builder** responsible for offering the
correct counts. Please **confirm** this is intentional so we don't double-enforce — and
that `AllowHomebrewSelections` remains the escape hatch for off-catalog picks.

---

## What the frontend will do once the above lands

- Builder reads item #1's selections → renders Fighting Style / Expertise / Metamagic
  pickers for choices whose `Level ≤` the class's chosen level, with cumulative `choose`
  counts; sends the ids via `FightingStyleIds` / `MetamagicIds` / Expertise-level
  `SkillProficiencies`.
- Builder reads known-caster counts (item #2) → a spell/cantrip step that collects the
  level-appropriate number; sends via `SpellIds`.
- For levels above the entry level, we drive the existing level-up wizard
  (plan→apply) per class, which already works once #2/#3 land.
- ASIs handled per item #4's decision.

**Net:** no new write contract is needed (persistence already works). The backend work
is **#1 (expose selections)** and **#2 (known-caster counts)** as blockers, **#3** for
completeness, **#4** a one-line decision, **#5** a confirmation.

> Build/run reminder for your side: backend is IIS-hosted on `:3501` (DLL locked while
> the pool runs) — `Stop-WebAppPool DMTool` → `dotnet build DMTool.slnx` →
> `Start-WebAppPool DMTool`, or run Kestrel for dev. We'll re-verify against `:3501`.
