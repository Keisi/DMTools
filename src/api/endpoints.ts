/* ============================================================================
   Endpoint modules — one function per backend route, grouped by area.
   Routes mirror DMTool's controllers (see FRONTEND-CONTEXT.md for the full map).
   ========================================================================== */
import { api } from "./client";
import type {
  AddCombatantRequest,
  AddStatusEffectRequest,
  ArmorResponse,
  AuthRequest,
  AuthResponse,
  BackgroundResponse,
  CampaignCharacterResponse,
  CampaignCharacterSheetResponse,
  CampaignMemberResponse,
  CampaignResponse,
  CharacterRequest,
  CharacterResponse,
  ClassResponse,
  CopyCharacterRequest,
  CreateCampaignRequest,
  CreateEncounterRequest,
  CreateSessionRequest,
  EldritchInvocationResponse,
  EncounterResponse,
  EncounterSummaryResponse,
  FeatResponse,
  FightingStyleResponse,
  InventoryAddRequest,
  InventoryAttunementRequest,
  InventoryConsumeRequest,
  InviteMemberRequest,
  ItemResponse,
  LanguageResponse,
  LevelUpApplyRequest,
  LevelUpPlanRequest,
  LevelUpPlanResponse,
  MetamagicResponse,
  PatchEncounterRequest,
  RaceResponse,
  RegisterCampaignCharacterRequest,
  RestRequest,
  RetireCharacterRequest,
  SessionResponse,
  RollInitiativesRequest,
  SetInitiativeRequest,
  SkillResponse,
  SpellResponse,
  StatResponse,
  StatusEffectResponse,
  TransferDmRequest,
  AddCombatLogNoteRequest,
  CombatLogEntryResponse,
  CombatLogPageResponse,
  RecordDeathSavesRequest,
  UpdateCampaignCharacterHpRequest,
  UpdateCampaignSpellSlotRequest,
  AddCampaignStatusEffectRequest,
  UpdateCampaignResourceRequest,
  UpdateCampaignExhaustionRequest,
  SpendHitDiceRequest,
  UpdateCampaignHitDiceRequest,
  UpdateCombatantHpRequest,
  UpdateCombatantRequest,
  UpdateCombatantResourceRequest,
  UpdateCombatantSpellSlotRequest,
  UpdateHpRequest,
  UpdateSpellsRequest,
  WeaponResponse,
  GrantAdvantageRequest,
  SessionRecapResponse,
} from "./types";

export const auth = {
  register: (req: AuthRequest) =>
    api.post<AuthResponse>("/api/auth/register", req, false),
  login: (req: AuthRequest) =>
    api.post<AuthResponse>("/api/auth/login", req, false),
};

export const characters = {
  // GET /api/character returns full CharacterResponse[] (no summary DTO).
  list: () => api.get<CharacterResponse[]>("/api/character"),
  get: (id: string) => api.get<CharacterResponse>(`/api/character/${id}`),
  create: (body: CharacterRequest) =>
    api.post<CharacterResponse>("/api/character", body),
  // PUT returns 200 + the updated CharacterResponse (backend b2fa276), consistent
  // with create + levelup/apply. Callers (builder edit-save, sheet multiclass) use
  // the returned character directly — no follow-up GET needed.
  update: (id: string, body: CharacterRequest) =>
    api.put<CharacterResponse>(`/api/character/${id}`, body),
  remove: (id: string) => api.del<void>(`/api/character/${id}`),

  levelUpPlan: (id: string, req: LevelUpPlanRequest) =>
    api.post<LevelUpPlanResponse>(`/api/character/${id}/levelup/plan`, req),
  levelUpApply: (id: string, req: LevelUpApplyRequest) =>
    api.post<CharacterResponse>(`/api/character/${id}/levelup/apply`, req),

  // Replace the whole known/prepared spell list (cantrips + levelled) in one call
  // — the safe write path for spell edits outside the full builder. Returns the
  // updated character.
  updateSpells: (id: string, body: UpdateSpellsRequest) =>
    api.put<CharacterResponse>(`/api/character/${id}/spells`, body),

  // Set/clear the HP override (number sets, null clears -> derived). Returns the
  // updated character — the safe focused write path for the Edit HP quick-action.
  updateHp: (id: string, body: UpdateHpRequest) =>
    api.put<CharacterResponse>(`/api/character/${id}/hp`, body),

  inventoryAdd: (id: string, body: InventoryAddRequest) =>
    api.post<CharacterResponse>(`/api/character/${id}/inventory/add`, body),
  inventoryConsume: (id: string, body: InventoryConsumeRequest) =>
    api.post<CharacterResponse>(`/api/character/${id}/inventory/consume`, body),
  setAttunement: (id: string, itemId: string, body: InventoryAttunementRequest) =>
    api.put<CharacterResponse>(
      `/api/character/${id}/inventory/${itemId}/attunement`,
      body,
    ),

  // Toggle the retired organizer flag (migration 055). Returns updated character.
  retire: (id: string, body: RetireCharacterRequest) =>
    api.put<CharacterResponse>(`/api/character/${id}/retire`, body),

  // Deep-copy a character to another user. Caller must own it or be the campaign
  // DM. Returns the new CharacterResponse owned by the target.
  copy: (id: string, body: CopyCharacterRequest) =>
    api.post<CharacterResponse>(`/api/character/${id}/copy`, body),
};

