// Dedicated servers for automated tests. Each has its own port and build folder, so they can run beside
// `npm run dev` without clashing.
//   node scripts/dev-test.mjs      port 3100, AI processing OFF (message counts stay deterministic)
//   node scripts/dev-test.mjs ai   port 3200, AI in MOCK mode with a short delay (no Gemini quota used)
import { spawn } from "node:child_process";

const ai = process.argv[2] === "ai";
const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", ai ? "3200" : "3100"], {
  stdio: "inherit",
  env: {
    ...process.env,
    NEXT_DIST_DIR: ai ? ".next-test-ai" : ".next-test",
    AI_MODE: ai ? "mock" : "off",
    ...(ai ? { AI_MOCK_DELAY_MS: "1500" } : {}),
  },
});
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
