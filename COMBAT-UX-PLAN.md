# COMBAT-UX-PLAN — execution spec (written 2026-06-12, for the implementing agent)

**Read first:** the repo `CLAUDE.md` end-to-end (gates, spectral recipe, TS constraints,
contract rules). This plan assumes those rules; it does not repeat them. Line numbers
below were verified 2026-06-12 — they WILL drift; re-locate by symbol name, never edit
blind by line.

**Scope:** 7 issues Kevin raised. Issues 1–3 + 6-enforcement are **backend work**,
already filed as `FRONTEND-REQUEST-{combat-log-grammar, prevturn-log-entry,
hide-turn-order, encounter-requires-session}.md` (backend repo root; reference copies
here). This plan is the **frontend** work: 4 phases you can build now with zero backend
dependency, plus a blocked phase that lands when the backend callbacks arrive.

**Workflow per phase (non-negotiable):**
1. Implement → `npm run build` + `npm run lint` green (authoritative gates; oby's build
   step false-negatives with `os error 193` — ignore that one only).
2. `oby verify --files "<changed>"` → **delta 0**.
3. Live-verify with the spectral batch recipe in CLAUDE.md ("Browser verification" —
   token guard, `document.title` diagnostics channel, seeded test data ids are all
   documented there). Screenshot evidence per phase.
4. Commit per phase (ai-code-commenting format: `type(scope): subject` + Stack/Changes/
   Reason/Modified body, **no co-author line**), via `git commit -F <tempfile>`.
5. **DO NOT PUSH.** Push = GitHub Pages production deploy and is gated on a
   critical-review marker; Kevin pushes on his explicit word only. Leave commits local.
6. Show Kevin screenshots after each phase (he reviews visually, then says push).

**Seeded verification data** (CLAUDE.md has the full ids): `dungeonmaster/Passw0rd!23`
owns campaign "Layout Preview" → Active encounter "Goblin Ambush" (combatants with
buffs/durations/concentration already applied), and vault characters Seraphine
Dawnbringer (Paladin 10, has Bless/Haste/Restrained riders) + Borin Ironfist (retired).
For the PLAYER view you need a second account that owns a registered character in a
campaign — the E2E setup in `E2E-REGRESSION.md` has one (`e2eplayer` etc.); check there
or create a member + character + register + add as combatant via the API.

---

## Phase 0 — shared extractions (enables 1–3; no behavior change)

Three pure refactors. Gates must stay green after each; zero visual diff expected
(verify with a sheet + encounter screenshot against current).

**0a. Tooltip text builders → `src/lib/sheetTips.ts`.**
From `src/routes/CharacterSheet.tsx`, move the pure string-building helpers used in
`data-tooltip` attributes — `abilityBreakdown`, `attackTip`, `casterTip`, the vital-tip
builders (HP/AC breakdown text near the `sheet__vitals` render, ~line 565), and their
shared formatters (`fmtMod` etc.). They are plain `(response) => string` functions —
no JSX. Export them; CharacterSheet imports from the lib. Keep names.

**0b. Roll-rider badge summary → same lib.**
`summarizeRiders` + `ROLL_TARGET_LABEL` currently live module-scope in
`src/routes/EncounterView.tsx` (right after `saveSides`, ~line 53). CharacterSheet has
its own sibling labels (`ROLL_TARGET_LABEL`, `riderLine`, `advantageLine` near
`StatusEffectsBlock`). Move ALL of them into `src/lib/sheetTips.ts` (one
`ROLL_TARGET_LABEL` with both short and long label variants, or two exported maps —
your call, no duplication). Both routes import.

**0c. Drag-reorder primitives → shared.**
From `CharacterSheet.tsx`: `useSheetOrder` (lines ~75–107; localStorage key
`dmtool.sheet.order.${charId}`, fallback to a key-list constant, appends unknown new
keys) and `DraggableBlock` (lines ~109–148, classes `sheet__draggable`,
`sheet__drag-handle`, `sheet__draggable--over`). Extract to
`src/lib/useBlockOrder.ts` (generalize: `useBlockOrder(storageKey, allKeys)`) and
`src/components/DraggableBlock.tsx`. **Keep the existing CSS class names** — all route
CSS is bundled into one global stylesheet (single `index-*.css` in the build), so the
`sheet__draggable*` rules in `CharacterSheet.css` apply everywhere; don't move the CSS.
CharacterSheet keeps its storage key (`dmtool.sheet.order.${charId}`) so users' saved
orders survive.

