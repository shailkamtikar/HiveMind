import "server-only";
import { cache } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Verified current user for this request (one Auth call per request, shared across components). */
export const getUser = cache(async () => {
  // Session verification depends on the current time, so it must run at request time, not during prerender.
  await connection();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
