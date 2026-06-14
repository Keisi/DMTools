// DMTool API end-to-end harness entry point.
//
//   node tests/api-e2e/run.mjs
//
// Env:
//   BASE     API base URL (default http://localhost:3501)
//   SUITES   comma list of suites to run (default "A,B,C")
//   ONLY     comma list of class names to restrict Suite A/B (default all)
//   QUIET    "1" to suppress per-check logging (summary only)
//
// Registers a throwaway account per run, executes the selected suites against a
// live backend, prints a PASS/FAIL/FINDING matrix, writes last-run.json, deletes
// every character/campaign it created, and exits non-zero on any FAIL.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { makeClient, preflight } from "./lib/setup.mjs";
import { Reporter } from "./lib/report.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const SUITE_MODULES = {
  A: ["./suites/suite-a-levelup.mjs", "runSuiteA"],
  B: ["./suites/suite-b-creation.mjs", "runSuiteB"],
  C: ["./suites/suite-c-encounter.mjs", "runSuiteC"],
};

async function main() {
  const base = process.env.BASE || "http://localhost:3501";
  const suites = (process.env.SUITES || "A,B,C").split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
  const only = process.env.ONLY ? new Set(process.env.ONLY.split(",").map((s) => s.trim())) : null;
  const quiet = process.env.QUIET === "1";

  const t = new Reporter({ quiet });
  const stamp = Date.now();

  // Health gate.
  const health = await new (await import("./lib/client.mjs")).ApiClient(base).get("/api/health");
  if (health.status !== 200) {
    console.error(`Backend health check failed (${health.status}) at ${base}. Is the backend running?`);
    process.exit(2);
  }

  // DM / primary client.
  const dm = await makeClient(`e2e_dm_${stamp}`, "Passw0rd!23", base);
  console.log(`Authenticated as ${dm.username} (userId=${dm.userId}) against ${base}`);

  const ctx = await preflight(dm);
  ctx.base = base;
  ctx.stamp = stamp;
  ctx.only = only;
  ctx.created = []; // { path, client } cleanup queue
  ctx.track = (path, client) => ctx.created.push({ path, client: client || dm });
  ctx.makeClient = (suffix) => makeClient(`e2e_${suffix}_${stamp}`, "Passw0rd!23", base);

  console.log(`Catalog: ${ctx.classes.length} classes, ${ctx.spells.length} spells, ${ctx.feats.length} feats, baseline race = ${ctx.baselineRace.name}`);

  for (const key of suites) {
    const entry = SUITE_MODULES[key];
    if (!entry) {
      console.warn(`Unknown suite '${key}', skipping`);
      continue;
    }
    try {
      const mod = await import(entry[0]);
      await mod[entry[1]](dm, ctx, t);
    } catch (err) {
      t.setSuite(`${key} (crashed)`);
      t.fail(`suite ${key} threw`, err?.stack || String(err));
    }
  }

  // Cleanup (reverse order: campaigns/characters created last go first).
  let cleaned = 0;
  for (const item of ctx.created.reverse()) {
    try {
      const r = await item.client.del(item.path);
      if (r.status < 400 || r.status === 404) cleaned++;
    } catch {
      /* best-effort */
    }
  }
  console.log(`\nCleanup: removed ${cleaned}/${ctx.created.length} created entities.`);

  const total = t.summary();
  const out = join(HERE, "last-run.json");
  writeFileSync(out, JSON.stringify({ base, stamp, total, results: t.results }, null, 2));
  console.log(`\nWrote ${out}`);
  process.exit(total.FAIL > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Harness crashed:", err);
  process.exit(3);
});
