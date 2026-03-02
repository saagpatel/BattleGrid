import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const start = Date.now();
const typecheck = spawnSync(
  "pnpm",
  ["--prefix", "client", "exec", "tsc", "-b"],
  {
    stdio: "inherit",
  },
);
if (typecheck.status !== 0) {
  process.exit(typecheck.status ?? 1);
}

const build = spawnSync("pnpm", ["--prefix", "client", "exec", "vite", "build"], {
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
      command: "pnpm --prefix client exec tsc -b && pnpm --prefix client exec vite build",
    },
    null,
    2,
  ),
);

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}
