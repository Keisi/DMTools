/* ============================================================================
   Endpoint modules — one function per backend route, grouped by area.
   Routes mirror DMTool's controllers (see FRONTEND-CONTEXT.md for the full map).
   ========================================================================== */
import { api } from "./client";
import type {
  ArmorResponse,
  AuthRequest,
  AuthResponse,
  BackgroundResponse,
  CharacterRequest,
  CharacterResponse,
  ClassResponse,
  FeatResponse,
  FightingStyleResponse,
  InventoryAddRequest,
  InventoryAttunementRequest,
  InventoryConsumeRequest,
  ItemResponse,
  LanguageResponse,
  LevelUpApplyRequest,
  LevelUpPlanRequest,
  LevelUpPlanResponse,
  MetamagicResponse,
  RaceResponse,
  SkillResponse,
  SpellResponse,
  StatResponse,
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
  // PUT returns 204 No Content (not the updated character), so re-fetch to resolve
  // with the fresh CharacterResponse. Callers (builder edit-save, sheet multiclass)
  // rely on the returned character; without the GET they'd receive undefined.
  update: async (id: string, body: CharacterRequest): Promise<CharacterResponse> => {
    await api.put<void>(`/api/character/${id}`, body);
    return api.get<CharacterResponse>(`/api/character/${id}`);
  },
  remove: (id: string) => api.del<void>(`/api/character/${id}`),

  levelUpPlan: (id: string, req: LevelUpPlanRequest) =>
    api.post<LevelUpPlanResponse>(`/api/character/${id}/levelup/plan`, req),
  levelUpApply: (id: string, req: LevelUpApplyRequest) =>
    api.post<CharacterResponse>(`/api/character/${id}/levelup/apply`, req),

  inventoryAdd: (id: string, body: InventoryAddRequest) =>
    api.post<CharacterResponse>(`/api/character/${id}/inventory/add`, body),
  inventoryConsume: (id: string, body: InventoryConsumeRequest) =>
    api.post<CharacterResponse>(`/api/character/${id}/inventory/consume`, body),
  setAttunement: (id: string, itemId: string, body: InventoryAttunementRequest) =>
    api.put<CharacterResponse>(
      `/api/character/${id}/inventory/${itemId}/attunement`,
      body,
    ),
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
  // ...armorcategories, weaponcategories, editions, statuseffects
};

export const health = () =>
  api.get<{ status: string }>("/api/health", false);
