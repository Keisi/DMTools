import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import "./Login.css";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Where to land after auth: the route the user was bounced from (set by
  // RequireAuth on session expiry), else the vault.
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname ?? "/vault";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const fn = mode === "login" ? login : register;
      await fn({ username, password });
      navigate(from, { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else {
        setError(
          err instanceof ApiError ? err.message : "Could not reach the server.",
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login">
      <form className="login__card panel anim-pop-in" onSubmit={submit}>
        <div className="login__crest">d20</div>
        <h1 className="login__title">DMTool</h1>
        <p className="login__sub text-muted">
          {mode === "login" ? "Enter the keep" : "Forge a new keeper"}
        </p>

        <div className="stack" style={{ marginTop: "var(--sp-5)" }}>
          <input
            className="input"
            placeholder="Username"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
          <input
            className="input"
            type="password"
            placeholder="Password"
            autoComplete={
              mode === "login" ? "current-password" : "new-password"
            }
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && <div className="login__error">{error}</div>}

          <button className="btn btn--primary" disabled={busy} type="submit">
            {busy ? "..." : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </div>

        <button
          type="button"
          className="login__switch"
          onClick={() => setMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login"
            ? "Need an account? Register"
            : "Have an account? Sign in"}
        </button>
      </form>
    </div>
  );
}
