# OBY Tool Reference

## Pre-Edit (MANDATORY)
- `oby brief FILE --body` — issues + callers + function bodies with line numbers (eliminates Read)
- `oby brief FILE --body-fn NAME` — single function body extraction (targeted edit mode)
- `oby brief FILE --snippets` — issues + callers + code context in one call
- `oby brief FILE --lines 50-80` — read specific line range (saves tokens)
- `oby agent patch-context FILE --around SYMBOL` — edit-ready spans without shell reads
- `oby graph patch-context FILE --symbol SYMBOL` — graph-oriented alias for exact patch spans
- `oby graph callers FUNCTION` — blast radius before modifying

## Semantic Intelligence (OPTIONAL — local embedding on Apple Silicon)

Semantic ops require a local embedding model. Everything runs on your machine —
no code, no vectors, and no metadata leave your computer. Models download from
HuggingFace once on install, after which there is zero outbound traffic.

**Before using any `--semantic` flag or `cb.oby.semantic*` REPL op, gate it:**

```bash
oby graph embed status    # returns {"ok": true/false, "backend": "mlx", ...}
```

- `ok: true` → semantic ops available, proceed.
- `ok: false` → model not installed, hardware unsupported, or venv broken.
  Fall back to text + graph search: `oby search "query" . --deep`.

**To install (one-time, Apple Silicon + ~2 GB download):**

```bash
oby graph embed install              # install MLX venv + default model
oby graph embed build                # embed this project's functions
```

Run `codebridge doctor --setup` for an interactive walkthrough that lets you
pick a model (privacy-aligned options available — no region lock-in).

**Semantic ops (only when `embed status` returns `ok: true`):**
- `oby graph embed build` — build/rebuild embedding cache (set OBY_EMBED_WORKERS=4-6 for parallel)
- `oby graph embed status` — embedding system status (model, cache, backend, MRL config)
- `oby search "query" . --semantic` — concept-level search via embeddings (not text matching)
- `oby graph similar FN --semantic` — find semantically similar functions
- `oby graph similar --semantic --all` — cluster scan: find all duplicate-intent functions
- `oby brief FILE --related` — show semantically related functions in other files
- `oby predict "change description"` — includes semantic_related functions beyond call graph
- `oby health .` — reports embedding status + flags >92% semantic duplicates
- `oby refactor consolidate-similar` — generate refactoring plans from semantic clusters
- REPL: `{"op":"cb.oby.search","input":{"query":"login","semantic":true}}` / `{"op":"cb.oby.semantic","input":{"query":"query"}}`
- REPL: `{"op":"cb.oby.agent.patchContext","input":{"file":"path","around":"symbol"}}` for edit-ready spans
- REPL: `{"op":"cb.oby.refactor.consolidate","input":{"minScore":85}}`

## New Development (Scaffolding)
- `oby plan --name FEATURE --touches KEYWORDS` — context + conventions + checklist
- `oby generate from-template --template NAME --name ENTITY` — scaffold from template
- `oby generate route --schema FILE` — route from Zod schema
- `oby generate crud --table FILE:name` — full CRUD from Drizzle table (column-aware, Zod schemas)
- `oby generate test --route FILE` — contract test from route
- `oby generate templates` — list available templates

## Cross-Project Migration
Composable pipeline: compare -> schema-compare -> migrate-plan -> scaffold-from -> build-validate

- `oby migrate compare SOURCE TARGET` — full diff: shared, divergent, missing schemas
- `oby migrate schema-extract .` — unified registry of all Zod/Drizzle/interface/class schemas
- `oby migrate schema-compare SOURCE TARGET --kind drizzle_table` — field-level gap analysis
- `oby migrate scaffold-from SRC --to DST --framework react --dry-run` — import rewriting + file conversion
- `oby migrate migrate-plan --source SCHEMA --target SCHEMA --format sql` — Drizzle diff to SQL
- `oby migrate routes SOURCE TARGET` — API route mapping (missing in target)
- `oby migrate build-validate --plan FILE` — dependency ordering validation (accepts stdin: `--plan -`)

Hints: Every migrate command outputs a `hints` array in JSON with suggested next commands.

## Post-Edit (MANDATORY)
- `oby verify` — build + codescan + completeness + duplicate detection
- `oby complete --files FILE1,FILE2` — what's missing from new files?
- `oby graph duplicates --cross-module` — check before writing new functions
- `codescan verify -f FILE -r RULE` — confirm a fix (exit 0 = fixed)

## Quality
- `oby health .` — score 0-100, grade A-F
- `oby conventions .` — naming, error handling, patterns
- `codescan scan -p . --no-history` — static analysis (38 analyzers)
- `oby feedback add -c improvement -m MODULE -d "description"` — log improvements

## Security & Dependencies
- `codescan deps -p . --audit` — parse lockfiles + check OSV.dev for CVEs (cached 24h)
- `codescan deps -p . --audit --severity critical` — critical vulns only
- `codescan scan -p . --analyzers security-injection,taint,validation-pipeline` — input sanitization scan
- `codescan scan -p . --analyzers security-auth,security-secrets` — auth + secrets scan
