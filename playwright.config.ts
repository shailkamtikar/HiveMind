import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against dedicated servers (see scripts/dev-test.mjs):
//  - port 3100: dev server, AI processing off, for everything that is not about the AI
//  - port 3200: dev server, AI in mock mode, for tests/e2e/ai.spec.ts
//  - port 3300: production build with the real Content-Security-Policy, for tests/e2e/csp.spec.ts.
//    Opt-in (it needs a build): `npm run test:csp`, which sets TEST_PROD=1.
const prod = !!process.env.TEST_PROD;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: prod
    ? [{ name: "chromium-prod", testMatch: /csp\.spec\.ts/, use: { ...devices["Desktop Chrome"], baseURL: "http://localhost:3300" } }]
    : [
        {
          name: "chromium",
          testIgnore: /(ai|csp)\.spec\.ts/,
          use: { ...devices["Desktop Chrome"], baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3100" },
        },
        {
          name: "chromium-ai",
          testMatch: /ai\.spec\.ts/,
          use: { ...devices["Desktop Chrome"], baseURL: process.env.TEST_AI_URL ?? "http://localhost:3200" },
        },
      ],
  webServer: prod
    ? [{ command: "node scripts/dev-test.mjs prod", url: "http://localhost:3300/api/health", reuseExistingServer: true, timeout: 300_000 }]
    : [
        { command: "npm run dev:test", url: "http://localhost:3100/api/health", reuseExistingServer: true, timeout: 120_000 },
        { command: "npm run dev:test-ai", url: "http://localhost:3200/api/health", reuseExistingServer: true, timeout: 120_000 },
      ],
});
