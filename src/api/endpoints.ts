/* ============================================================================
   Endpoint modules — one function per backend route, grouped by area.
   Routes mirror DMTool's controllers (see FRONTEND-CONTEXT.md for the full map).
   ========================================================================== */
import { api } from "./client";
import type {
  AddCombatantRequest,
  ArmorResponse,
  AuthRequest,
  AuthResponse,
  BackgroundResponse,
  CampaignCharacterResponse,
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
  RaceResponse,
  RegisterCampaignCharacterRequest,
  RetireCharacterRequest,
  SessionResponse,
  SetInitiativeRequest,
  SkillResponse,
  SpellResponse,
  StatResponse,
  TransferDmRequest,
  UpdateCombatantHpRequest,
  UpdateHpRequest,
  UpdateSpellsRequest,
  WeaponResponse,
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
  // ...armorcategories, weaponcategories, editions, statuseffects
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
};
