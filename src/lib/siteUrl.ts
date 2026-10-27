const isLocal = (url: string) => /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);

/**
 * The public address links in emails and invitations should point to: `APP_BASE_URL` when set, otherwise the address
 * the request came in on. In production a leftover localhost value is ignored, so a forgotten setting can never put
 * "localhost" into a link that is sent to someone else.
 */
export function siteUrl(requestOrigin: string): string {
  const configured = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  const forgotten = process.env.NODE_ENV === "production" && !!configured && isLocal(configured) && !isLocal(requestOrigin);
  return configured && !forgotten ? configured : requestOrigin.replace(/\/+$/, "");
}
