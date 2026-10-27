import { NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/login", req.url), 303);
}
