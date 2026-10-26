// Dedicated servers for automated tests. Each has its own port and build folder, so they can run beside
// `npm run dev` without clashing.
//   node scripts/dev-test.mjs        port 3100, dev server, AI processing OFF (message counts stay deterministic)
//   node scripts/dev-test.mjs ai     port 3200, dev server, AI in MOCK mode with a short delay (no Gemini quota)
//   node scripts/dev-test.mjs prod   port 3300, production build + start, AI OFF (runs with the real CSP)
import { spawn, spawnSync } from "node:child_process";

const mode = process.argv[2] ?? "dev";
const next = ["node_modules/next/dist/bin/next"];
const base = { ...process.env };

let child;
if (mode === "prod") {
  const env = { ...base, NEXT_DIST_DIR: ".next-prod", AI_MODE: "off", APP_BASE_URL: "http://localhost:3300" };
  const build = spawnSync(process.execPath, [...next, "build"], { stdio: "inherit", env });
  if (build.status !== 0) process.exit(build.status ?? 1);
  child = spawn(process.execPath, [...next, "start", "-p", "3300"], { stdio: "inherit", env });
} else {
  const ai = mode === "ai";
  child = spawn(process.execPath, [...next, "dev", "-p", ai ? "3200" : "3100"], {
    stdio: "inherit",
    env: {
      ...base,
      NEXT_DIST_DIR: ai ? ".next-test-ai" : ".next-test",
      AI_MODE: ai ? "mock" : "off",
      // Invitation links must point back at this server, not at the developer's own `npm run dev`.
      APP_BASE_URL: `http://localhost:${ai ? 3200 : 3100}`,
      ...(ai ? { AI_MOCK_DELAY_MS: "1500" } : {}),
    },
  });
}
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
