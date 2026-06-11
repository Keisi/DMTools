/* Shared modal primitive: portals to <body>, dismisses on Escape and on
   backdrop (outside) click, and exposes the WAI-ARIA dialog role. Centralizes
   the dialog shell so each caller supplies only its panel class + content.

   Backdrop dismiss uses a currentTarget check rather than an inner
   stopPropagation handler, so clicks inside the panel never bubble to close —
   and there is no click handler on a non-interactive inner element. */
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function Modal({
  onClose,
  ariaLabel,
  className,
  backdropClassName,
  children,
}: {
  onClose: () => void;
  ariaLabel: string;
  className: string;
  backdropClassName: string;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className={backdropClassName}
      role="presentation"
      onClick={(e) => {
        // Dismiss only when the backdrop itself is clicked, not the panel.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={className} role="dialog" aria-modal="true" aria-label={ariaLabel}>
        {children}
      </div>
    </div>,
    document.body,
  );
}
