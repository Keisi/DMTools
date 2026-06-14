// Collects PASS / FAIL / FINDING results across suites and prints a matrix.
// FINDING = behavior worth a FRONTEND-REQUEST, not a failure (see the plan §0).

export class Reporter {
  constructor(opts = {}) {
    this.results = [];
    this.suite = "(none)";
    this.section = "(root)";
    this.quiet = !!opts.quiet;
  }

  _log(m) {
    if (!this.quiet) console.log(m);
  }

  setSuite(s) {
    this.suite = s;
    this.section = "(root)";
    this._log(`\n########## SUITE ${s} ##########`);
  }

  startSection(name) {
    this.section = name;
    this._log(`\n=== ${name} ===`);
  }

  _push(kind, name, detail) {
    this.results.push({ suite: this.suite, section: this.section, kind, name, detail: detail ?? null });
  }

  pass(name, detail) {
    this._push("PASS", name, detail);
    this._log(`  PASS  ${name}`);
  }

  fail(name, detail) {
    this._push("FAIL", name, detail);
    this._log(`  FAIL  ${name}${detail ? `\n        ${detail}` : ""}`);
  }

  finding(name, detail) {
    this._push("FINDING", name, detail);
    this._log(`  NOTE  ${name}${detail ? ` — ${detail}` : ""}`);
  }

  // Assert truthy; records pass/fail.
  check(name, cond, detail) {
    if (cond) this.pass(name);
    else this.fail(name, detail);
    return !!cond;
  }

  // Deep-equal by JSON.
  eq(name, actual, expected) {
    const ok = JSON.stringify(actual) === JSON.stringify(expected);
    if (ok) this.pass(name);
    else this.fail(name, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    return ok;
  }

  // Assert an HTTP result's status. `res` is { status, body }.
  status(name, res, expected) {
    const ok = res.status === expected;
    if (ok) this.pass(name);
    else this.fail(name, `expected HTTP ${expected}, got ${res.status} ${JSON.stringify(res.body)?.slice(0, 240)}`);
    return ok;
  }

  // Assert status is in a set (e.g. [400, 422] for validation failures).
  statusOneOf(name, res, expectedList) {
    const ok = expectedList.includes(res.status);
    if (ok) this.pass(name);
    else this.fail(name, `expected HTTP ${expectedList.join("/")}, got ${res.status} ${JSON.stringify(res.body)?.slice(0, 240)}`);
    return ok;
  }

  counts() {
    const c = {};
    for (const r of this.results) {
      c[r.suite] = c[r.suite] || { PASS: 0, FAIL: 0, FINDING: 0 };
      c[r.suite][r.kind]++;
    }
    return c;
  }

  summary() {
    const c = this.counts();
    const total = { PASS: 0, FAIL: 0, FINDING: 0 };
    const wasQuiet = this.quiet;
    this.quiet = false; // the summary always prints, even in QUIET mode
    this._log(`\n======================= SUMMARY =======================`);
    for (const [suite, v] of Object.entries(c)) {
      total.PASS += v.PASS;
      total.FAIL += v.FAIL;
      total.FINDING += v.FINDING;
      this._log(`  ${suite.padEnd(28)} PASS ${String(v.PASS).padStart(4)}  FAIL ${String(v.FAIL).padStart(4)}  FINDING ${String(v.FINDING).padStart(3)}`);
    }
    this._log(`  ${"TOTAL".padEnd(28)} PASS ${String(total.PASS).padStart(4)}  FAIL ${String(total.FAIL).padStart(4)}  FINDING ${String(total.FINDING).padStart(3)}`);
    if (total.FAIL > 0) {
      this._log(`\n  --- FAILURES ---`);
      for (const r of this.results.filter((x) => x.kind === "FAIL")) {
        this._log(`  [${r.suite}/${r.section}] ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
      }
    }
    if (total.FINDING > 0) {
      this._log(`\n  --- FINDINGS ---`);
      for (const r of this.results.filter((x) => x.kind === "FINDING")) {
        this._log(`  [${r.suite}/${r.section}] ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
      }
    }
    this.quiet = wasQuiet;
    return total;
  }
}
