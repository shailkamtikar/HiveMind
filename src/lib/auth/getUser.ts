import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { currentUser } from "./session";

/** Verified current user for this request (checked locally, once per request, shared across components). */
export const getUser = cache(async () => {
  // Session verification depends on the current time, so it must run at request time, not during prerender.
  await connection();
  return currentUser(await createClient());
});
