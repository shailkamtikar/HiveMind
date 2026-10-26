// Dedicated server for automated tests: own port and build folder (so it can run beside `npm run dev`),
// with AI replies off so message counts in tests are deterministic and no Gemini quota is used.
import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-p", "3100"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_DIST_DIR: ".next-test", AI_REPLIES: "off" },
});
child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
