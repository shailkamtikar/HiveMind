/**
 * Returns `next` only if it is a same-site relative path; otherwise the fallback.
 * Blocks absolute URLs, protocol-relative URLs (//host), backslash tricks and control characters.
 */
export function safeNext(next: string | null | undefined, fallback = "/groups"): string {
  if (typeof next !== "string" || next.length === 0 || next.length > 2048) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(next)) return fallback;
  return next;
}