Commit: `refactor(sheet): extract tooltip builders + drag-reorder primitives to shared libs`

---

## Phase 1 — player combat screen tooltips (issue #4)

File: `src/routes/PlayerEncounterView.tsx`. Two parts:

**1a. Convert the 8 native `title="..."` tooltips to the design system**
(`className="... tip"` + `data-tooltip="..."` — positioner is global, installed in
`main.tsx`; CSS in `theme.css` ~136–205; multi-line via `\n`, rendered `pre-line`):
- ~157 hub status; ~297 tracker rank; ~307 disposition; ~317 initiative stat;
  ~325 HP-hidden; ~346 HP bar; ~368 AC; ~384 status badge.
- The badge tip (~384) should ALSO gain riders via `summarizeRiders` (0b) and the
  concentration source name — mirror what `EncounterView`'s DM badges show (find its
  badge-tip composition in `renderCombatant`). Players deserve the same info.

**1b. Port the sheet's rich tooltips onto the player card's boxes** using the 0a lib:
the CombatCard (component in the same file, ~395–707) renders Vitals (~566),
Abilities (~578), Attacks (~609), Saving Throws (~634), Resources (~650),
Spellcasting (~666) from a full `CharacterResponse` it already has — so
`abilityBreakdown` / `attackTip` / `casterTip` / vital tips apply directly with the
same `tip ability--help` affordance classes the sheet uses. Match the sheet's
tooltip placement element-for-element (compare CharacterSheet lines ~468, ~565, ~604,
~856).

Verify: player-view screenshot; hover can't be screenshotted — instead assert via the
title-channel eval that converted elements have `data-tooltip` and no `title` attr
(e.g. `document.querySelectorAll('[title]').length` drops to 0 for the converted set,
`[data-tooltip]` count rises). Visual: tooltips look right in Kevin's manual pass.

Commit: `ui(player-combat): design-system tooltips + sheet-grade stat breakdowns`

---

## Phase 2 — player reorderable boxes (issue #7)

File: `src/routes/PlayerEncounterView.tsx`, using 0c.

- Wrap exactly the four boxes Kevin named — **Attacks, Saving Throws, Resources,
  Spellcasting** (~609/634/650/666) — in `DraggableBlock`, ordered by
  `useBlockOrder('dmtool.penc.order.' + characterId, [...4 keys])`.