// NOTE: every reference controller is [Authorize] on the backend (only
// /api/health and /api/auth/* are anonymous), so these require a JWT.
export const reference = {
  races: () => api.get<RaceResponse[]>("/api/races"),
  classes: () => api.get<ClassResponse[]>("/api/classes"),
  stats: () => api.get<StatResponse[]>("/api/stats"),
  skills: () => api.get<SkillResponse[]>("/api/skills"),
  spells: () => api.get<SpellResponse[]>("/api/spells"),
  items: () => api.get<ItemResponse[]>("/api/items"),
  armors: () => api.get<ArmorResponse[]>("/api/armors"),
  weapons: () => api.get<WeaponResponse[]>("/api/weapons"),
  feats: () => api.get<FeatResponse[]>("/api/feats"),
  backgrounds: () => api.get<BackgroundResponse[]>("/api/backgrounds"),
  languages: () => api.get<LanguageResponse[]>("/api/languages"),
  fightingStyles: () =>
    api.get<FightingStyleResponse[]>("/api/fightingstyles"),
  metamagics: () => api.get<MetamagicResponse[]>("/api/metamagics"),
  eldritchInvocations: () =>
    api.get<EldritchInvocationResponse[]>("/api/eldritchinvocations"),
  // Condition/buff/debuff catalog (GET /api/statuseffects). Used to populate the
  // encounter condition palette; the combatant-side application ignores the
  // catalog's numeric effects (purely-visual badges).
  statusEffects: () => api.get<StatusEffectResponse[]>("/api/statuseffects"),
  // ...armorcategories, weaponcategories, editions
};

export const health = () =>
  api.get<{ status: string }>("/api/health", false);

// ---- Scope B: Campaigns, sessions, encounters ----

