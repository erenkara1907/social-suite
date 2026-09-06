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
 * (adım 20.5 FAZ C1) — başlangıç state sabitleri burada, `ChannelsView`
 * bunları `useActionState`'e ilk değer olarak geçiyor.
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

export const CONNECT_CHANNEL_INITIAL_STATE: ConnectChannelActionState = {
  status: "idle",
  platform: null,
  errorCode: null,
};

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

export const DISCONNECT_CHANNEL_INITIAL_STATE: DisconnectChannelActionState = {
  status: "idle",
  channelId: null,
};

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
