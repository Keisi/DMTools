# DMTool Frontend — E2E Regression Test Catalog

Living regression list for the DMTool SPA. Each row is a test case with steps +
expected result; the **Result** column is filled per run. Re-run this whole list
before releases.

- **Driver:** spectral `batch` (single-process) for UI; direct API calls for
  backend-contract + data-setup verification.
- **Auth for tests:** `dungeonmaster` / `Passw0rd!23`; inject the JWT into
  `localStorage['dmtool.jwt']` (see `src/api/client.ts`). Character access is
  owner-scoped — create test data under the logged-in account.
- **Result legend:** PASS(API) = backend contract verified via API · PASS(UI) =
  verified in-browser · FAIL · BLOCKED = couldn't run (tooling/env) · NOT RUN.

## Run log

**2026-06-11 (2nd-user run)** — same commits as the later run. Created the
**second user `e2eplayer` / `Passw0rd!23`** and cleared the needs-2nd-user rows.

> **CONTRACT FINDING (CAMP-08):** campaign-character registration is
> **owner-scoped** — `POST /campaigns/{id}/characters` returns 400
> `"Character not found or not owned by you"` for ANYONE but the character's
> owner, **including the DM registering a member's character**. Members register
> their own (204); the DM can REMOVE any (204). The morning CAMP-08b fix gave the
> DM a "Member characters" register optgroup (`CampaignDetail.tsx:582`) — that
> path is **dead on submit** (always 400). **Decided (Kevin): backend will allow DM
> registration of active members' characters — request sent:
> `FRONTEND-REQUEST-dm-register-member-character.md`** (root cause: chicken-and-egg
> in `CharacterRepository.GetByIdAsync` DM-branch scoping; also flags the
> `AddedBy`-mapped-as-`ownerId` response bug that must ship with it).

> **Invitee-flow semantics (root cause of a false-FAIL first attempt):** the
> invited user accepts via `POST /join` and declines via
> `DELETE /members/{own userId}`; the PUT `accept`/`reject` member endpoints are
> the **DM's** join-request actions and 404 for invited users (access guard —
> documented in `CampaignDetail.tsx:136-153`, backend INCOMING #15).

> **Env note:** the IIS `DMTool` pool **stopped mid-run** (503; the first
> player-view batch bounced to `/login` with the token cleared). `Start-WebAppPool
> DMTool` recovered it. If a UI batch unexpectedly lands on /login, probe
> `/api/health` before suspecting the app.

