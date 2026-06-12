// Character-sheet block ordering contract, shared by the sheet renderer
// (CharacterSheetView) and the route wrapper (CharacterSheet, which owns the
// drag-order persistence via useBlockOrder). Lives in its own module so the
// component file can keep `export default` clean for fast-refresh.
export const BLOCK_KEYS = [
  "saves", "skills", "inventory", "equipped", "attacks",
  "resources", "spellcasting", "features", "subfeatures",
  "traits", "encumbrance", "status",
] as const;
export type BlockKey = (typeof BLOCK_KEYS)[number];

// Drag wiring the route owns and hands down; absent in read-only mode (no drag).
export interface SheetDragHandlers {
  order: BlockKey[];
  onDragStart: (idx: number) => void;
  onDrop: (toIdx: number) => void;
}
