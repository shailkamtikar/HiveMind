import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against dedicated servers (see scripts/dev-test.mjs):
//  - port 3100: AI processing off, for everything that is not about the AI
//  - port 3200: AI in mock mode, for tests/e2e/ai.spec.ts
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { trace: "retain-on-failure" },
  projects: [
    {
      name: "chromium",
      testIgnore: /ai\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3100" },
    },
    {
      name: "chromium-ai",
      testMatch: /ai\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], baseURL: process.env.TEST_AI_URL ?? "http://localhost:3200" },
    },
  ],
  webServer: [
    { command: "npm run dev:test", url: "http://localhost:3100/api/health", reuseExistingServer: true, timeout: 120_000 },
    { command: "npm run dev:test-ai", url: "http://localhost:3200/api/health", reuseExistingServer: true, timeout: 120_000 },
  ],
});