**Fixtures created this run (left in DB):**
- User `e2eplayer` / `Passw0rd!23` (member of E2E Camp)
- Character `E2E Player Char` (e2eplayer's) — `7c784fa4-42e6-41be-b847-3b7d8a79404b`
- Campaign `E2E Camp` — `c6f0aff5-e04d-450b-8f53-0d82cf1c4cb1` (DM dungeonmaster)
- Encounter `E2E Fight` (Active, round 1) — `46843e32-f519-46ed-bfda-b60914c01cc6`
  with hidden Goblin (`isHidden+hpHidden`) + E2E Player Char combatant at 9/12

**2026-06-11 (later run)** — commits under test: `fab5d68` (builder spell fix +
data-driven ASIs), `6b1511d` (maxPreparedSpells prep), `a35663b`/`e820723` (docs).
Stack: dev `:5173` → IIS `:3501`.

> **Tooling note — spectral batch WORKED this run** (contradicting the morning
> wedge): three batches (12, 41, and 6 actions) drove the full builder wizard —
> eval-`.click()` on cards/chips/step-nav, React native-setter `input` dispatch
> for level/name fields — with zero hangs. One "Failed to launch Chrome daemon"
> between batches was cleared by `spectral browser close --force` (12 orphans)
> + retry. Pattern: force-close orphans BEFORE every batch.

**Fixtures created this run (left in DB under `dungeonmaster`):**
- Character `E2E Paladin Ten` — Dragonborn Paladin 10, manual 10s,
  Intimidation+Religion, FS Dueling, 4 pre-picked L1 spells —
  `5546ba84-2fb8-4a94-86fa-5de369a6afca`

**Run focus:** the items untestable before — builder wizard interaction E2E
(esp. the prepared-caster spells regression fixed in `fab5d68`), create→sheet,
Manage Spells dialog render.

**2026-06-11 (morning run)** — commits under test: `86f37f9` (docs), `4f5fa6f` (Review
enrichment), `90220f2` (ErrorBoundary + Modal). Stack: dev `:5173` → IIS `:3501`.

> **Tooling note — spectral is unreliable in this environment.** It rendered the
> Compendium and ran one 7-action navigate+click+eval batch successfully, then the
> daemon wedged: every subsequent `batch` hung to timeout, and the documented
> recovery (`browser close --force`, killing `--headless` PIDs) did not restore it.
> So most **UI-interaction** rows below are BLOCKED this run. Backend behaviour was
> verified via direct API calls (PASS(API)). For the interactive UI flows, the
> Node CDP driver (per `CLAUDE.md` / handover — used precisely because spectral
> can't drive reliably here) or a fresh spectral session is the path.

**Fixtures created this run (left in DB under `dungeonmaster`, reusable):**
- Character `Regression Dummy` — L1 Fighter, `335764b5-4ad3-406e-af3e-fc14856bf0e6`
- Campaign `Regression Camp` — `79ae58ca-cd9f-4ba2-b42b-dd0d5e4be330`
- Encounter `Regression Fight` (Active) — `dff1a749-8874-4422-ae51-acbaac6befc5`

**Findings:**
- **CAMP-08 — RESOLVED (frontend).** Registering the DM's *own* character returns
  HTTP 400 (empty body). This is **correct backend behavior** — a DM must not add
  their own characters; they register *member* characters, members register their
  own. The bug was the frontend offering the DM their own characters in the
  register dropdown (→ silent empty-400 on submit). Fixed in `CampaignDetail.tsx`:
  the "My characters" group and the form now hide for the DM (DM sees only the
  "Member characters" group). Build + lint green.

---

## 1. Auth & route guarding

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| AUTH-01 | POST /api/auth/login valid creds | 200 + JWT | **PASS(API)** | token len 360 |
| AUTH-02 | Login wrong password | rejected, no token | **PASS(API)** | HTTP 401 |
| AUTH-03 | Register new username | 200 + token / 400 if taken | **PASS(API)** | `e2eplayer` registered, 200 + token (len 355) |
| AUTH-04 | No token → `/vault` | redirect to `/login` | BLOCKED | spectral hung; RequireAuth in `components/RequireAuth.tsx` |
| AUTH-05 | Click "Sign out" | token cleared, → `/login` | BLOCKED | spectral |
| AUTH-06 | Invalid token → guarded route | 401 → `/login` | BLOCKED | spectral |

## 2. Vault (character list)

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| VAULT-01 | Open `/vault` | owned chars render | BLOCKED | spectral; API list returns the fixture char |
| VAULT-02 | "New character" | → `/character/new` | BLOCKED | spectral |
| VAULT-03 | Click a card | → `/character/:id` | BLOCKED | spectral |
| VAULT-04 | No characters | empty state | NOT RUN | account now has fixtures |

## 3. Compendium (public route)

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| COMP-01 | Spells tab | grouped by level, detail expands | **PASS(UI)** | screenshot: grouped spell list rendered (`/compendium`) |
| COMP-02 | Items tab | equipment/magic groups; category+rarity tags | PARTIAL | tab-switch click succeeded in batch; content not re-asserted (spectral wedged after) |
| COMP-03 | Races tab | traits + subraces | BLOCKED | spectral |
| COMP-04 | Classes tab | features-by-level | BLOCKED | spectral |
| COMP-05 | Search filter | filters by name prefix | BLOCKED | spectral |
| COMP-06 | Group header click | collapse/expand | BLOCKED | spectral |

## 4. Character Builder — create (`/character/new`)

UI wizard not driven (spectral). The **create contract** (POST /api/character with
name + raceId + classes + abilityScores) is PASS(API) — the fixture char was built
this way.

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| BUILD-01..13 | Wizard steps (race…equipment) | per-step selection/validation | **PARTIAL PASS(UI)** | later run: race pick, class add + level=10, Manual ability mode, 2 skill picks, fighting-style choice, 4 spell picks, free step-nav — all driven in-browser. Optional steps (details/background/feats/equipment) traversed but not exercised |
| BUILD-14 | Review step shows class choices / improvements / cantrips / spells (new) | all listed | NOT RUN | Review reached + Create enabled from it (later run); content not asserted |
| BUILD-15 | Save → POST → sheet | create succeeds, navigate | **PASS(API+UI)** | later run: Create click → POST 200 → navigated to `/character/5546ba84-…` |
| BUILD-16 | Invalid build | server problem-details surfaced | NOT RUN | |
| BUILD-17 | Prepared caster (Paladin 10): Spells step chips selectable, optional gate (regression for `fab5d68`) | chips toggle, count increments, Next/Create not blocked at any count | **PASS(UI)** | 3 clicks → "Spells — optional (3 selected)", 3 chips on; Review Create `disabled:false` with 4 picks (pre-fix: clicks refused, gate demanded 0) |
| BUILD-18 | Earned-ASI count derives from class features (Fighter 12) | panel offers 4 ASIs / 8 points (incl. Fighter 6/14) | **PASS(UI)** | screenshot: "earned 4 Ability Score Improvements … up to 8 points"; name-schedule removed in `fab5d68` |

## 5. Character Builder — edit (`/character/:id/edit`)

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| EDIT-01 | Open edit | wizard fields prefilled | BLOCKED | spectral |
| EDIT-02 | Save edit | PUT carries non-wizard fields | NOT RUN | |

## 6. Character Sheet (`/character/:id`)

Morning run: data contract via GET /api/character/{id} (L1 Fighter fixture).
Later run: sheet **rendered live in-browser** for the Paladin 10 fixture.

| ID | Block | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| SHEET-01 | Vitals | HP/AC/speed/init | **PASS(API+UI)** | UI: vitals header rendered (HP 64, 30ft speed, hit-dice + init chips present) |
| SHEET-02 | Abilities + mods | 6 abilities | **PASS(API+UI)** | UI: 6 ability cards with mods |
| SHEET-03 | Saves | present | **PASS(API+UI)** | UI: Cha/Wis proficient (+4) per starting class |
| SHEET-04 | Skills | present (0 if none) | **PASS(API+UI)** | UI: Intimidation +4, Religion +4 (the two builder picks) |
| SHEET-05 | Inventory + encumbrance | present | **PASS(API+UI)** | UI: empty pack + "Unencumbered" with 0/derived-capacity lb |
| SHEET-06 | Weapon attacks | present | **PASS(API+UI)** | UI: Unarmed Strike +5 row |
| SHEET-07 | Resources | present | **PASS(API+UI)** | UI: Lay on Hands 50/long rest, Channel Divinity 1/short rest |
| SHEET-08 | Spellcasting | present if caster | **PASS(API+UI)** | UI: Paladin · Charisma · DC 12 · atk +4; L1 4 slots with the 4 created spells (Bless/Command/Cure Wounds/Detect Evil and Good); L2/L3 "No spells prepared." |
| SHEET-09 | Class features | present | **PASS(API+UI)** | UI: Features list incl. Extra Attack, Aura of Protection, ASI rows |
| SHEET-10 | Traits | speeds/langs/resist | **PASS(API+UI)** | UI: Traits block (size, languages Common/Draconic) |
| SHEET-11 | Status effects | present (0 if none) | **PASS(API)** | none on fixture; block self-hid (see SHEET-12) |
| SHEET-12 | Empty blocks self-hide | hidden when empty | **PASS(UI)** | no Status block on the Paladin sheet (0 effects) |
| SHEET-13 | Edit HP dialog (Modal) | open/set/Escape/backdrop close | BLOCKED | not driven either run |
| SHEET-14 | Manage Spells dialog (Modal) | open/toggle/save/close | **PARTIAL PASS(UI)** | re-verified after backend 28ed633: header now "Spells (4 selected · **5 prepared**)" — the backend-derived `maxPreparedSpells` (half-caster-correct; the old mod+level stopgap showed 10 and is deleted). Save-side enforcement verified via API: 6 picks vs cap 5 → 400; off-class spell → 400. Dialog toggle/save click not driven |
| SHEET-15 | Level Up dialog opens | plan loads | BLOCKED | not driven either run |
| SHEET-IDOR | GET another account's char id | 404 (owner-scoped) | **PASS(API)** | non-owned id → 404 |

## 7. Level Up (`LevelUpDialog`)

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| LVL-01 | POST levelup/plan | plan returns HP/subclass/ASI | **PASS(API)** | L1→L2 Fighter: HP avg 6/d10, +1 feature |
| LVL-02 | HP average vs roll | toggle | BLOCKED | spectral (UI) |
| LVL-03 | Subclass level | subclass choice | NOT RUN | fixture not at subclass level |
| LVL-04 | Caster spell pool | picks | NOT RUN | |
| LVL-05 | ASI distribute 2 pts | sums to 2 | NOT RUN | fixture not at ASI level |
| LVL-06 | ASI "Take a feat" | feat picker lists `/api/feats`, enables Apply | NOT RUN | code shipped + typecheck-green; UI not driven |
| LVL-07 | Apply | sheet re-renders | NOT RUN | |
| LVL-08 | Multiclass-in | addable classes + prereq/DM-override | BLOCKED | spectral |
| LVL-09 | Escape/backdrop close | closes | BLOCKED | spectral |

## 8. Campaigns

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| CAMP-01 | GET /api/campaigns | list renders | **PASS(API)** | 0 → 1 after create |
| CAMP-02 | Create campaign | appears | **PASS(API)** | created `Regression Camp` |
| CAMP-03 | Campaign detail | members/chars/sessions/encounters | BLOCKED | spectral (UI); API sections reachable |
| CAMP-04 | Invite a member | succeeds / clear error | **PASS(API)** | invite `e2eplayer` → 204 |
| CAMP-05 | Pending invitations | list shows | **PASS(API)** | player `GET /invitations` lists E2E Camp |
| CAMP-06 | Accept invitation | joins | **PASS(API)** | invitee `POST /join` → 204; member role=2 status=3 (Active) |
| CAMP-07 | Decline invitation | removed (btn enabled) | **PASS(API)** | invitee `DELETE /members/{own}` → 204; invitation gone |
| CAMP-08 | DM registers a *member* character | linked; `ownerId` = the member | **PASS(API)** | FIXED backend `cbcec90` (DM-first branch: accept-set == member-character dropdown set) — re-tested: DM register → 204, `ownerId`/`ownerUsername` = the MEMBER (the AddedBy-as-ownerId bug fixed too). CAMP-08b (DM own char → 400) + ENC-13 (duplicate → 400) re-verified, no regression. See `BACKEND-RESPONSE-dm-register-member-character.md` |
| CAMP-08b | DM registers their *own* character | rejected; not offered in UI | **PASS** | backend 400 (correct); UI hides DM's own chars |
| CAMP-08c | Member registers their OWN character | linked | **PASS(API)** | player POST own char → 204; listed with ownerId |
| CAMP-09 | Remove member character | unlinked | **PASS(API)** | DM `DELETE /characters/{id}` → 204; list empty |
| CAMP-10 | Transfer DM | role moves | **PASS(API)** | throwaway camp: transfer → 200, `dmUserId` = e2eplayer; new DM deleted camp (204) |
| CAMP-11 | Invited user 404 path | invitation screen + Accept | **PASS(UI)** | invited player on campaign URL → Accept + Decline buttons rendered |

## 9. Encounters

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| ENC-01 | Create encounter | appears (Pending) | **PASS(API)** | status=0, `Regression Fight` |
| ENC-02 | Add combatant (manual enemy) | added | **PASS(API)** | Goblin added, combatants=1 |
| ENC-03 | Set initiative | saved | **PASS(API)** | init=15 |
| ENC-04 | Roll all initiatives | all get d20 + init bonus | **PASS(API)** | NEW server-side `POST .../roll-initiatives` (backend 92eadf8) → 200, both combatants rolled (linked PC gets its initiative bonus). Client d20 loop retired in `EncounterView` |
| ENC-05 | Start combat | status Active + active combatant | **PASS(API)** | status=1, activeCombatantId set |
| ENC-06 | Next turn | active advances | **PASS(API)** | active set after next-turn |
| ENC-07 | Edit mode (stats/side/visibility/disposition) | persists | BLOCKED | spectral (UI) |
| ENC-08 | Clone combatant | duplicate added | NOT RUN | |
| ENC-09 | Update combatant HP | persists | **PASS(API)** | delta −3 → 4/7 |
| ENC-10 | Death saves track | render/update | BLOCKED | spectral (UI) |
| ENC-10b | Undo a death-save misclick | click highest filled pip steps it back (even at Dead/Stable); Reset clears all | NOT RUN | shipped this session; pips stay editable at terminal state + Reset button |
| ENC-11 | DM vs player view | visibility/disposition respected | **PASS(UI)** (partial) | player view: hidden Goblin absent from list + Turn Order; player char visible with own panel. Flags round-trip PASS(API). hp/ac per-field "?" masking not separately driven. NOTE: filtering is client-side — hidden data IS in the member's API payload (network-tab leak; candidate backend redaction request) |
| ENC-12 | SignalR hub | live updates | **PASS(UI)** | player view LIVE badge; DM PUT hp delta −3 from outside → player DOM updated 12/12 → 9/12 with no reload |
| ENC-13 | Duplicate-link prevention | can't link same char twice | **PASS(API)** | duplicate register → 400 |

## 10. Resilience (new this session)

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| ERR-01 | Force a render throw | ErrorBoundary fallback + Reload | NOT RUN | code shipped; needs UI fault injection |
| ERR-02 | Backend down | "is the API running?" empty states | BLOCKED | spectral (UI) |

---

## Run summary — 2026-06-11 (after the later run)

| Category | Count |
|----------|-------|
| PASS(API+UI) | 11 (BUILD-15, SHEET-01..10) |
| PASS(API) only | 22 (AUTH-01/02/03, SHEET-11, SHEET-IDOR, LVL-01, CAMP-01/02/04/05/06/07/08c/09/10, ENC-01/02/03/05/06/09/13) |
| PASS(UI) | 7 (COMP-01, BUILD-17, BUILD-18, SHEET-12, CAMP-11, ENC-11, ENC-12) |
| PASS (mixed) | 1 (CAMP-08b) |
| PARTIAL | 3 (COMP-02, BUILD-01..13, SHEET-14) |
| **FAIL** | **0 (CAMP-08 fixed backend `cbcec90`, re-tested → PASS)** |
| BLOCKED (not yet driven) | ~18 (auth redirects, vault, compendium interaction, EDIT-01, sheet dialogs SHEET-13/15, level-up UI, CAMP-03, ENC-07/10, ERR-02) |
| NOT RUN | ~12 (LVL-02..09 UI, ENC-04 (deferred to backend roll endpoint), ENC-08/10b, ERR-01, VAULT-04, BUILD-14/16, EDIT-02) |

**Later-run coverage:** the full builder wizard driven in-browser end-to-end
(Paladin 10: race→class+level→manual abilities→skills→fighting style→4 optional
spells→Review→Create→sheet). The `fab5d68` regression rows are the headline:
BUILD-17 (prepared-caster spell picks selectable + non-blocking) and BUILD-18
(ASI count from class features, Fighter 12 → 4) both PASS(UI). Sheet blocks
rendered live; Manage Spells opens with correct pre-selection.
**Remaining gap:** dialog interactions (HP edit, Manage Spells toggle/save,
level-up UI), auth redirects, vault/compendium interaction, campaign member
flows + encounter combat UI + player view + SignalR (need a 2nd user/client),
ErrorBoundary fault injection.
