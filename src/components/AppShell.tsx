/* App shell: top nav + routed content outlet. */
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ToastProvider } from "../context/ToastContext";
import "./AppShell.css";

const NAV = [
  { to: "/vault", label: "Vault" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/compendium", label: "Compendium" },
];

export default function AppShell() {
  const { isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <ToastProvider>
    <div className="shell">
      <header className="shell__nav">
        <div className="shell__nav-inner container">
          <NavLink to="/vault" className="shell__brand">
            <span className="shell__brand-mark">d20</span>
            <span className="shell__brand-text">DMTool</span>
          </NavLink>

          <nav className="shell__links">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                className={({ isActive }) =>
                  "shell__link" + (isActive ? " shell__link--active" : "")
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="shell__actions">
            {isAuthenticated ? (
              <button
                className="btn btn--ghost"
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
              >
                Sign out
              </button>
            ) : (
              <NavLink to="/login" className="btn btn--primary">
                Sign in
              </NavLink>
            )}
          </div>
        </div>
      </header>

      <main className="shell__main">
        <Outlet />
      </main>
    </div>
    </ToastProvider>
  );
}
