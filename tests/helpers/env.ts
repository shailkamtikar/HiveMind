import { readFileSync } from "node:fs";
import path from "node:path";

// Minimal .env.local loader for integration tests (values never printed).
export function loadTestEnv() {
  const file = path.resolve(process.cwd(), ".env.local");
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {
    throw new Error(".env.local not found; integration tests need Supabase credentials");
  }
  for (const line of text.split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var ${name}`);
  return v;
}
