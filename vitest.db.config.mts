import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests that talk to the Supabase dev project. Run with `npm run test:db`.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
});
