import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/routes";

/**
 * E-posta onay bağlantısının indiği yer. Supabase `?code=` ile döner;
 * `exchangeCodeForSession` onu oturum çerezine çevirir.
 *
 * `(auth)` grubunun DIŞINDA, `app/auth/` altında: grup parantezi URL'e
 * girmez, ama `emailRedirectTo` Supabase panelinde de kayıtlı olacağı için
 * yolun fiziksel dizinle birebir okunması tercih edildi.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");

  // Açık yönlendirme kapısı — tek kaynak, testi lib/routes.test.ts'te.
  const next = safeNextPath(searchParams.get("next"));

  if (!code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // Hata metnini URL'e yazmıyoruz — iç durum sızdırır. /login zaten
    // kullanıcıya ne yapacağını söylüyor.
    return NextResponse.redirect(`${origin}/login`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
