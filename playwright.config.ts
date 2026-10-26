import { defineConfig, devices } from "@playwright/test";

// End-to-end tests run against the dedicated test server (port 3100, AI replies off); see scripts/dev-test.mjs.
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:3100",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev:test",
    url: "http://localhost:3100/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
