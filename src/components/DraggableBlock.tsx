// A drag-reorderable wrapper for a sheet block. Pairs with `useBlockOrder`.
// Keeps the original `sheet__draggable*` class names (Phase 0 of
// COMBAT-UX-PLAN): all route CSS bundles into one global stylesheet, so the
// `sheet__draggable` / `sheet__drag-handle` / `sheet__draggable--over` rules in
// CharacterSheet.css apply everywhere this component is used — the CSS does NOT
// move with it. Known limitation: HTML5 drag-and-drop doesn't fire on touch.
import { useState, type ReactNode } from "react";

export default function DraggableBlock({
  idx,
  onDragStart,
  onDrop,
  children,
}: {
  idx: number;
  onDragStart: (idx: number) => void;
  onDrop: (toIdx: number) => void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={"sheet__draggable" + (over ? " sheet__draggable--over" : "")}
      draggable
      onDragStart={(e) => {
        onDragStart(idx);
        e.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setOver(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onDrop(idx);
      }}
      onDragEnd={() => setOver(false)}
    >
      <span className="sheet__drag-handle" aria-hidden="true">⠿</span>
      {children}
    </div>
  );
}
