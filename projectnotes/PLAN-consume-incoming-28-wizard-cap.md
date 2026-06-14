# Sonnet-agent spec — consume INCOMING #28 (Wizard spellbook cap reconciled)

**Repo:** `C:\Users\keisi\source\repos\Personal\DMTools-Frontend` (frontend only — do NOT touch the backend repo).
**Source:** `INCOMING-FROM-BACKEND.md` #28. Closes `FRONTEND-REQUEST-wizard-spellbook-prepared-cap.md`.
**Nature:** one additive optional type field + e2e-harness cleanup (drop the now-obsolete homebrew workaround).
**Gates:** `npm run build` (tsc -b must stay green) **and** `npm run lint` are authoritative. Do NOT commit or
push — Kevin pushes (push = prod deploy). Author re-verifies after.

> **#27 (Bardic Inspiration recharge):** value-only, no DTO shape change → **no frontend action**. Don't touch
> anything for it. This spec is #28 only.

---

## Task 1 — `src/api/types.ts` (the only build-path change)
Interface `SpellcastingResponse` (currently L798-812) has `maxPreparedSpells?` but no spellbook field. Add, right
after `maxPreparedSpells?` (L809) and before `spellSlots`:

```ts
  // Spellbook casters only (Wizard; null for everyone else): the backend-derived cap on STORED
  // levelled spells = spellbookSize(classLevel) (6/14/…/44). Distinct from maxPreparedSpells (daily
  // prep). Since INCOMING #28 the storage cap on create / PUT spells / level-up uses THIS for Wizard,
  // not maxPreparedSpells. Render-only; never recompute. (Not the same as the class-reference
  // ClassSpellcastingProgressionResponse.spellbookSize already on this file ~L361.)
  spellbookSize?: number | null;
```
That's the whole app-code change. No UI/component change is in scope (rendering "spellbook 14 / prepared 7" on
the sheet is a separate enhancement — do NOT add it unless told).

---

## Task 2 — e2e harness (out-of-build; plain Node ESM under `tests/api-e2e/`, not in tsc/vite)
The backend now accepts a correct Wizard spellbook with no `allowHomebrewSelections`, so remove the workaround and
turn the over-cap negative into a real boundary test.

### 2a. `tests/api-e2e/lib/levelup.mjs`
- Delete the `postWithCapRetry` helper (L56-70) and its `ctx.spellCapClasses` bookkeeping.
- Replace its two call sites with a direct post (same return shape):
  - L130: `const created = await client.post("/api/character", baselineCreateBody(cls, ctx));`
  - L148: `const ar = await client.post(\`/api/character/${id}/levelup/apply\`, applyBody);`
- Leave L48 (`p1.spellsKnown ?? p1.spellbookSize ?? 0`) as-is — that's the correct levelled count for creation.

### 2b. `tests/api-e2e/suites/suite-a-levelup.mjs`
- Delete the collision FINDING block L131-138 (`if (ctx.spellCapClasses?.size) { t.finding(...) }`) and its
  comment L131-132. With the fix, the Wizard 1→20 walk passes clean — no homebrew, no finding.

### 2c. `tests/api-e2e/suites/suite-b-creation.mjs` — `spellGateNegatives` (L169-203)
The current over-cap test (L177-181) submits 12 levelled spells at L5, which is now **under** the cap (14) and
would no longer be rejected. Rework it **data-driven** (do not hardcode 14 — read it from the class):
- Derive the L5 spellbook size from the Wizard class progression, e.g.
  `const wizBook5 = wizard.spellcasting?.progression?.find(p => p.classLevel === 5)?.spellbookSize;`
  (Confirm the exact field path by reading how `ctx.classByName` / class data is shaped in the harness setup.)
- Gather enough **castable** wizard spells (levels 1..maxSpellLevel at L5 = 3, on the Wizard list) to exceed the
  cap — there are well over 15.
- **Positive (new):** create a Wizard L5 with exactly `wizBook5` levelled spells (+ its cantrips), no homebrew →
  expect **201 accepted**. Track it for teardown (`ctx.track(...)`).
- **Negative (reworked):** create a Wizard L5 with `wizBook5 + 1` levelled spells, no homebrew → expect **400/422**.
- Leave the off-list (L183-187), too-high-level (L189-193), and minimum-enforcement (L195-202) cases unchanged —
  #28 doesn't affect those.

### 2d. `tests/api-e2e/README.md`
- Remove finding **#1** (L72-75, "Wizard spellbook vs prepared-spell cap"). Update the count on L72 ("surfaces
  four" → "three") and renumber the remaining findings 2→1, 3→2, 4→3.

---

## Verify (in order)
1. `npm run build` → tsc -b green (0 errors). The `types.ts` field is purely additive/optional.
2. `npm run lint` → clean (no new issues; e.g. no now-unused vars left from the shim removal).
3. Harness against a **local** backend that has the fix (`:3501` IIS or Kestrel `:5157` — NOT prod Azure, which
   isn't deployed yet): `node tests/api-e2e/run.mjs`. Confirm:
   - Suite A Wizard 1→20 passes with **no** homebrew retry and **no** spellbook-cap FINDING.
   - Suite B: Wizard L5 with `spellbookSize` spells **accepted**, `spellbookSize+1` **rejected**.
   - No regression for Cleric/Druid/Paladin (prepared) or Bard/Sorcerer/Ranger/Warlock (known).
   If the backend isn't running / the cap fix isn't live locally, report that rather than forcing a pass.
4. oby: `oby brief` the touched files before editing, `oby verify --files "src/api/types.ts"` after — aim
   `delta: 0`. (oby's build step false-negatives here — npm build/lint above are the real gates.)

## Out of scope / do NOT
- No backend repo edits. No DB/migration anything.
- No sheet/builder UI change for `spellbookSize` (enhancement, not requested).
- No commit, no push, no `INCOMING`/handoff edits.

## Report back
List the diffs per file, the `npm run build` + `npm run lint` results, and the harness summary (Wizard walk +
the two boundary cases). Flag anything that didn't converge (e.g. local backend not carrying the fix).
