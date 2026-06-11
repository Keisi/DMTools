// PreToolUse tripwire: block edits that recompute a backend-derived value
// client-side. Targets the D&D ability-modifier formula floor((score-10)/2),
// whose tail "- 10) / 2" essentially never appears legitimately in this
// frontend (the backend computes the modifier; the client renders a.modifier).
// CLAUDE.md rule: "render what the API returns, never recompute these client-side."
// Reads the PreToolUse JSON payload on stdin; exit 2 blocks and feeds stderr back.

let data = "";
process.stdin.on("data", (c) => (data += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(data);
  } catch {
    process.exit(0); // not our payload — never block on parse failure
  }
  // Stringify the whole tool_input so we cover Write(content), Edit(new_string),
  // and MultiEdit(edits[].new_string) in one pass.
  const blob = JSON.stringify(input.tool_input ?? {});
  // Tight: "-10)/2", "- 10 ) / 2", etc. The closing paren anchors it to the
  // parenthesized modifier form, avoiding incidental "- 10 / 2" matches.
  if (/-\s*10\s*\)\s*\/\s*2/.test(blob)) {
    process.stderr.write(
      "CLAUDE.md rule: never recompute backend-derived values client-side " +
        "(ability modifier). Render a.modifier as-is; if it is undefined the " +
        "backend deploy is stale - rebuild it. See memory " +
        "feedback-never-recompute-derived.\n",
    );
    process.exit(2);
  }
  process.exit(0);
});
