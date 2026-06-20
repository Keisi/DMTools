/* ============================================================================
   HTTP client — a thin fetch wrapper that injects the JWT bearer token and
   centralizes base-URL + error handling. All endpoint modules build on this.
   Base URL comes from VITE_API_BASE (see .env), defaulting to the IIS dev host.
   ========================================================================== */

// Trailing slash is stripped: endpoint paths already start with "/api/...",
// so a base of "https://host/" would produce "https://host//api/..." (a 404
// that surfaces as a misleading CORS error). Normalize defensively.
const BASE: string = (
  (import.meta.env.VITE_API_BASE as string | undefined) ?? ""
).replace(/\/+$/, "");

const TOKEN_KEY = "dmtool.jwt";

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// Default request timeout in milliseconds. Protects against MonsterASP cold-start
// hangs that would otherwise block the UI indefinitely mid-combat.
const DEFAULT_TIMEOUT_MS = 20_000;

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean; // attach bearer token (default true)
  signal?: AbortSignal; // caller-supplied cancellation signal (composed with timeout)
}

// Invoked when an *authenticated* request is rejected with 401 — i.e. the JWT
// expired or was revoked. AuthContext registers a handler that clears auth state,
// so RequireAuth re-renders and bounces guarded routes to /login. Registered once
// at app start; null when no provider is mounted (e.g. tests).
let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true, signal: callerSignal } = opts;

  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = tokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  // Compose a 20-second timeout with any caller-supplied signal.
  // AbortSignal.any() (or AbortSignal.timeout() alone when no caller signal) keeps
  // the cancellation surface clean without leaking AbortController references.
  const timeoutSignal = AbortSignal.timeout(DEFAULT_TIMEOUT_MS);
  const signal =
    callerSignal
      ? AbortSignal.any([callerSignal, timeoutSignal])
      : timeoutSignal;

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch (err) {
    // Surface timeout/abort as a clear, typed error so callers can display it.
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError(0, "Request timed out. The server may be starting up — please try again.");
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Request was cancelled.");
    }
    throw err;
  }

  // Session expired/invalid: drop the dead token and let the app redirect to
  // login. Still throw below so the caller's catch runs. Only for authed calls —
  // a 401 from login (auth:false) is a bad-credentials error, not an expiry.
  if (auth && res.status === 401) {
    tokenStore.clear();
    unauthorizedHandler?.();
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? safeJson(text) : undefined;

  if (!res.ok) {
    const msg =
      (data as { title?: string; message?: string })?.title ??
      (data as { message?: string })?.message ??
      res.statusText;
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const api = {
  get: <T>(path: string, auth = true) => request<T>(path, { auth }),
  post: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "POST", body, auth }),
  put: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "PUT", body, auth }),
  patch: <T>(path: string, body?: unknown, auth = true) =>
    request<T>(path, { method: "PATCH", body, auth }),
  del: <T>(path: string, auth = true) =>
    request<T>(path, { method: "DELETE", auth }),
};

export { BASE as API_BASE };
