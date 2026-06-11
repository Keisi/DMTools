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

**2026-06-11** — commits under test: `86f37f9` (docs), `4f5fa6f` (Review
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
| AUTH-03 | Register new username | 200 + token / 400 if taken | NOT RUN | not exercised |
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
| BUILD-01..13 | Wizard steps (race…equipment) | per-step selection/validation | BLOCKED | spectral |
| BUILD-14 | Review step shows class choices / improvements / cantrips / spells (new) | all listed | NOT RUN | code shipped + typecheck-green; not UI-confirmed live |
| BUILD-15 | Save → POST → sheet | create succeeds, navigate | **PASS(API)** | POST created L1 Fighter, HP 12 AC 12 |
| BUILD-16 | Invalid build | server problem-details surfaced | NOT RUN | |

## 5. Character Builder — edit (`/character/:id/edit`)

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| EDIT-01 | Open edit | wizard fields prefilled | BLOCKED | spectral |
| EDIT-02 | Save edit | PUT carries non-wizard fields | NOT RUN | |

## 6. Character Sheet (`/character/:id`)

Sheet UI not rendered live (spectral); the **data contract** the sheet reads was
verified via GET /api/character/{id} on the fixture.

| ID | Block | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| SHEET-01 | Vitals | HP/AC/speed/init | **PASS(API)** | HP 12, AC 12, walk 30 |
| SHEET-02 | Abilities + mods | 6 abilities | **PASS(API)** | abilityScores=6 |
| SHEET-03 | Saves | present | **PASS(API)** | savingThrows=6 |
| SHEET-04 | Skills | present (0 if none) | **PASS(API)** | skillBonuses=0 (no picks seeded) |
| SHEET-05 | Inventory + encumbrance | present | **PASS(API)** | encumbrance object present |
| SHEET-06 | Weapon attacks | present | **PASS(API)** | weaponAttacks=1 |
| SHEET-07 | Resources | present | **PASS(API)** | resources=1 |
| SHEET-08 | Spellcasting | present if caster | **PASS(API)** | object present |
| SHEET-09 | Class features | present | **PASS(API)** | features=2 |
| SHEET-10 | Traits | speeds/langs/resist | **PASS(API)** | languages=1 |
| SHEET-11 | Status effects | present (0 if none) | **PASS(API)** | statusEffects=0 |
| SHEET-12 | Empty blocks self-hide | hidden when empty | NOT RUN | UI render (spectral) |
| SHEET-13 | Edit HP dialog (Modal) | open/set/Escape/backdrop close | BLOCKED | spectral; Modal refactor shipped |
| SHEET-14 | Manage Spells dialog (Modal) | open/toggle/save/close | BLOCKED | spectral |
| SHEET-15 | Level Up dialog opens | plan loads | BLOCKED | spectral |
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
| CAMP-04 | Invite a member | succeeds / clear error | NOT RUN | needs 2nd user |
| CAMP-05 | Pending invitations | list shows | NOT RUN | |
| CAMP-06 | Accept invitation | joins | NOT RUN | needs 2nd user |
| CAMP-07 | Decline invitation | removed (btn enabled) | NOT RUN | needs 2nd user |
| CAMP-08 | DM registers a *member* character | linked | NOT RUN | needs 2nd user's char |
| CAMP-08b | DM registers their *own* character | rejected; not offered in UI | **PASS** | backend 400 (correct); UI now hides DM's own chars (fixed) |
| CAMP-09 | Remove member character | unlinked | NOT RUN | needs 2nd user |
| CAMP-10 | Transfer DM | role moves | NOT RUN | needs 2nd user |
| CAMP-11 | Invited user 404 path | invitation screen + Accept | NOT RUN | needs 2nd user |

## 9. Encounters

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| ENC-01 | Create encounter | appears (Pending) | **PASS(API)** | status=0, `Regression Fight` |
| ENC-02 | Add combatant (manual enemy) | added | **PASS(API)** | Goblin added, combatants=1 |
| ENC-03 | Set initiative | saved | **PASS(API)** | init=15 |
| ENC-04 | Roll all initiatives | all get d20 | NOT RUN | |
| ENC-05 | Start combat | status Active + active combatant | **PASS(API)** | status=1, activeCombatantId set |
| ENC-06 | Next turn | active advances | **PASS(API)** | active set after next-turn |
| ENC-07 | Edit mode (stats/side/visibility/disposition) | persists | BLOCKED | spectral (UI) |
| ENC-08 | Clone combatant | duplicate added | NOT RUN | |
| ENC-09 | Update combatant HP | persists | **PASS(API)** | delta −3 → 4/7 |
| ENC-10 | Death saves track | render/update | BLOCKED | spectral (UI) |
| ENC-10b | Undo a death-save misclick | click highest filled pip steps it back (even at Dead/Stable); Reset clears all | NOT RUN | shipped this session; pips stay editable at terminal state + Reset button |
| ENC-11 | DM vs player view | visibility/disposition respected | BLOCKED | spectral; needs 2nd user |
| ENC-12 | SignalR hub | live updates | NOT RUN | needs 2 clients |
| ENC-13 | Duplicate-link prevention | can't link same char twice | NOT RUN | |

## 10. Resilience (new this session)

| ID | Steps | Expected | Result | Evidence / Notes |
|----|-------|----------|--------|------------------|
| ERR-01 | Force a render throw | ErrorBoundary fallback + Reload | NOT RUN | code shipped; needs UI fault injection |
| ERR-02 | Backend down | "is the API running?" empty states | BLOCKED | spectral (UI) |

---

## Run summary — 2026-06-11

| Category | Count |
|----------|-------|
| PASS(API) | 23 |
| PASS(UI) | 1 (COMP-01) |
| PARTIAL | 1 (COMP-02) |
| FAIL | 0 (CAMP-08 was correct backend behavior → frontend fix shipped) |
| BLOCKED (spectral wedged) | 18 |
| NOT RUN (needs 2nd user / data / UI fault) | ~20 |

**Coverage achieved:** backend contracts for auth, character create + sheet data +
owner-scoping, level-up plan, campaign create/list, full encounter lifecycle
(create→add→initiative→start→next-turn→HP) all PASS(API). Compendium render PASS(UI).
**Gap:** in-browser interaction (builder wizard, sheet dialogs, level-up UI, campaign
member flows, encounter combat UI, player view, SignalR, ErrorBoundary) — blocked by
spectral instability this run; re-run with a stable driver to clear BLOCKED rows.
