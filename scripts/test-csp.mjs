// Builds the app, starts it in production mode and runs the Content-Security-Policy browser test against it.
//   npm run test:csp
import { spawnSync } from "node:child_process";

const run = spawnSync("npx", ["playwright", "test", "--project=chromium-prod"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env, TEST_PROD: "1" },
});
process.exit(run.status ?? 1);
