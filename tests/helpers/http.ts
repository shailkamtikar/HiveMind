import { admin, type TestUser } from "./users";

export const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3100";

/** Builds a Cookie header from Set-Cookie headers (honours cleared cookies). */
export function cookieHeader(setCookies: string[]) {
  const jar = new Map<string, string>();
  for (const sc of setCookies) {
    const [pair] = sc.split(";");
    const idx = pair.indexOf("=");
    const name = pair.slice(0, idx);
    const value = pair.slice(idx + 1);
    if (value === "" || /max-age=0/i.test(sc)) jar.delete(name);
    else jar.set(name, value);
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** Signs a test user in through the real callback route and returns their session cookie. */
export async function sessionCookie(user: TestUser): Promise<string> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: user.email });
  if (error || !data.properties) throw new Error(`generateLink failed: ${error?.message}`);
  const res = await fetch(`${BASE}/auth/callback?token_hash=${data.properties.hashed_token}&type=magiclink`, {
    redirect: "manual",
  });
  const cookie = cookieHeader(res.headers.getSetCookie());
  if (!cookie) throw new Error("sign-in produced no session cookie");
  return cookie;
}

export function api(cookie?: string) {
  const headers = (extra: Record<string, string> = {}) => ({ ...(cookie ? { cookie } : {}), ...extra });
  return {
    get: (path: string) => fetch(`${BASE}${path}`, { headers: headers(), redirect: "manual" }),
    delete: (path: string) => fetch(`${BASE}${path}`, { method: "DELETE", headers: headers(), redirect: "manual" }),
    post: (path: string, body: unknown) =>
      fetch(`${BASE}${path}`, {
        method: "POST",
        headers: headers({ "content-type": "application/json" }),
        body: typeof body === "string" ? body : JSON.stringify(body),
        redirect: "manual",
      }),
  };
}
