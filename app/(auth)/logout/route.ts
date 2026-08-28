import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Çıkış. Route Handler olmasının sebebi çerez: `signOut()` oturum
 * çerezlerini SİLER, ve çerez yazmaya yalnızca Route Handler ile Server
 * Action'ın hakkı var — bir Server Component sessizce başarısız olurdu.
 *
 * POST asıl yol (CSRF'e karşı GET ile çıkış yaptırılamaz). GET yalnızca
 * "linke tıkladım" durumunu kırmamak için var ve aynı işi yapar.
 */
async function signOut(request: NextRequest) {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  return NextResponse.redirect(url, { status: 303 });
}

export const POST = signOut;
export const GET = signOut;
