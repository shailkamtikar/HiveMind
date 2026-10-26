import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Minimal authenticated endpoint; also used by tests to prove API routes reject signed-out callers.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ id: user.id });
}
