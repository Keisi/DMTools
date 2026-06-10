/* ============================================================================
   Auth context — holds the JWT in localStorage, exposes login/register/logout.
   Wrap the app in <AuthProvider>; read with useAuth().
   ========================================================================== */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { setUnauthorizedHandler, tokenStore } from "../api/client";
import { auth as authApi } from "../api/endpoints";
import type { AuthRequest } from "../api/types";

interface AuthState {
  token: string | null;
  userId: string | null;
  username: string | null;
  isAuthenticated: boolean;
  login: (req: AuthRequest) => Promise<void>;
  register: (req: AuthRequest) => Promise<void>;
  logout: () => void;
}

const USERNAME_KEY = "dmtool.username";

function decodeJwtSub(token: string): string | null {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(b64)) as Record<string, unknown>;
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const [username, setUsername] = useState<string | null>(
    () => localStorage.getItem(USERNAME_KEY),
  );

  const login = useCallback(async (req: AuthRequest) => {
    const res = await authApi.login(req);
    tokenStore.set(res.token);
    localStorage.setItem(USERNAME_KEY, res.username);
    setToken(res.token);
    setUsername(res.username);
  }, []);

  const register = useCallback(async (req: AuthRequest) => {
    const res = await authApi.register(req);
    tokenStore.set(res.token);
    localStorage.setItem(USERNAME_KEY, res.username);
    setToken(res.token);
    setUsername(res.username);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    localStorage.removeItem(USERNAME_KEY);
    setToken(null);
    setUsername(null);
  }, []);

  // Wire the client's 401 hook to clear auth state on session expiry; once the
  // token is null, RequireAuth redirects any guarded route to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => setToken(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const userId = token ? decodeJwtSub(token) : null;

  const value = useMemo<AuthState>(
    () => ({ token, userId, username, isAuthenticated: !!token, login, register, logout }),
    [token, userId, username, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
