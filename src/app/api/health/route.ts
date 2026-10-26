import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();
    // Any request that reaches Supabase and returns without a transport/auth-key error proves connectivity.
    const { error } = await supabase.auth.getSession();
    const { error: dbError } = await supabase.from("_health_probe").select("*").limit(1);
    // A missing table (PGRST205 / 42P01) still means the API and key work.
    const reachable = !error && (!dbError || dbError.code === "PGRST205" || dbError.code === "42P01");
    if (!reachable) throw new Error("unreachable");
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Service unavailable" }, { status: 500 });
  }
}