- **Per character id** (the view has a character switcher — each character keeps its
  own order, same as the sheet's per-char key).
- NOT draggable: header/HP, vitals, abilities, Conditions, the Dying panel (safety
  block stays pinned at top).
- Known accepted limitation (same as the sheet): HTML5 drag doesn't work on touch.

Verify: spectral — eval-drag is unreliable; instead seed the localStorage order key in
the batch eval with a non-default order, reload, and screenshot proving the boxes render
in the stored order; also confirm default (no key) renders the natural order.

Commit: `feat(player-combat): drag-reorder for attacks/saves/resources/spellcasting`

---

## Phase 3 — DM read-only sheet popup in combat (issue #5; biggest item)

**3a. Extract the sheet body.** `CharacterSheet.tsx` is route-coupled (fetches by
`useParams` id, ~169–196, and owns LevelUpDialog/ManageSpellsDialog/EditHpDialog/copy
form). Split into:
- `CharacterSheetView({ character, readOnly })` — the presentational body: header
  vitals, abilities, and the draggable block grid (~482–493 render loop + every
  `*Block` component). When `readOnly`: render NO action buttons (Level Up, Edit,
  Multiclass, Manage Spells, Edit HP, Copy to User), no drag handles (pass a
  no-reorder mode through, or simply don't wrap in DraggableBlock), no dialogs.
- The route component keeps: fetch, loading skeleton, error state, all dialogs +
  mutation handlers, and renders `<CharacterSheetView character={c} readOnly={false}>`
  plus its action bar. **This is a mechanical move — resist improving anything else.**
  The route page must look pixel-identical after (screenshot-compare Seraphine's sheet
  before/after).

**3b. The popup.** In `src/routes/EncounterView.tsx` `renderCombatant`: for combatants
with `characterId != null`, add a DM-only identity-row icon button (next to the ✕,
ghost style, e.g. "👁" is taken by hide — use "📜" or text "Sheet", `tip` tooltip
"View character sheet") that opens the existing `Modal` component
(`components/Modal.tsx`, used by the initiative-warning) with a wide class
(`enc__sheet-modal`, `width: min(960px, 95vw)`, internal scroll `max-height: 85vh`),
fetches `characters.get(combatant.characterId)` on open (loading skeleton, and a
graceful "You no longer have access to this character" body on `ApiError` 404 — the
DM's read access rides the campaign-containment rule, which can lapse if the character
was unregistered), and renders `<CharacterSheetView character readOnly />`.

Verify: DM view → click Sheet on the linked combatant → modal shows the full read-only
sheet (screenshot); confirm no action buttons inside; 404 path by requesting a bogus id
via eval if convenient (optional).

Commit: `feat(encounter): DM read-only character-sheet popup (extracted CharacterSheetView)`

---

## Phase 4 — encounters require a session, frontend side (issue #6)

File: `src/routes/CampaignDetail.tsx` (+ its CSS). Backend enforcement + orphan
backfill are filed (`FRONTEND-REQUEST-encounter-requires-session.md`) but this ships
first and stands alone:

- Create form (~728–749): make the session `<select>` **required**; remove the
  `"— no session —"` option; submit blocked (`disabled` + hint) while
  `sessions.length === 0` — hint text points the DM at the Sessions panel above
  ("Create a session first — encounters live inside sessions").
- `handleCreateEncounter` (~285–298): send `sessionId: encSession` (no `|| null`).
- Encounter list (~699–727): group entries under session-name headings
  (`EncounterSummaryResponse.sessionId` is already on the summary; map session id →
  name from the `sessions` state). Orphans (pre-backfill rows with null sessionId)
  group under a final "No session" heading — that heading disappears naturally once
  the backend backfill lands.

Verify: campaign screen screenshot — grouped list, required select, zero-session hint
(use a fresh campaign for the zero-session state).

Commit: `feat(campaign): require a session for new encounters; group encounter list by session`

---

## Phase 5 — BLOCKED on backend callbacks (do not start; check INCOMING-FROM-BACKEND.md)

- **Log grammar (#1):** zero frontend work — text is server-rendered.
- **Prev-turn log entry (#2):** when the backend ships `CombatEventType.TurnRewound`,
  mirror the numeric value in `types.ts` and add a glyph + kind in
  `src/routes/EncounterLogPanel.tsx` (`eventGlyph` ~14, `eventKind` ~46 — suggest "↩").
  Unknown types already fall back safely, so order doesn't matter.
- **Hide turn order (#3):** when `EncounterResponse.turnOrderHiddenFromPlayers` + its
  mutation ship: mirror the field; DM toggle button in the `EncounterView` header
  (`enc__head-right`, next to Edit — follow the Edit button's toggle styling);
  player side: in `PlayerEncounterView`, when the flag is true, don't render the
  Turn Order `<aside className="penc__tracker panel">` (~242–259). **Deliberate,
  agreed behavior:** the now-acting banner STAYS (players must know when it's their
  turn); only the order list hides.

---

## Review notes (decisions already made — don't re-litigate)

- **#5 extraction over duplication:** a parallel "mini sheet" component was considered
  and rejected — one renderer (`CharacterSheetView`) serves route + modal; the route
  stays a thin fetch/actions wrapper. Pixel-identical route render is the regression
  bar.
- **Drag CSS stays put:** Vite bundles all route CSS into one global file, so shared
  components may keep using `sheet__draggable*` classes from `CharacterSheet.css`.
- **Reorder scope is exactly the 4 boxes Kevin named** — Conditions and the Dying panel
  stay fixed.
- **Turn-banner stays when turn order is hidden** (#3) — flagged to the backend in the
  request; revisit only if Kevin overrules.
- **Session grouping is in scope for #4's frontend phase** — "encounters under
  sessions" is a hierarchy statement, the list should read that way.
- **Player badges get rider tooltips in Phase 1** — same data the DM sees; buffs are
  table-public knowledge.
- Touch devices can't drag (HTML5 DnD) — pre-existing sheet limitation, accepted.