export const campaigns = {
  // Campaign CRUD
  list: () => api.get<CampaignResponse[]>("/api/campaigns"),
  get: (id: string) => api.get<CampaignResponse>(`/api/campaigns/${id}`),
  create: (body: CreateCampaignRequest) =>
    api.post<CampaignResponse>("/api/campaigns", body),
  remove: (id: string) => api.del<void>(`/api/campaigns/${id}`),
  transferDm: (id: string, body: TransferDmRequest) =>
    api.put<CampaignResponse>(`/api/campaigns/${id}/dm`, body),

  // Membership
  members: (id: string) =>
    api.get<CampaignMemberResponse[]>(`/api/campaigns/${id}/members`),
  invitations: () =>
    api.get<CampaignResponse[]>("/api/campaigns/invitations"),
  invite: (id: string, body: InviteMemberRequest) =>
    api.post<void>(`/api/campaigns/${id}/invite`, body),
  join: (id: string) => api.post<void>(`/api/campaigns/${id}/join`, {}),
  acceptMember: (id: string, userId: string) =>
    api.put<void>(`/api/campaigns/${id}/members/${userId}/accept`, {}),
  rejectMember: (id: string, userId: string) =>
    api.put<void>(`/api/campaigns/${id}/members/${userId}/reject`, {}),
  removeMember: (id: string, userId: string) =>
    api.del<void>(`/api/campaigns/${id}/members/${userId}`),

  // Campaign characters
  characters: (id: string) =>
    api.get<CampaignCharacterResponse[]>(`/api/campaigns/${id}/characters`),
  memberCharacters: (id: string) =>
    api.get<CampaignCharacterResponse[]>(`/api/campaigns/${id}/member-characters`),
  registerCharacter: (id: string, body: RegisterCampaignCharacterRequest) =>
    api.post<void>(`/api/campaigns/${id}/characters`, body),
  unregisterCharacter: (id: string, characterId: string) =>
    api.del<void>(`/api/campaigns/${id}/characters/${characterId}`),

  // Sessions
  sessions: (id: string) =>
    api.get<SessionResponse[]>(`/api/campaigns/${id}/sessions`),
  createSession: (id: string, body: CreateSessionRequest) =>
    api.post<SessionResponse>(`/api/campaigns/${id}/sessions`, body),
  deleteSession: (id: string, sessionId: string) =>
    api.del<void>(`/api/campaigns/${id}/sessions/${sessionId}`),
  addToRoster: (id: string, sessionId: string, characterId: string) =>
    api.post<void>(
      `/api/campaigns/${id}/sessions/${sessionId}/roster/${characterId}`,
      {},
    ),
  removeFromRoster: (id: string, sessionId: string, characterId: string) =>
    api.del<void>(
      `/api/campaigns/${id}/sessions/${sessionId}/roster/${characterId}`,
    ),

  // Encounters — all mutations return the full EncounterResponse so no follow-up
  // GET is ever needed. setEncounter(response) is the single state-update path.
  encounters: (campaignId: string) =>
    api.get<EncounterSummaryResponse[]>(`/api/campaigns/${campaignId}/encounters`),
  getEncounter: (campaignId: string, encounterId: string) =>
    api.get<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}`,
    ),
  createEncounter: (campaignId: string, body: CreateEncounterRequest) =>
    api.post<EncounterResponse>(`/api/campaigns/${campaignId}/encounters`, body),
  // Generic DM-only encounter patch (INCOMING #22): name / description /
  // turnOrderHiddenFromPlayers. Returns the full EncounterResponse + broadcasts.
  patchEncounter: (
    campaignId: string,
    encounterId: string,
    body: PatchEncounterRequest,
  ) =>
    api.patch<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}`,
      body,
    ),
  deleteEncounter: (campaignId: string, encounterId: string) =>
    api.del<void>(`/api/campaigns/${campaignId}/encounters/${encounterId}`),
  startEncounter: (campaignId: string, encounterId: string) =>
    api.put<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/start`,
      {},
    ),
  nextTurn: (campaignId: string, encounterId: string) =>
    api.put<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/next-turn`,
      {},
    ),
  // Step the turn pointer back one (undo an accidental Next Turn). Backend support
  // pending — see FRONTEND-REQUEST-encounter-combat-controls.md (item 1).
  prevTurn: (campaignId: string, encounterId: string) =>
    api.put<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/prev-turn`,
      {},
    ),
  endEncounter: (campaignId: string, encounterId: string) =>
    api.put<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/end`,
      {},
    ),
  addCombatant: (
    campaignId: string,
    encounterId: string,
    body: AddCombatantRequest,
  ) =>
    api.post<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants`,
      body,
    ),
  removeCombatant: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
  ) =>
    api.del<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}`,
    ),
  setInitiative: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    body: SetInitiativeRequest,
  ) =>
    api.put<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/initiative`,
      body,
    ),
  // Server-side d20 + initiative bonus per combatant (rules live in the backend —
  // the old client-side Math.random loop dropped the Dex mod). One round-trip.
  rollInitiatives: (
    campaignId: string,
    encounterId: string,
    body: RollInitiativesRequest = {},
  ) =>
    api.post<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/roll-initiatives`,
      body,
    ),
  updateCombatantHp: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    body: UpdateCombatantHpRequest,
  ) =>
    api.put<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/hp`,
      body,
    ),
  // Resource pool mutations (INCOMING #19, mig. 064). All three return the full
  // EncounterResponse + broadcast EncounterUpdated (same applyUpdate path as HP).
  // Authz: DM or the owner of the linked character (same as HP).
  updateCombatantResource: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    resourceKey: string,
    body: UpdateCombatantResourceRequest,
  ) =>
    api.put<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/resources/${encodeURIComponent(resourceKey)}`,
      body,
    ),
  updateCombatantSpellSlot: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    level: number,
    body: UpdateCombatantSpellSlotRequest,
  ) =>
    api.put<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/spell-slots/${level}`,
      body,
    ),
  restCombatant: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    body: RestRequest,
  ) =>
    api.post<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/rest`,
      body,
    ),

  updateCombatant: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    body: UpdateCombatantRequest,
  ) =>
    api.patch<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}`,
      body,
    ),
  // Owner-scoped (DM or the linked character's owner): a dying PC records its own
  // death saves. Field scope is locked to the two counts server-side. See INCOMING #18.
  recordDeathSaves: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    body: RecordDeathSavesRequest,
  ) =>
    api.put<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/death-saves`,
      body,
    ),

  // Purely-visual condition badges on a combatant (DM-only). Both ops are
  // idempotent server-side, log to the combat log, and return the full
  // EncounterResponse (single applyUpdate path; also pushed over SignalR).
  addCombatantStatusEffect: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    body: AddStatusEffectRequest,
  ) =>
    api.post<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/status-effects`,
      body,
    ),
  removeCombatantStatusEffect: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    statusEffectId: string,
  ) =>
    api.del<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/status-effects/${statusEffectId}`,
    ),
  // GUID-free convenience path — grant a situational advantage/disadvantage token (INCOMING #30).
  // Returns the full EncounterResponse (same applyUpdate path as status-effects).
  grantAdvantage: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
    body: GrantAdvantageRequest,
  ) =>
    api.post<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/advantage`,
      body,
    ),
  // Drop every effect this combatant is concentrating on (voluntary / failed save).
  // Same DM-or-owner authz; idempotent; returns the full EncounterResponse.
  breakConcentration: (
    campaignId: string,
    encounterId: string,
    combatantId: string,
  ) =>
    api.post<EncounterResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/combatants/${combatantId}/break-concentration`,
      {},
    ),

  // Combat log (DM-only, Phase 1). Newest-first page; pass the previous page's
  // `nextBefore` as `before` to page backwards. `take` clamps 1–100 server-side.
  getLog: (
    campaignId: string,
    encounterId: string,
    before?: number,
    take?: number,
  ) => {
    const qs = new URLSearchParams();
    if (before != null) qs.set("before", String(before));
    if (take != null) qs.set("take", String(take));
    const suffix = qs.toString() ? `?${qs}` : "";
    return api.get<CombatLogPageResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/log${suffix}`,
    );
  },
  addLogNote: (
    campaignId: string,
    encounterId: string,
    body: AddCombatLogNoteRequest,
  ) =>
    api.post<CombatLogEntryResponse>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/log`,
      body,
    ),
  // Delete one log entry by its seq. Backend route pending — see
  // FRONTEND-REQUEST-delete-log-entry.md (DM-only DELETE .../log/{seq}).
  deleteLogEntry: (campaignId: string, encounterId: string, seq: number) =>
    api.del<void>(
      `/api/campaigns/${campaignId}/encounters/${encounterId}/log/${seq}`,
    ),

  // Session recap export (Feature 3, DM-only).
  // GET /api/campaigns/{campaignId}/sessions/{sessionId}/recap
  sessionRecap: (campaignId: string, sessionId: string) =>
    api.get<SessionRecapResponse>(
      `/api/campaigns/${campaignId}/sessions/${sessionId}/recap`,
    ),
};

