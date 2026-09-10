"use server";

import { revalidatePath } from "next/cache";
import { port } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";
import type { ApiErrorCode } from "@/lib/core/ai/types";
import type { Platform } from "@/lib/core/types";

/**
 * `/channels`'ın "Bağla"/"Bağlantıyı kes" düğmeleri — §12 adım 17a FAZ A.
 *
 * ⚠ "use server" dosyaları yalnızca ASYNC FONKSİYON export edebilir
 * (adım 20.5 FAZ C1) — başlangıç state sabitleri BURADA DEĞİL,
 * `channels-view.tsx`'te (`library-view.tsx`'in `DELETE_INITIAL_STATE`
 * deseni). İlk yazımda bu sabitler buraya konmuştu, Next.js build'i
 * "A 'use server' file can only export async functions, found object"
 * hatasıyla reddetti — canlı olarak yakalanan gerçek bir hata (17a FAZ A2).
 *
 * Token bu dosyadan HİÇBİR ZAMAN geçmez — form yalnızca identifier/
 * appPassword'ü `ChannelPort.connectWithCredentials`'a iletir, dönen
 * `ChannelRow`'da token alanı yok.
 */
export interface ConnectChannelActionState {
  status: "idle" | "connected" | "error";
  platform: Platform | null;
  errorCode: ApiErrorCode | null;
}

export async function connectChannelAction(
  _prev: ConnectChannelActionState,
  formData: FormData,
): Promise<ConnectChannelActionState> {
  const platform = String(formData.get("platform") ?? "") as Platform;
  const identifier = String(formData.get("identifier") ?? "");
  const appPassword = String(formData.get("appPassword") ?? "");

  const overrides = await requestModeOverrides();
  const channelPort = port("channel", overrides);
  const result = await channelPort.connectWithCredentials(platform, { identifier, appPassword });
  if (!result.ok) return { status: "error", platform, errorCode: result.error.code };

  revalidatePath("/channels");
  return { status: "connected", platform, errorCode: null };
}

export interface DisconnectChannelActionState {
  status: "idle" | "disconnected" | "error";
  channelId: string | null;
}

export async function disconnectChannelAction(
  _prev: DisconnectChannelActionState,
  formData: FormData,
): Promise<DisconnectChannelActionState> {
  const channelId = String(formData.get("channelId") ?? "").trim();
  if (!channelId) return { status: "error", channelId: null };

  const overrides = await requestModeOverrides();
  const channelPort = port("channel", overrides);
  const result = await channelPort.disconnect(channelId);
  if (!result.ok) return { status: "error", channelId };

  revalidatePath("/channels");
  return { status: "disconnected", channelId };
}

/**
 * ⚠ Instagram'ın yönlendirmeli bağlanma başlangıcı BİLEREK BURADA DEĞİL —
 * bir server action OLARAK YAŞAMIYOR. Kanıtlanmış kök neden (§12 adım 16
 * FAZ B1, canlı teşhis): server action'ın `redirect()`'i (`next/navigation`)
 * GERÇEK bir HTTP 3xx üretmiyor, Next'in Server Action protokolü üzerinden
 * İSTEMCİ TARAFINDA yorumlanan bir yönlendirme — bu, Meta'nın "redirect_uri
 * is not identical" hatasına (yanıltıcı metin) yol açan zincirin parçasıydı.
 * Düz bir Route Handler'a taşındı: `app/api/instagram/connect/route.ts`
 * (`NextResponse.redirect()`, GERÇEK bir HTTP 3xx) — kaynağın (siraya)
 * kanıtlanmış deseni. `channels-view.tsx`'teki düğme artık bir `<a
 * href="/api/instagram/connect">` (tam sayfa navigasyonu), bu dosyayı hiç
 * çağırmıyor.
 */
