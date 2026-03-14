import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const clientSafe = "./scripts/client-safe.sh";
const start = Date.now();
const typecheck = spawnSync(
  clientSafe,
  ["tsc", "-b"],
  {
    stdio: "inherit",
  },
);
if (typecheck.status !== 0) {
  process.exit(typecheck.status ?? 1);
}

const build = spawnSync(clientSafe, ["vite", "build"], {
  stdio: "inherit",
});
const end = Date.now();

mkdirSync(".perf-results", { recursive: true });
writeFileSync(
  ".perf-results/build-time.json",
  JSON.stringify(
    {
      buildMs: end - start,
      capturedAt: new Date().toISOString(),
      command: "./scripts/client-safe.sh tsc -b && ./scripts/client-safe.sh vite build",
    },
    null,
    2,
  ),
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}