// ---- Scope B: Per-campaign character state (INCOMING #31) ----
// All under /api/campaigns/{campaignId}/characters/{characterId}. Auth: DM (campaign
// owner) OR the character's owner — a non-owner non-DM gets 404 (no existence leak).
// inspiration/grant is DM-ONLY. Every call returns the full CampaignCharacterSheetResponse.
export const campaignCharacterState = {
  get: (campaignId: string, characterId: string) =>
    api.get<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/state`,
    ),
  updateHp: (
    campaignId: string,
    characterId: string,
    body: UpdateCampaignCharacterHpRequest,
  ) =>
    api.patch<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/hp`,
      body,
    ),
  updateSpellSlot: (
    campaignId: string,
    characterId: string,
    body: UpdateCampaignSpellSlotRequest,
  ) =>
    api.patch<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/spell-slots`,
      body,
    ),
  addStatusEffect: (
    campaignId: string,
    characterId: string,
    body: AddCampaignStatusEffectRequest,
  ) =>
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/status-effects`,
      body,
    ),
  removeStatusEffect: (
    campaignId: string,
    characterId: string,
    statusEffectId: string,
  ) =>
    api.del<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/status-effects/${statusEffectId}`,
    ),
  longRest: (campaignId: string, characterId: string) =>
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/long-rest`,
      {},
    ),
  shortRest: (campaignId: string, characterId: string) =>
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/short-rest`,
      {},
    ),
  grantInspiration: (campaignId: string, characterId: string) => // DM ONLY
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/inspiration/grant`,
      {},
    ),
  spendInspiration: (campaignId: string, characterId: string) =>
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/inspiration/spend`,
      {},
    ),
  updateResource: (
    campaignId: string,
    characterId: string,
    key: string,
    body: UpdateCampaignResourceRequest,
  ) =>
    api.patch<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/resources/${encodeURIComponent(key)}`,
      body,
    ),
  updateExhaustion: (
    campaignId: string,
    characterId: string,
    body: UpdateCampaignExhaustionRequest,
  ) =>
    api.patch<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/exhaustion`,
      body,
    ),
  spendHitDice: (
    campaignId: string,
    characterId: string,
    body: SpendHitDiceRequest,
  ) =>
    api.post<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/spend-hit-dice`,
      body,
    ),
  updateHitDice: (
    campaignId: string,
    characterId: string,
    dieType: number,
    body: UpdateCampaignHitDiceRequest,
  ) =>
    api.patch<CampaignCharacterSheetResponse>(
      `/api/campaigns/${campaignId}/characters/${characterId}/hit-dice/${dieType}`,
      body,
    ),
};
