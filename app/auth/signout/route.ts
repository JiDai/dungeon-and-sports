import { NextResponse } from "next/server";
import { appUrl, isSameOrigin } from "@/lib/http";
import { supabaseServer } from "@/lib/supabase";

export async function POST(req: Request) {
  if (!isSameOrigin(req)) return new Response(null, { status: 403 });
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(appUrl(req, "/login"), 303);
}
