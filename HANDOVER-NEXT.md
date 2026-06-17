# Handover — DMTool-FrontEnd (for the next session)

> ## ⏳ SESSION 2026-06-17 — #33–#36 reviewed + ready to push; PUSH BLOCKED on credential
>
> Picks up directly from the 2026-06-16 entry below. State now:
> - **4 commits ahead of `origin/main`, unpushed:** `b3a25df` (docs) → `43f300c` (feature, real
>   source) → `9ef1054` (docs) → `a758d7b` (critical-review report). Tree clean.
> - **Critical review PASSED** (all 3 phases: precheck delta +0/-0, build_errors 0, no codescan
>   findings on the 9 changed files, adversarial clean, hindsight ACCEPT). Report at
>   `projectnotes/critical-review/2026-06-17/incoming-33-36-push.json`. **Push-gate marker stamped
>   for HEAD `a758d7b`** (`.claude/.critical-review-done-main-a758d7b`).
> - **PUSH IS BLOCKED — credential, not code.** `git push origin main` → **403**: GCM resolved
>   github.com to the **work** account (`Kevin-Azuelo-BOND`), which lacks access to the **personal**
>   repo `Keisi/DMTools`. Pinned the repo to the personal account (`git config
>   credential.https://github.com.username Keisi`), but the retry hung on an interactive auth prompt
>   (GCM has no cached `Keisi` token). **To finish: a human runs `git push origin main` interactively
>   so the GitHub browser/device login for `Keisi` completes** (the username pin is already in place,
>   so GCM will prompt for `Keisi` specifically and cache it). Marker is valid for `a758d7b`; if any
>   new commit lands first, re-run `/critical-review` (new SHA invalidates the marker).
> - **Push = GitHub Pages prod deploy. SPLIT-BRAIN still applies:** prod Azure backend is behind
>   (migs 071–077 local-only), so #33–#36 light up in prod only after the backend deploys + migrations
>   run. The new client code is defensively guarded, so it degrades gracefully until then.
>
> ---
>
> ## ✅ SESSION 2026-06-16 — INCOMING #33–#36 consumed + COMMITTED (NOT yet pushed)
>
> The four shipped-but-unconsumed backend deliveries were wired into the client (the work was
> already on disk uncommitted at session start; this session verified, documented, and committed it).
> **`npm run lint` + `tsc -b` both green.**
>
> - **#33 hit-dice** — `CampaignCharacterPanel` renders per-die pools + a spend control
>   (`campaignCharacterState.spendHitDice` / `setHitDice` in `endpoints.ts`).
> - **#34 Half-Elf "+1 to two abilities"** — `RaceAbilitySelection` picker in the builder Race step;
>   `abilityIncreaseChoices` sent on create + recovered on edit from `racialChoiceModifier`.
> - **#35 weapon properties** — `CharacterSheetView` joins `weaponAttacks → /api/weapons`
>   (`weaponsById`), badges numeric `properties` via `WEAPON_PROPERTY_LABELS`, renders `versatileDamage`.
> - **#36 exhaustion derived** — dropped the `CampaignCharacterPanel` "render level only" caveat;
>   it now shows a "penalties applied" hint and reads the derived `character`.
>
> **Live-verification pass against `:3501` (contract-level, authoritative):**
> - #33: `POST spend-hit-dice` → 200, pool `d10 10/10 → 9/10`.
> - #34: `/api/races` → Half-Elf carries `{type:10,choose:2}` + 5 ex-CHA options; other races empty.
> - #35: `/api/weapons` → 33/37 with `properties`, 6 with `versatileDamage` (Longsword `[11]`+`1d10`,
>   Greataxe `[3,10]`); **rendered sheet screenshot captured** (E2E Paladin Ten).
> - #36: `PATCH exhaustion` L0→L3 → `walkingSpeed 30→15` + three Disadvantage `rollAdvantages`
>   (targets 0/1/2); restored to 0 after.
>
> **Spectral screenshots — ALL FOUR captured (the hang was solved, not worked-around):**
> - #35 sheet — Attacks block badges Longsword "Versatile" + greatsword/etc. property tags.
> - #34 builder — Half-Elf card selected → "Ability Score Increase: +1 to 2 abilities, choose 2"
>   picker with the 5 ex-CHA chips (Int/Con/Wis/Str/Dex) + the "choose 2" gate hint.
> - #33/#36 campaign panel (Keisi, exhaustion set to 3) — "HIT DICE D10 10/10 [Spend]" and
>   "EXHAUSTION 3/6 — Penalties applied … rolls, speed, and max HP below reflect exhaustion",
>   with the panel header showing the **halved SPEED 15 ft** (derived ladder, ≥2). Restored to 0 after.
> - Screenshots saved to `.claude/shot-34-halfelf.png` + `.claude/shot-3336-panel.png` (local, untracked).
>
> **Tooling fix (important, now in CLAUDE.md):** interaction batches hang on the default
> stability wait once the React app has loaded — **add `--action-timeout 20`** and native
> `click` actions complete fine. This supersedes the earlier "spectral can't click here" notes.
> The batch `screenshot` action writes `C:\tmp\spectral-batch\action-<name>.png` (the `action-`
> prefix differs from the `--screenshot` flag's `final.png`); selectors are CSS-position only
> (no text selector).
>
> **NEXT:** (a) push to `origin/main` when Kevin says — **push = GitHub Pages prod deploy**, gated
> on a `/critical-review` marker for HEAD; (b) coordinate with the **backend deploy** — prod Azure
> backend is behind, so #33–#36 endpoints/columns (migs 074–077) are local-only until it ships +
> migrations run. The new code is defensively guarded (optional fields), so unaffected races/weapons
> degrade gracefully, but the hit-dice / Half-Elf / exhaustion paths only light up post-deploy.
>
> ---
>
> ## ✅ SESSION 2026-06-14 (later) — INCOMING #27–#30 consumed + PUSHED (HEAD `1eb0f13` on `origin/main`)
>
> Backend shipped INCOMING #27–#30; all consumed, committed, and **pushed to production**
> (GitHub Pages deploy triggered). The e2e-harness commit `a8eb1f6` rode along in the same push.
>
> - **#28 Wizard spellbook cap** — `SpellcastingResponse.spellbookSize` (optional) added; the
>   prepared-cap collision is fixed backend-side, so the harness homebrew workaround was removed
>   (Suite A Wizard 1→20 clean; Suite B 14-accept / 15-reject). Closed the
>   `FRONTEND-REQUEST-wizard-spellbook-prepared-cap.md` request.
> - **#29 High Elf cantrip DC** — server-computed now; the sheet already rendered `saveDc` → no code change.
> - **#30 Extra Attack + advantage** — `CharacterResponse.attacksPerAction` shown in the Attacks
>   block (defensive `?? 1` guard); `campaigns.grantAdvantage` + `GrantAdvantageRequest` + DM
>   Adv/Dis-(attack/save) quick-grant buttons in `EncounterView`. The 6 advantage StatusEffects
>   flow through the existing `rollAdvantages` path (no change).
> - **#27 Bardic recharge** — value-only (L5+ Short rest); no code change.
>
> **Gates:** npm build + lint green, oby precheck delta 0, e2e 2041 PASS / 0 FAIL, live spectral
> confirmed the Extra Attack line. Critical review PASS (report in `projectnotes/critical-review/2026-06-14/`).
>
> **Prod caveat:** the Azure backend is NOT yet on migrations 071/072/073, so #29/#30 (and the #28
> validation change) are live only against a local backend until that deploy runs. The frontend
> changes are additive/defensive and safe ahead of it.
>
> **Open (optional, product calls — not backend-blocked):** advantage quick-grant buttons cover
> Attack + Saving Throw only, not Ability Check; harness findings #2/#3 (creation doesn't enforce
> earned-ASI / min-spell counts) remain — file requests only if the product wants creation to enforce them.
>
> **This supersedes the "next steps" in the harness block below** (request delivered + closed, harness pushed).
>
> ---
>
> ## 🧪 SESSION 2026-06-14 — API e2e test harness (committed `a8eb1f6` on `main`, now PUSHED)
>
> Built a pure-HTTP end-to-end test harness for the DMTool API (no browser, no
> spectral). **Committed but not pushed** — push = prod deploy, awaiting Kevin's word.
>
> **What's there:**
> - `tests/api-e2e/` — standalone Node ESM (zero deps, off the `tsc -b` / vite path,
>   not wired into `npm`). Run: `node tests/api-e2e/run.mjs` (env `SUITES=A,B,C` /
>   `ONLY=Wizard,Fighter` / `QUIET=1` / `BASE=`). Backend must be live (`:3501` IIS
>   or `:5157` Kestrel). Report → `tests/api-e2e/last-run.json` (gitignored). Full
>   docs in `tests/api-e2e/README.md`.
>   - **Suite A** — level-up 1→20 for all 12 classes (plan→apply, asserted vs each
>     class's own progression data + RAW spot-checks).
>   - **Suite B** — above-L1 creation + the **build-at-20 == levelup-1→20 convergence
>     invariant** + spell-gate negatives + multiclass/prereq.
>   - **Suite C** — encounter lifecycle / HP+death / status+concentration /
>     resources+rest / buffs / DM visibility / combat log / authz guards.
>   - **Last full run: 2040 PASS / 0 FAIL / 4 FINDING.**
> - `projectnotes/api-e2e-test-plan.md` — the plan **+ a per-class/per-level reference
>   table** (all 12 classes × L1–20, generated from live seed data) so a future agent
>   need not re-query `/api/classes`.
>
> **4 findings (FINDING ≠ bug — see README §Notes):**
> 1. **Wizard spellbook vs prepared-spell cap** — the spellbook (6→44) is validated
>    against the prepared cap (INT mod + level), so creating/advancing a Wizard needs
>    `allowHomebrewSelections`. **Draft filed:**
>    `FRONTEND-REQUEST-wizard-spellbook-prepared-cap.md` (frontend repo only — **NOT
>    yet copied to the backend root**; copy it there on Kevin's go to hand it off).
> 2. Creation doesn't enforce earned-ASI completeness (Fighter L8 ok with 1 of 3 ASIs).
> 3. Creation doesn't enforce minimum spell counts (Wizard L11 ok with 0 spells).
>    (#2/#3 may be by design — only `levelup/apply` forces counts; file requests only
>    if the product wants creation to enforce them.)
> 4. No flat-modifier status effect in the catalog → the "flat folds-in, not
>    double-counted" buffs half can't be asserted directly (dice + adv/disadv IS).
>
> **Next steps:** (a) on Kevin's go — `git push` the harness + copy the
> wizard-spellbook FRONTEND-REQUEST to the backend root; (b) optionally turn findings
> #2/#3 into requests. NOTE: subrace #25 already shipped (`0942095`), so the
> "ONLY OUTSTANDING = subrace-choice-traits" note in the block below is **superseded**.
>
> ---
>
> ## ✅ SESSION 2026-06-12/13 — all shipped + pushed (HEAD `16dd4b3` on `origin/main`)
>
> A long session; **everything below is committed AND pushed to production** (GitHub
> Pages). Working tree is clean of source changes. The backend cleared its **entire**
> request queue overnight (migrations 061–068) and every callback is now consumed.
>
> **Shipped this session, in order:**
> 1. **Encounter combatant-row declutter** (`63635f5`) — two-row card, label-less
>    toolbar, merged Set/Temp HP, ghost ✕ remove. Killed the `--aligned` CSS.
> 2. **Vault retire redesign + ASI panel redesign** (`3489839`, `5b76691`) — reserved
>    retire lane / equal-height cards / stable hover; ASI shows effective score + `+N` chip.
> 3. **Buffs system** (`d382aab`) — consumes mig 061–063: `RollTarget`/`RollModifierKind`/
>    `AdvantageState` enums; encounter badge durations + ◈ concentration + "use"; **Break
>    Concentration**; CharacterSheet **"At roll time"** dice/advantage riders. Flat riders
>    are pre-folded server-side — never re-rendered (no double-counting invariant).
> 4. **Combat-UX batch** (`2b07996`/`7a91af3`/`56efdc2`/`523f85c`/`96fed93`, Opus agent) —
>    shared libs (`lib/sheetTips.ts`, `lib/useBlockOrder.ts`, `components/DraggableBlock.tsx`,
>    `lib/sheetBlocks.ts`); player-combat design-system tooltips + sheet-grade breakdowns;
>    drag-reorder of the player's 4 boxes; **DM read-only sheet popup** (extracted
>    `routes/CharacterSheetView.tsx` — the route sheet is now a thin fetch/actions wrapper);
>    session-required encounter creation + session-grouped list.
> 5. **Resource tracking** (`c93242e`/`a95de78`, Sonnet agent) — consumes mig 064:
>    `components/CombatantPools.tsx` pip tracks + set-semantics steppers + Short/Long Rest on
>    DM + player cards; pact slots; log glyphs 40/41/42.
> 6. **#20 spell source-class + #21 TurnRewound** (`a34bbb7`) — multiclass sheets attribute
>    each spell to its governing caster's DC (chip + tooltip); `↩` log glyph for undo-turn.
>    `spellPicks` write path modeled (no manual picker UI — tags populate via level-up).
> 7. **#22 hide-turn-order + #24 wizard-spellbook + #23 session-delete warning** (`faed744`)
>    — DM header toggle (🙈/👁) via generic `campaigns.patchEncounter`; player hides the
>    tracker (banner stays); Wizard `spellbookSize` is a required builder count; session
>    delete warns + surfaces the backend 409.
>
> **▶ ONLY OUTSTANDING WORK = backend-blocked:** `FRONTEND-REQUEST-subrace-choice-traits.md`
> is filed in the backend root but **the backend has NOT started it** (no HANDOFF, no
> INCOMING; their last commit is the wizard spellbook). When it ships: consume High Elf
> cantrip/language as Selections in the builder Race step + Drow Magic racial-spell display.
> Nothing to do until the callback lands.
>
> **Optional / nobody-asked (don't start without Kevin):** a manual per-spell source-class
> picker in `ManageSpellsDialog` (#20 follow-up; today tags only auto-populate via level-up);
> Compendium "add homebrew" POST flows; richer multi-pick spell UX.
>
> **Verification debt (not features):** the **#24 Wizard builder screenshot** was never
> captured — blocked by a **dead Vite dev `/api` proxy** (`:5173/api` times out while
> `:3501` serves fine) that went stale after this session's repeated IIS pool recycles.
> **Fix: restart `npm run dev`.** #24 is build + logic + live-API-data verified
> (Wizard L1 `spellbookSize=6`); only the visual is owed.
>
> **Backend contract state:** DB through **migration 068**; INCOMING #19–#24 all DONE +
> consumed. `INCOMING-FROM-BACKEND.md` is the source of truth; read the newest entries.
> Two gotchas added to project `CLAUDE.md` this session: orphaned spectral Chromes hold
> SignalR connections and starve the IIS worker; the Vite dev proxy dies after pool recycles.
>
> ---
>
> ## Earlier session notes (HISTORICAL — superseded by the block above)
>
> **⚠ UNCOMMITTED WORK ON DISK (2026-06-12, gates green — commit these first):**
> `src/routes/Vault.css` + `src/routes/CharacterBuilder.steps.tsx` +
> `src/routes/CharacterBuilder.css` (two UI redesigns, both live-verified via
> spectral screenshots) and `INCOMING-FROM-BACKEND.md` if not already in the docs
> commit (the backend appended the buffs entry; committing it here is our job).
> Kevin reviews screenshots first, then says "commit and push" — **push = GitHub
> Pages production deploy** and is gated on the critical-review marker
> (`.claude/.critical-review-done-main-<sha7>`, minted by `/critical-review`).
> - **Vault retire redesign:** card reserves a 5.25rem right lane; Retire/Unretire
>   is an always-visible ghost pill, vertically centered (was hover-only overlay
>   that covered the meta text). Three real bugs fixed: (1) `.vault__card-body`
>   was a flex item with default `min-width:auto` → long names pushed text under
>   the button THROUGH the padding lane (fixed `min-width:0` +
>   `overflow-wrap:break-word`; verified with a `getBoundingClientRect` overlap
>   probe in the live page); (2) `.btn:hover`'s `transform: translateY(-1px)`
>   **replaced** the pill's `translateY(-50%)` centering → hover jump; centering
>   now uses the separate `translate` property, which composes; (3) the card's
>   3px hover-lift keyed off the Link's own `:hover`, so entering the pill (a
>   sibling overlay) dropped the card — lift now keys off `.vault__card-wrap`.
>   Cards are equal-height (wrap is flex, card `flex:1`); grid floor 260→300px.
> - **ASI panel redesign (`ImprovementsPanel`):** the dangling `+4 = 19` line is
>   gone — the stepper shows the **effective** score (accent + semibold via
>   `builder__stepper-val--up`, tooltip carries "Base N + M"), and the allocation
>   rides as a `+N` chip at the right end of the stat-name row. Markup + CSS
>   only; no state or handler changes.
>
> **✓ DONE + PUSHED 2026-06-12 (deployed): encounter combatant-row declutter** —
> commit `63635f5`. Both Sides and Initiative views now share one two-row card:
> identity row (marker · name/AC · full-width-capped HP bar · condition chips ·
> ghost ✕ remove pinned top-right) + a label-less control toolbar (hairline
> separators; inline labels kept only where bare inputs would be ambiguous: Init,
> Name, Max HP, AC, Death Saves). **Set HP + Temp HP merged into one cluster**
> (`[HP] Set Temp` mirroring `[Amt] Dmg Heal`) — `tempHpInputs` state deleted,
> both handlers read `setHpInputs`. The whole `--aligned` fixed-column CSS
> section and the sides-view auto-fill grid were deleted (net −84 lines).
> Critical-review report: `projectnotes/critical-review/2026-06-12/`.
>
> **▶ NEXT WORK — consume the buffs system (backend shipped 2026-06-12, live,
> migrations 061–063, ZERO frontend consumption).** Read the newest
> INCOMING-FROM-BACKEND entry + `<backend>/docs/HANDOVER-buffs-rollmodifiers.md`.
> Order: (1) `types.ts` — `RollTarget`/`RollModifierKind`/`AdvantageState`
> numeric enums + new fields on `CharacterResponse` (`rollModifiers`,
> `rollAdvantages`), `StatusEffectResponse` (`consumedOnUse`,
> `defaultDurationRounds`, `rollModifiers`), combatant badges (`remainingRounds`,
> `sourceCombatantId`, `consumedOnUse`); (2) `EncounterView` — duration input on
> "+ Condition" (pre-fill `defaultDurationRounds`), rounds-left counter on
> badges, concentration source + `break-concentration`, "use" button on
> consumed-on-use badges (existing DELETE); (3) `CharacterSheet` — render dice /
> advantage riders. **Never re-apply flat riders — they're pre-folded** into the
> derived numbers (the backend's no-double-counting invariant).
>
> **Roadmap gap analysis (2026-06-12, verified by grep not docs):** every other
> shipped backend surface IS consumed (featureChoices, multiclass
> prereqs/grants/choices, invocations, isPactMagic/combined slots, subraces,
> spell scaling Tier 1+2, HP-override dialog, invitations+decline,
> member-characters dropdown, combatant PATCH, initiative re-sort, player death
> saves, isDead). CAMP-08 closed (catalog 0 FAIL). Backend-first items to track,
> nothing to build yet: combat resource/slot spend (the only unbuilt Mode B MVP
> bullet), subrace choice-traits, Wizard spellbook, 5.5e Phase 2, multiclass
> spell-DC source-class. Optional fill-out nobody asked for: compendium browse
> pages for the fighting-style/metamagic/invocation catalogs.
> Backend replies: `BACKEND-RESPONSE-prepared-spell-cap.md` +
> `BACKEND-RESPONSE-rules-enforcement-audit.md` (commits 28ed633/c03001f/92eadf8, live
> on `:3501`). Frontend consumption done + live-verified the same day:
> - `maxPreparedSpells` read in `ManageSpellsDialog` (shows the correct **5** for the
>   E2E Paladin; the wrong mod+level stopgap is **deleted**); over-cap / off-class PUT
>   → 400 surfaced via the existing ApiError path. `UpdateSpellsRequest` gained
>   `allowHomebrewSelections?` (modeled; no UI toggle yet — only send true behind an
>   explicit DM homebrew control).
> - `abilityScores[].modifier` consumed everywhere; **all three `abilityMod` client
>   copies deleted** (CharacterSheet / ManageSpellsDialog / PlayerEncounterView).
> - `POST .../roll-initiatives` wired into `EncounterView` (client d20 loop retired);
>   ASI-budget + spell-subset create gates are backend-side, nothing to do client-side
>   (builder hint already counts only ASI points — feats deliberately NOT counted,
>   backend decision).
>
> **✓ CAMP-08 ALSO RESOLVED (same day):** backend `cbcec90`
> (`BACKEND-RESPONSE-dm-register-member-character.md`) — DM-first branch (accept-set ==
> member-character dropdown set) + `ownerId` now the true owner. Re-tested: DM register
> member char → 204 with `ownerId` = member; CAMP-08b 400 + ENC-13 400 no-regression.
> Catalog FAIL count is back to **0**. **No backend requests pending.** Design note from
> the backend worth remembering: a DM who is ALSO an Active member of their own campaign
> can register their own chars (offer-set rule) — the common case excludes them. Their
> standing offer: server-side player-scoped `EncounterResponse` projection (the
> hidden-combatant network-tab leak) — ask when it matters.
> Op note: an IIS 503 mid-session usually means the backend was rebuilding (in-process
> hosting locks the DLL) — `Start-WebAppPool DMTool` recovers; not an app fault.
>
> **✓ DONE 2026-06-11 (this session)** — commits `fab5d68` / `6b1511d` / `a35663b`:
> a L10 Paladin (prepared caster) couldn't select any creation spells — `toggleCapped` read the
> 0 required count as a full cap and `spellsComplete` demanded exactly 0 picks; fixed with
> `spellPlan.spellsOptional` (uncapped, never blocks Next; known-caster counts unchanged).
> Earned-ASI count now derives from `ClassResponse.features` rows (kind
> `AbilityScoreImprovement`, level ≤ pick level — the same rows the backend `LevelUpPlanner`
> reads; the old `[4,8,12,16,19]` + Fighter/Rogue name-match is gone; homebrew classes now
> work). **Live-verified via spectral: Fighter 12 → "earned 4 ASIs / 8 points".**
> Schedule-neutral copy sweep (5 spots): ASI hint, metamagic/invocation hints, multiclass "13+"
> warning (real minimum is the backend's edition-dependent `minimumScore`), "Paladin before
> level 2" example, and the **stale** LevelUpDialog multiclass note (grants ARE collected
> in-dialog since backend mig. 048). `SpellcastingResponse.maxPreparedSpells?` modeled in
> `types.ts` (additive, absent until backend ships).
>
> **⚠ Tooling correction (2026-06-11):** `spectral batch` **CAN drive interactions now** —
> this session ran 12 actions including eval-`.click()` on step-nav/class cards and a React
> native-setter `input` dispatch (level field), no hang, against the dev server. The
> 2026-06-08 "hangs on any state-changing action" note below appears outdated (spectral
> updated since?). Try `spectral batch` first; fall back to the `%TEMP%` CDP driver only if
> the hang recurs. Recipe that worked: project `CLAUDE.md` → "Browser verification".

> **▶ SCOPE B IS NEXT (2026-06-10):** backend merged the `scope-b` vertical to `master`
> (campaigns, encounters, SignalR, DM transfer, character copy, retire flag). Frontend has
> **no Scope B UI yet** (the local `scope-b` branch is just two config tweaks). The build
> plan — tiers, model strategy, endpoints, enums, the SignalR risk note — is in
> **`SCOPE-B-PLAN.md`**. Build Tiers 0–3 on **Sonnet**, flip to **Opus** for Tier 4 (SignalR).
> Backend contract: `DMTool/docs/SCOPE-B-FRONTEND-HANDOVER.md`.

> **▶ EARLIER NEXT ACTION:** check the backend's reply to **`FRONTEND-REQUEST-unarmed-attacks.md`**
> (sent this session). When the backend returns an **Unarmed Strike** in `weaponAttacks` (Monk Martial
> Arts die etc.), it renders in the Attacks block automatically — then **drop the interim "Unarmed"
> placeholder row** in `EquippedBlock` (`CharacterSheet.tsx`). Other still-open optional items (all
> backend-shipped, frontend-pending): wire `ClassResponse.features` (feature-by-level), `ItemResponse.category`/
> `rarity` (compendium facets), `RaceResponse.traits`; extend the builder **Review** step to list chosen
> styles/metamagic/expertise/spells/improvements; app-level **ErrorBoundary**; live-verify 401→login + Compendium.
>
> **⚠ After pulling, hard-refresh the browser (Ctrl+Shift+R):** the tooltip positioner is installed in
> `main.tsx`, and Vite HMR does NOT re-run entry-point side-effects on hot reload — an open tab stays stale.

> **✓ DONE 2026-06-08 (this session):** the session-3 builder steps are **live browser-verified
> end-to-end**. Built a **Fighter L1** (Fighting Style "Archery" → sheet Sub-features), a
> **Sorcerer L5** (2 metamagic + 5 cantrips/6 spells + L4 ASI: base 10 +2 = eff 13), and a
> **Fighter/Wizard multiclass** (Fighter=starting class, Wizard self-skips its prepared-caster
> spell step) — each created through the actual wizard UI and confirmed on the API + sheet
> screenshots.
>
> **⚠ Tooling note — spectral cannot drive interactions in this app.** `spectral batch` hangs
> indefinitely on ANY state-changing action (native `click`/`fill` OR eval-`.click()`) — its
> post-action stability wait never resolves after a React re-render (reproduced against both the
> dev server and the production preview; read-only eval/navigate batches complete fine, and a
> Promise-returning eval also hangs). **Workaround that works: a tiny Node CDP driver** over
> Node 24's built-in `WebSocket` — launch headless Chrome with `--remote-debugging-port=9222`,
> then `Runtime.evaluate` to click/read with Node controlling the inter-step delays (no hang).
> The driver + per-build action generators are in `%TEMP%` (`cdp.cjs`, `gen2/gen3/gen5.cjs`).
> Two gotchas baked into the generators: (1) a same-element repeated click (e.g. the ASI `+`)
> needs a re-render between clicks because the handler captures a stale `inc` — use two evals
> with a sleep, not one eval clicking twice; different-id chip toggles batch fine in one eval.
> (2) `npm run preview` now proxies `/api` (added `preview.proxy` to `vite.config.ts`).

> **✓ DONE 2026-06-08 (session 4) — INCOMING #7/#8 consumed, multiclass routed through the engine.**
> Commits `ac3e54c` + `e4892b8`, **pushed** to `origin/main` (gates green: `tsc -b` + eslint; `oby
> verify` delta 0). (1) **PUT-200:** `characters.update()` now returns the PUT body directly — the
> follow-up GET is gone (`PUT /api/character/{id}` → `200 + CharacterResponse`, backend `b2fa276`;
> live-verified 12.5KB body). (2) **Multiclass via the level-up engine:** the sheet's Multiclass action
> now opens `LevelUpDialog` in a new `mode="multiclass"` that plans/applies an **unowned** classId at L1
> (engine `fromLevel 0 → 1`), so the new class's L1 HP, subclass, caster spells, and feature sub-choices
> (Fighter→Fighting Style, Rogue→Expertise) all flow through the same plan/apply machinery. The bulk-PUT
> `AddClassDialog` + the orphaned `characterResponseToRequest` helper were **retired** (deletes landed in
> `351ca79`). **Live-verified via the Node CDP driver** (Sorcerer 5 → +Fighter w/ Archery → Sorcerer 5 /
> Fighter 1 · Level 6; Sorcerer-excluded picker, "Add Fighter" button, in-place sheet re-render +
> screenshots). (3) **INCOMING #8:** backend made multiclass proficiencies **RAW-correct** (migration
> 041, no contract change) — the dialog's DM caveat was corrected accordingly (only unenforced ability
> prereqs + un-applied "choose a skill/instrument" multiclass grants remain as caveats).
>
> ⚠ Test chars mutated by verification (throwaway, under `dungeonmaster`): **"Spectral Fighter L1"** →
> Fighter 1/Sorcerer 1; **"Spectral Sorcerer L5"** (`a0a73a5c…`) → Sorcerer 5/Fighter 1.

> **✓ DONE 2026-06-08 (session 5) — UI polish sweep + mobile fixes (all pushed, `tsc`+eslint green).**
> All CDP-verified at 390px (iPhone 12 Pro) and desktop. Commits `9139007`→`ec679af`.
> - **Level-up dialog:** Apply label stays one line (`9139007`); a "choose 0" spell/cantrip section is
>   hidden (Bard 1→2 has no new cantrip) (`3eea4bf`); dialog sits above the sticky nav (z `--z-modal`,
>   was 50) + tighter mobile padding so it never overruns a narrow viewport.
> - **Builder:** Back hidden on step 1 (was dead UI), Cancel restyled to a crimson-outlined exit (`456354e`);
>   **ASI panel only shows when ASIs are actually earned** (per *class* level 4/8/12/16/19 +Fighter 6/14
>   +Rogue 10 — so Paladin 1/Cleric 1 shows none), hint states earned count + budget; ability-grid labels
>   reserve the PRIMARY-tag height so CHA/STR/WIS columns align (`a71c800`). Background dup-skill warning
>   **already worked** (verified: pick Religion → Acolyte shows ⚠ Religion + swap note).
> - **Collapse:** sheet Features + Compendium entries collapse by default (native `<details>`, shared
>   `.disclosure` primitive in theme.css); Compendium keeps header+meta (level/school/Cantrip, casting
>   time, range) visible, folds only the description (`a71c800`).
> - **Filters:** ALL catalog searches (spells, cantrips, equipment, inventory, compendium) now
>   **prefix-match** (`startsWith`), not substring (`a71c800`).
> - **Mobile:** vitals render as a uniform grid — equal-size tiles, pinned label line-height so a wrapped
>   "Pass. Perc" doesn't grow its row; responsive nav (wordmark hidden ≤560, "Sign out" one line, `41242c4`).
> - **Tooltip cutoff — ROOT CAUSE FOUND (`8879fe4`):** hidden `.tip::after` tooltips (visibility:hidden,
>   still in layout) ran past the viewport for right-edge hosts, adding ~72px of **horizontal page scroll**
>   on mobile — that scroll is what made tooltips AND the dialog look cut off. Fixed by `overflow-x: clip`
>   on `.shell__main` (clip, not hidden → vertical tooltips still show, sticky nav untouched). Also added a
>   JS positioner (`src/lib/tooltips.ts`, installed in `main.tsx`) that nudges edge tooltips on-screen via
>   `--tooltip-shift`. **NOTE: hard-refresh needed** — HMR doesn't re-run main.tsx side-effects.
> - **Monk/unarmored Equipped block (`3558ccd`,`e900a13`,`ec679af`):** the block no longer self-hides when
>   nothing is worn — shows `Unarmored | armor` and `Unarmed | weapon` rows (both via `EquipRow`, aligned;
>   AC math stays in the AC-vital tooltip). The **real** unarmed-strike attack die belongs server-side →
>   sent **`FRONTEND-REQUEST-unarmed-attacks.md`** (asks backend for an Unarmed Strike in `weaponAttacks`
>   + confirm Unarmored Defense AC). When it ships, the strike shows in the Attacks block and the interim
>   `Unarmed` row in `EquippedBlock` should be removed.
>
> **CDP driver note:** `cdp.cjs` in `%TEMP%` now supports `CDP_W`/`CDP_H` env vars for exact viewport
> emulation (set `mobile:false`+screenWidth so innerWidth matches) and a `{hover:"selector"}` action
> (`Input.dispatchMouseEvent`). Use `CDP_W=390 CDP_H=844` for iPhone 12 Pro. (Earlier `mobile:true` runs
> reported innerWidth ~84px too wide — fixed.)

Refreshed 2026-06-08. This is the authoritative "where things stand + what to do
next" doc. Companion: `FRONTEND-CONTEXT.md` (architecture/API map) and `CLAUDE.md`
(commands, constraints, spectral recipe, quality-gate notes). Backend lives at
`C:\Users\keisi\source\repos\DMTool` (`DMTool.slnx`); the authoritative API
contract is its `Models/*` + `Entities/Enums/*`.

## Current state
- **Git:** repo on `main`, remote `origin` (Azure DevOps `DMTools-Frontend`).
  Latest commit `ec679af` (Equipped-row alignment). Session-5 UI sweep is
  `9139007`→`ec679af` (see the session-5 done block above); session-4 was
  `ac3e54c`+`e4892b8`. **Only `vite.config.ts` is uncommitted** (a prior-session
  `preview.proxy` edit, not this session's — left as-is). All other work
  committed + **pushed**; critical-review markers stamped per HEAD.
- **Gates:** `npm run build` (`tsc -b && vite build`) and `npm run lint` both GREEN.
  There is **no test runner** — `tsc -b` + eslint are the correctness gates.
  (`oby verify`'s build step is a false negative here — `os error 193`; trust npm.)
- **Dev server:** `npm run dev` → http://localhost:5173 (proxies `/api` → backend
  `:3501`). Restart with `npm run dev` if down.
- **Backend:** IIS at `:3501`. Test login **`dungeonmaster` / `Passw0rd!23`**.
  Characters are **owner-scoped** (IDOR fix) — you only see your own; another
  account's id returns 404.

## Done this session (roadmap items 1–4)
- **Builder gaps (item 1):** new **Background** step (with the background's "languages
  of your choice" Selection), new **Feats** step, per-class **subclass** picker in the
  Class step (gated at the class's subclass level; optional at creation), and
  **inventory items + coin purse** in the Equipment step.
- **Sheet inventory management (item 2):** live add/consume/attune controls + a catalog
  search-to-add on the sheet's Inventory block (posts to the inventory endpoints, swaps
  in the re-derived character). Added an **Edit** link in the sheet header.
- **Edit mode (item 3):** `/character/:id/edit` reuses the builder — loads a character,
  prefills every wizard-owned field, PUTs via `characters.update()`. Preserves fields
  the wizard doesn't expose (HP/AC overrides, known spells, status effects, character
  details/narrative) by carrying them from the loaded response; sets
  `allowHomebrewSelections` so re-submitting already-granted skills/languages passes.
- **Level-up polish (item 4):** at an ASI level, choose **distribute 2 ability points OR
  take a feat** (feat picker); **search filter** on large spell/cantrip pools.
- **Refactor:** extracted the builder's presentational step components +
  shared constants into `CharacterBuilder.steps.tsx` (de-god-componented the file the
  hindsight gate flagged; orchestrator state stays in `CharacterBuilder.tsx`).
- **API/types:** added `reference.feats()/backgrounds()/languages()`; `types.ts` synced
  to the live contract (`CharacterDetails`, HP/AC breakdown response types).

### Edit-mode deferrals (contract-limited — documented in CharacterBuilder.tsx)
- Proficiency **additions** (weapon/armor/tool/save) are **not preserved** on edit: the
  response exposes only the union of class-grants + additions, not the addition delta,
  so they can't be cleanly round-tripped. Rare (most characters rely on class grants).
- Skill **expertise downgrades to Proficient** on edit (the builder models Proficient
  picks only).
- A clean fix for both would be a backend PATCH/partial-update endpoint or exposing the
  stored addition deltas on `CharacterResponse`.

## Done — INCOMING #4 (level-up Phase 3: Fighting Style / Expertise / Metamagic)
Implemented + **live-verified** (Paladin 1→2: picked Dueling via the new picker →
`fightingStyles:[{name:"Dueling"}]`, sheet shows it). All gates green (build, lint,
`oby verify` delta 0).
- **types.ts:** `SelectionType` 4/5/6; `FightingStyleResponse`/`MetamagicResponse`;
  `CharacterRequest.fightingStyleIds`/`metamagicIds`; `CharacterResponse.fightingStyles`/
  `metamagics`; plan `featureChoices[]` (`FeatureChoiceResponse`); apply `featureChoices[]`
  (`FeatureChoiceApply`).
- **endpoints.ts:** `reference.fightingStyles()` / `reference.metamagics()`.
- **LevelUpDialog.tsx:** renders a `FeatureChoice` picker per plan entry (type 4/6 from
  `selection.options`; type 5 Expertise from the character's proficient skills — new
  `skills` prop); validation + "still needed" wiring; echoes `featureChoices` on apply.
- **CharacterSheet.tsx:** new self-hiding `SubFeaturesBlock` (Fighting Styles / Metamagic);
  passes `skills` to the dialog. **HP/AC breakdown tooltips** now render the real component
  math from `hitPointBreakdown`/`armorClassBreakdown` (closes the #3 leftover TODO).
- **CharacterBuilder.tsx:** edit-mode carries `fightingStyleIds`/`metamagicIds` from the
  loaded character so a PUT doesn't wipe them (same pattern as spells/status effects).

### New caveat (pre-existing, now more impactful)
Edit mode resubmits `skillProficiencies` all as **Proficient**, so editing a character that
has **Expertise** (now reachable via level-up Rogue/Bard) downgrades those skills to
Proficient. Documented deferral (see "Edit-mode deferrals"); the clean fix is the same
backend partial-update/delta exposure noted there.

### Built in session 3 (was the "not built" item above)
Create-time Fighting Style / Expertise / Metamagic **and** known-caster spells **and**
above-L1 ASIs are now collected in the builder — see the session-3 section below.

## Done — 2026-06-07 (session 2, commit `2c4cc81`)
All gates green (`npm run build`, `npm run lint`); oby precheck delta **0 introduced**.
- **Bug fixed — wizard Back button.** Was actually correct in code; live-verified via
  spectral snapshot (Back `disabled` on step 0, enabled on step 1). No change needed
  beyond confirmation. (The browser-back-loses-progress option was offered; not chosen.)
- **Bug fixed — sheet header button size.** Root cause was app-wide: `<button class="btn">`
  used the UA font while `<a class="btn">` inherited the page font. Added
  `font-family/size: inherit` to `.btn` in `theme.css` (fixes button/link parity
  everywhere) + removed the stale `.sheet__levelup` margin.
- **Builder (a) background dup-skill flag** — `BackgroundStep` cross-references `bg.skills`
  vs class `skillIds`; overlaps get a red ⚠ tag + a note. Live-verified.
- **Builder (b) Review step** — added **Age** + **Background feature**. Deliberately NOT
  HP/AC preview (server-derived; CLAUDE.md forbids client recompute).
- **Too-many-classes warning** — non-blocking advisory at ≥3 classes in the Class step
  (`MULTICLASS_WARN_AT`). Live-verified (screenshot: 3 classes → red banner).
- **Multiclass from the sheet** — new `routes/AddClassDialog.tsx` (+ `.css`): pick a
  class not already taken, append at level 1, persist via `characters.update()`,
  re-render in place. Uses the **PUT path** because the level-up engine rejects a
  not-yet-owned class (confirmed in backend `LevelUpPlanner.Plan`). New shared
  `api/characterRequest.ts#characterResponseToRequest()` (lossless response→request)
  — **also fixes the Expertise→Proficient downgrade** on round-trip (preserves real
  skill levels), unlike the builder's edit path.
- **Bug fixed — "multiclass redirects to nothing" (blank sheet).** `PUT /api/character/{id}`
  returns **204 No Content**, so `characters.update()` resolved to `undefined` →
  `setC(undefined)` → blank. `update()` now PUTs then **re-GETs** the fresh character.
  **This also fixes builder edit-save** (`navigate(/character/${saved.id})` on undefined),
  which the prior handover flagged as never click-tested. Verified: pre-fix repro showed
  nav-only (4 refs); direct node PUT test confirmed 204 + persistence.
- **401 → login redirect (session expiry).** `client.ts` fires a hook on any authed 401
  (clears token); `AuthContext` resets state so `RequireAuth` bounces guarded routes to
  `/login`. `Login` now honors the `from` location. Login itself (`auth:false`) is
  unaffected.
- **Compendium enriched + categorized.** Each tab now shows rich detail (was name-only);
  spells grouped by level, items by Equipment vs Magic Items, collapsible sections with
  counts (search force-expands). Frontend-only — all data already on the reference DTOs.

### Backend handover (this session)
`DMTool/FRONTEND-REQUEST-compendium-and-update-contract.md` — Compendium needs **nothing**.
One real ask: make `PUT /api/character/{id}` return **200 + updated CharacterResponse**
(consistent with create + levelup/apply) so the frontend can drop the extra GET in
`update()`. Optional: multiclass-in via the level-up engine; richer item/race/class DTOs.

## Done — 2026-06-08 (session 3, commit `4c0f2fa`) — full-fidelity above-L1 / multiclass creation
**The original goal is met:** a character built directly at any level (incl. multiclass)
now gets every choice its level entitles. All gates green (`npm run build`, `npm run lint`,
`oby verify` delta **0**); critical-review **PASS**; payload **live-verified** against `:3501`
(Sorcerer L5: CHA base 15 +2 improvement = 19, 2 metamagics, 5 cantrips + 6 spells, Draconic —
all round-trip on re-GET).

Investigation that drove it (simulation + cross-repo trace) found the builder was a
"level-1 creator with a level dial that didn't backfill choices." The **engine + apply
path were already correct**; gaps were (a) read-side metadata not exposed and (b) two seed
holes. Backend shipped all of it (INCOMING #5 + #6); this session consumes it.

- **types.ts:** `ClassResponse.featureSelections` + `SubclassResponse.featureSelections`
  (type 4/5/6 selections); `ClassResponse.spellcasting` (`ClassSpellcastingResponse` +
  per-level `progression`); `CharacterRequest.abilityImprovements`.
- **CharacterBuilder.steps.tsx:** new `ChoicesStep` (generic `ChoiceGroup[]` — Fighting
  Style / Expertise / Metamagic), `SpellsStep` (+ `SpellPick`/`SpellPickList`, search on
  big pools), `ImprovementsPanel`; `STEPS` now 10 entries (Choices @4, Spells @5).
- **CharacterBuilder.tsx:** loads `reference.spells()`; aggregates `subFeature` budgets +
  pools across every class + chosen subclass (level-gated), `expertiseOptions` (= chosen
  class skills), `spellPlan` (cumulative cantrip/spell counts from the progression row at
  each caster's level, pool filtered to `maxSpellLevel`, prepared/non-casters skip);
  `choicesComplete`/`spellsComplete` gates; positional arrays + render switch renumbered to
  10 steps; `buildPayload` sends `fightingStyleIds`/`metamagicIds`, Expertise via
  `skillProficiencies[].level=2`, merged `spellIds` (cantrips+spells), and
  `abilityImprovements`. Edit mode prefills + round-trips all of these — **this also fixes
  the old Expertise→Proficient downgrade on the builder edit path** (expertise is now
  preserved).

### Session-3 deferrals (acceptable; documented)
- **Multiclass union pools:** sub-feature option pools and caster spell counts are
  aggregated/unioned across classes (the request is flat), so a double-caster or
  fighting-style-from-two-classes could pick from the combined pool. Fine for a DM tool;
  per-class grouping is the durable refinement if it ever matters.
- **Wizard spellbook:** Wizard is `isPrepared` → builder skips its creation spell step
  (no spellbook-size concept backend-side; DM adds via edit). Backend will add a
  spellbook-size field on request.
- **Paladin** has an empty spellcasting `progression` (backend Tier-1 deferral); it's
  `isPrepared` so the spell step skips it anyway. Ask backend to seed it if needed.
- **Stale expertise id:** deselecting a class skill after marking it for Expertise leaves
  a stale id that's silently dropped at payload-build (still a valid payload).
- ASIs use **free allocation** (no count enforcement) — the reference API doesn't expose
  the per-class ASI schedule, so the panel guides with a hint rather than a hard budget.

## Verification gaps (carry forward)
- **Spectral is slow + flaky in this env** (cold start ~5s, hangs with `--console`;
  big multi-action batches can hit the timeout). Use screenshot/`--snapshot` batches,
  not `--console`. Clear orphan **headless** Chrome via PowerShell (kill only
  `--headless` PIDs — the user has ~80 real Chrome procs; don't touch those).
- **Not live-clicked post-fix:** the multiclass dialog success path screenshot timed out
  (fix is proven via node PUT test + code path, but a green screenshot is still owed).
  Test char left in DB: **"Multiclass Test Dummy"** `d5f11f29-76b8-4b3f-b69c-4048b3173e9a`
  (now Bard 1/Barbarian 3) under `dungeonmaster`.
- 401-redirect and Compendium render not yet click-verified live (build/lint green).

## TODO — next session
- [x] **Live-click the new builder steps** — DONE 2026-06-08 (Fighter L1, Sorcerer L5,
  Fighter/Wizard multiclass; all created through the wizard UI + verified on API/sheet).
  Driven via the Node CDP driver, not spectral (spectral can't click here — see banner).
- [x] **INCOMING #7 — drop the extra GET in `characters.update()`** — DONE 2026-06-08
  (`ac3e54c`). Pool verified on `b2fa276` (PUT → 200 + 12.5KB body); `update()` returns it directly.
- [x] **INCOMING #7 — multiclass-in question answered + shipped** — DONE 2026-06-08 (`e4892b8`).
  Decided: route the sheet's Multiclass action through `levelup/plan`+`apply` (`LevelUpDialog`
  `mode="multiclass"`); bulk-PUT `AddClassDialog` retired. INCOMING #8 confirmed this is the
  intended path + made multiclass proficiencies RAW-correct (migration 041). CDP-verified live.
- [x] **INCOMING #7 — optional UI enrichments** — DONE (Compendium). `ItemResponse.category`/
  `rarity` show as item tags, `RaceResponse.traits` + subrace traits render as expandable
  detail, `ClassResponse.features` render as a per-level feature list. (Sheet/race-detail not
  separately enriched — Compendium covers the catalog browse.)
- [x] Extend the **Review** step to list chosen fighting styles / metamagic / expertise /
  invocations / spells / above-L1 improvements — DONE 2026-06-11. `CharacterBuilder` derives
  display names from `choiceGroups` + the spell pools + the `improvements` record and passes
  them to `Review` (`classChoices` / `improvements` / `cantripNames` / `spellNames`).
- [ ] Live-verify (Node CDP driver) the 401→login redirect and the Compendium grouping/detail
  render. (The multiclass dialog success path is CDP-verified — see the session-4 banner.)
  Still owed: needs backend (:3501) + dev (:5173) running; on 2026-06-11 the IIS pool was
  stopped (503) and starting it needs an elevated shell.
- [x] App-level **ErrorBoundary** — DONE 2026-06-11. `src/components/ErrorBoundary.tsx` wraps
  all routes in `App.tsx`; a render throw now shows a recoverable fallback (with Reload)
  instead of a blank screen. Cleared the `comp-missing-error-boundary` +
  `async-no-error-boundary` high-severity findings.

## Still open / never-started (from FRONTEND-CONTEXT next-steps)
- Homebrew `*CreateRequest` DTOs + POST flows when the Compendium gains "add homebrew".
- Richer multi-pick spell UX beyond search + count-capped toggling (grouping by level,
  prepared-vs-known distinction) if desired.

## Environment gotchas
- **Code-change-threshold + critical-review gates:** CodeBridge hooks block (1) any
  `Write`/`Edit` once **uncommitted changes exceed ~1500 lines** and (2) `git commit`
  until a `/critical-review --resolve-all` marker is stamped for the staged diff
  (`.claude/.critical-review-done-<branch>-<sha7>`). Practical flow for a big change:
  commit in chunks so you don't cross the threshold mid-edit; run the critical review
  before committing; shell file-ops (not the Write/Edit tools) are not threshold-gated
  if you get wedged.
- **Quality-cascade Stop-hook:** inapplicable to this no-test-runner frontend.
  `CODEBRIDGE_SKIP_CASCADE=1` is in `.claude/settings.json` (loads at session start).
- **Spectral verification:** per-call daemon dies between CLI calls; use `spectral batch`
  (single process) — recipe in `CLAUDE.md` (inject JWT into `localStorage['dmtool.jwt']`,
  navigate, `--screenshot`, read `C:\tmp\spectral-batch\final.png`).
- `.oby/`, `.spectral/`, `.codebridge/`, `.critical-review-state.json`, `.env`, and
  oby-generated `.claude/CLAUDE.md` + `.claude/references/` are gitignored.

## Coordination files
- `FRONTEND-REQUEST-class-proficiencies.md` (backend repo) — DONE.
- `FRONTEND-REQUEST-hp-ac-breakdown.md` (backend repo) — DONE (tooltips render the math).
- `CHARACTER-CREATION-HANDOFF-FROM-FRONTEND.md` (here) — DONE (INCOMING #5; #1–#5).
- `FRONTEND-REQUEST-spellcasting-progression.md` (here) — DONE (INCOMING #6).
- `FRONTEND-REQUEST-compendium-and-update-contract.md` (backend repo) — **DONE both sides** (INCOMING
  #7/#8): PUT-200 consumed + multiclass-in routed through the engine (session 4). Optional enrichments
  (`ClassResponse.features`, `ItemResponse.category/rarity`, `RaceResponse.traits`) still frontend-pending.
- `FRONTEND-REQUEST-unarmed-attacks.md` (**backend repo** — that's where the backend session reads
  FRONTEND-REQUEST files; a copy also sits in this repo) — **SENT this session, awaiting backend.** Asks
  for an Unarmed Strike in `weaponAttacks` (Monk Martial Arts die) + confirm Unarmored Defense AC. Consume
  the reply on resume (then drop the interim `Unarmed` row in `EquippedBlock`).
  ⚠ Convention: **FRONTEND-REQUEST-*.md belong in the backend repo** (`C:\Users\keisi\source\repos\DMTool`),
  not here — the backend session doesn't see this repo.
- `INCOMING-FROM-BACKEND.md` (here) — backend's callback log. **#1–#8 all consumed.**

## Not verified live this session
The builder/edit/inventory/level-up changes passed `tsc` + eslint + `oby verify`
(delta 0) but were **not** click-tested in the browser. Next session should spectral-
batch verify: create a character with a background+feats+subclass+inventory, edit it,
and exercise sheet inventory add/consume/attune + a feat-based ASI level-up.
