// Looks for secrets anywhere in git history (all branches), without ever printing a secret.
//   node scripts/scan-secrets.mjs
// 1) every real value in .env.local is searched for verbatim
// 2) well-known key shapes are searched with regular expressions
// Exit code 1 if anything is found. If something is found: rotate that secret first, then clean history.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const history = execFileSync("git", ["log", "--all", "-p", "--no-color"], { maxBuffer: 1024 * 1024 * 512 }).toString("utf8");
const findings = [];

// 1) exact values from the local env file (skip short, empty or obviously public values)
let env = "";
try {
  env = readFileSync(".env.local", "utf8");
} catch {}
for (const line of env.split(/\r?\n/)) {
  const m = /^([A-Z0-9_]+)=(.+)$/.exec(line.trim());
  if (!m) continue;
  const [, name, value] = m;
  // Only variables that look like credentials; settings such as GEMINI_MODEL are not secrets.
  if (!/KEY|SECRET|PASSWORD|TOKEN/.test(name) || name === "NEXT_PUBLIC_SUPABASE_ANON_KEY") continue;
  if (value.length < 12 || /^https?:\/\//.test(value)) continue;
  if (history.includes(value)) findings.push(`${name}: its exact value appears in git history`);
}

// 2) shapes of well-known credentials
const shapes = {
  "Google API key": /AIza[0-9A-Za-z_-]{35}/,
  "Supabase secret key": /sb_secret_[A-Za-z0-9_-]{20,}/,
  "Supabase access token": /sbp_[a-f0-9]{40}/,
  "JWT-like token": /eyJ[A-Za-z0-9_-]{15,}\.eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/,
  "Private key block": /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  "Database URL with password": /postgres(?:ql)?:\/\/[^\s:@]+:[^\s:@]{4,}@/,
};
for (const [label, re] of Object.entries(shapes)) {
  if (re.test(history)) findings.push(`${label}: a value of this shape appears in git history`);
}

if (findings.length) {
  console.error("Possible secrets in history:\n - " + findings.join("\n - "));
  process.exit(1);
}
console.log(`No secrets found in ${history.length.toLocaleString()} characters of history across all branches.`);
