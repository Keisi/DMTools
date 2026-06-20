/* ============================================================================
   App-level toast / notification system.
   Usage: call useToast() anywhere inside <ToastProvider>; the hook returns
   { success, error, info } — each accepts a message string and an optional
   duration (ms, defaults to 4000). Toasts queue, auto-dismiss, and are
   accessible via role="status" / aria-live="polite".
   ========================================================================== */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import "./Toast.css";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 4000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, duration = DEFAULT_DURATION) => {
      const id = ++nextId.current;
      setToasts((prev) => [...prev, { id, kind, message }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api: ToastApi = {
    success: (msg, dur) => push("success", msg, dur),
    error: (msg, dur) => push("error", msg, dur),
    info: (msg, dur) => push("info", msg, dur),
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      {/* aria-live="assertive" for errors so screen readers interrupt; polite for
          success/info so they wait for a natural pause. A single region with
          assertive is the simplest approach that covers the error case. */}
      <div
        className="toast-container"
        role="status"
        aria-live="assertive"
        aria-atomic="false"
      >
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast--${t.kind}`} role="alert">
            <span className="toast__icon" aria-hidden="true">
              {t.kind === "success" ? "✓" : t.kind === "error" ? "✕" : "ℹ"}
            </span>
            <span className="toast__message">{t.message}</span>
            <button
              type="button"
              className="toast__close"
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx)
    throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
