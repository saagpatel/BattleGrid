#!/usr/bin/env bash
set -euo pipefail

COMMANDS_FILE="${1:-.codex/verify.commands}"
RESULTS_FILE="${VERIFY_RESULTS_FILE:-.codex/verify.last.json}"

if [[ ! -f "$COMMANDS_FILE" ]]; then
  echo "Missing $COMMANDS_FILE"
  exit 2
fi

tmp_results="$(mktemp)"
overall_status=0
index=0

while IFS= read -r cmd || [[ -n "$cmd" ]]; do
  [[ -z "${cmd//[[:space:]]/}" ]] && continue
  [[ "$cmd" =~ ^[[:space:]]*# ]] && continue

  echo ">> $cmd"
  start_ms=$(( $(date +%s) * 1000 ))
  set +e
  bash -lc "$cmd"
  exit_code=$?
  set -e
  end_ms=$(( $(date +%s) * 1000 ))
  duration_ms=$(( end_ms - start_ms ))

  if [[ "$exit_code" -eq 0 ]]; then
    echo "   [pass] (${duration_ms}ms)"
  else
    echo "   [fail] exit=${exit_code} (${duration_ms}ms)"
    overall_status=1
  fi

  cmd_b64="$(printf '%s' "$cmd" | base64 | tr -d '\n')"
  printf '%s\t%s\t%s\t%s\n' "$index" "$exit_code" "$duration_ms" "$cmd_b64" >>"$tmp_results"
  index=$(( index + 1 ))
done < "$COMMANDS_FILE"

node - "$tmp_results" "$RESULTS_FILE" "$overall_status" "$COMMANDS_FILE" <<'NODE'
const fs = require("fs");

const [tmpPath, outPath, overall, commandsFile] = process.argv.slice(2);
const lines = fs.readFileSync(tmpPath, "utf8").trim().split("\n").filter(Boolean);
const checks = lines.map((line) => {
  const [index, exitCode, durationMs, cmdB64] = line.split("\t");
  return {
    index: Number(index),
    command: Buffer.from(cmdB64, "base64").toString("utf8"),
    exitCode: Number(exitCode),
    durationMs: Number(durationMs),
    status: Number(exitCode) === 0 ? "pass" : "fail",
  };
});

const report = {
  generatedAt: new Date().toISOString(),
  commandsFile,
  status: Number(overall) === 0 ? "pass" : "fail",
  checks,
};

fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
NODE

rm -f "$tmp_results"
echo "Verification report: $RESULTS_FILE"
exit "$overall_status"
