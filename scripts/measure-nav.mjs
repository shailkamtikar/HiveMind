// Times page loads of the signed-in pages against a running server (default: production build on :3300).
import { createClient } from "@supabase/supabase-js";
const BASE = process.env.BASE ?? "http://localhost:3300";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const email = `hm-test-perf-${Date.now()}@example.com`;
const { data: u } = await admin.auth.admin.createUser({ email, email_confirm: true });
await admin.auth.admin.updateUserById(u.user.id, { password: "perf-check-pw-91" });
const { data: link } = await admin.auth.admin.generateLink({ type: "magiclink", email });
const cb = await fetch(`${BASE}/auth/callback?token_hash=${link.properties.hashed_token}&type=magiclink`, { redirect: "manual" });
const cookie = cb.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const token = (await anon.auth.signInWithPassword({ email, password: "perf-check-pw-91" })).data.session.access_token;
console.log("JWT alg:", JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString()).alg);
// A realistic conversation: 30 messages, a few jobs.
const { data: grp } = await admin.from("groups").insert({ name: "Perf test", owner_id: u.user.id }).select("id").single();
await admin.from("group_members").insert({ group_id: grp.id, user_id: u.user.id, role: "owner" });
await admin.from("messages").insert(Array.from({ length: 30 }, (_, i) => ({ group_id: grp.id, sender_id: u.user.id, type: "user", content: `message ${i + 1}` })));
const time = async (path) => { const t = performance.now(); const r = await fetch(BASE + path, { headers: { cookie }, redirect: "manual" }); await r.text(); return [Math.round(performance.now() - t), r.status]; };
const median = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)];
for (const path of ["/groups", `/groups/${grp.id}`, "/"]) {
  await time(path);
  const runs = []; let status;
  for (let i = 0; i < 7; i++) { const [ms, s] = await time(path); runs.push(ms); status = s; }
  console.log(path.replace(grp.id, "<id>").padEnd(12), "status", status, "median", median([...runs]), "ms  min", Math.min(...runs), "max", Math.max(...runs));
}
await admin.auth.admin.deleteUser(u.user.id);
