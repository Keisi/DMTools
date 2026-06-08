// Keeps CSS `.tip[data-tooltip]` bubbles on-screen near a viewport edge.
//
// The tooltip itself is a pure-CSS `::after` pseudo-element (see theme.css), so
// it can't be measured or auto-flipped in CSS alone — a host near the right edge
// would push its centered bubble off-screen. On hover/focus we measure the HOST
// rect and set a `--tooltip-shift` custom property that nudges the bubble back
// inside the viewport (the arrow stays centered on the host). The bubble's real
// width is unknown (CSS `width: max-content`), so we use the max-width as a
// conservative bound: that can over-nudge a short tooltip, but it always keeps
// the bubble fully visible, which is the goal.
const MARGIN = 8; // px breathing room from the viewport edge

function maxTooltipWidthPx(): number {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue("--tooltip-max-width")
    .trim();
  const px = raw.endsWith("rem")
    ? parseFloat(raw) * 16
    : parseFloat(raw) || 320;
  // Mirrors the CSS `min(--tooltip-max-width, 92vw)` cap.
  return Math.min(px, window.innerWidth * 0.92);
}

function positionTooltip(el: HTMLElement) {
  const rect = el.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const half = maxTooltipWidthPx() / 2;
  let shift = 0;
  const overflowRight = centerX + half - (window.innerWidth - MARGIN);
  const overflowLeft = MARGIN - (centerX - half);
  if (overflowRight > 0) shift = -overflowRight;
  else if (overflowLeft > 0) shift = overflowLeft;
  el.style.setProperty("--tooltip-shift", `${Math.round(shift)}px`);
}

// One delegated listener pair handles every current and future `.tip` element.
export function installTooltipPositioner() {
  const onActivate = (e: Event) => {
    const target = e.target as HTMLElement | null;
    const tip = target?.closest<HTMLElement>(".tip[data-tooltip]");
    if (tip) positionTooltip(tip);
  };
  document.addEventListener("pointerover", onActivate, true);
  document.addEventListener("focusin", onActivate, true);
}
