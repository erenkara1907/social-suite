import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { port } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";
import { OAUTH_STATE_COOKIE } from "@/lib/core/providers/instagram/config";

/**
 * `/api/instagram/connect` — BIRLESIM_PLANI §12 adım 16 FAZ B1.
 *
 * ← siraya/app/api/instagram/connect/route.ts. UYARLAMA: `getUser()` +
 * `isInstagramConfigured` + `authorizeUrl(state)` doğrudan çağrısı yerine
 * `ChannelPort.startConnect("instagram")` kullanılıyor (D2: kimlik bilgisi
 * marka bazlı çözümleniyor, `lib/adapters/live/channel.ts` zaten bu işi
 * yapıyor — burada TEKRAR YAZILMIYOR).
 *
 * ⭐ CANLI BULGU (kök neden) — bu rota BİLEREK bir Server Action DEĞİL, düz
 * bir Route Handler. `startInstagramConnectAction` (server action,
 * `next/navigation`'ın `redirect()`'i) gerçek bir HTTP 3xx üretmiyordu —
 * Next'in Server Action protokolü üzerinden istemci tarafında yorumlanan bir
 * yönlendirme. Kaynağın (siraya) kendi yorumu tam bunu işaret ediyor:
 * "A full page load, not a fetch: this hands the browser to Instagram."
 * `channels-view.tsx`'teki düğme bu yüzden düz bir `<a href="/api/instagram/
 * connect">` — TAM SAYFA YÜKLEMESİ, `fetch`/Server Action DEĞİL.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const overrides = await requestModeOverrides();
  const channelPort = port("channel", overrides);
  const result = await channelPort.startConnect("instagram");

  if (!result.ok) {
    const url = new URL("/channels", request.nextUrl.origin);
    url.searchParams.set("ig_error", result.error.detail ?? result.error.code);
    return NextResponse.redirect(url);
  }

  const store = await cookies();
  store.set(OAUTH_STATE_COOKIE, result.data.state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.redirect(result.data.authorizeUrl);
}
