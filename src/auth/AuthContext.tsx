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
  isAuthenticated: boolean;
  login: (req: AuthRequest) => Promise<void>;
  register: (req: AuthRequest) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());

  const login = useCallback(async (req: AuthRequest) => {
    const res = await authApi.login(req);
    tokenStore.set(res.token);
    setToken(res.token);
  }, []);

  const register = useCallback(async (req: AuthRequest) => {
    const res = await authApi.register(req);
    tokenStore.set(res.token);
    setToken(res.token);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setToken(null);
  }, []);

  // Wire the client's 401 hook to clear auth state on session expiry; once the
  // token is null, RequireAuth redirects any guarded route to /login.
  useEffect(() => {
    setUnauthorizedHandler(() => setToken(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ token, isAuthenticated: !!token, login, register, logout }),
    [token, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
