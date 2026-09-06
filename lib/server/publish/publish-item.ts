import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PermanentJobError, TransientJobError } from "@/lib/core/jobs/errors";
import { canPublish, checkTextLimit, composePostText, PLATFORM_PUBLISH_LIMITS } from "@/lib/core/publishing";
import type { Platform } from "@/lib/core/types";
import {
  contentItemIdToRkey, publishBlueskyPost, refreshBlueskySession, verifyBlueskySession,
  type BlueskyImage, type BlueskySession,
} from "@/lib/core/providers/bluesky";
import { guardedFetch } from "@/lib/server/fetch-guard";
import { sanitizeErrorMessage } from "@/lib/server/jobs/sanitize";

/**
 * Bir içerik satırını GERÇEKTEN yayınlar — §4a durum makinesi, §12 adım 17a
 * FAZ B2/B3. İKİ çağıranı var, İKİSİ DE bu tek gövdeyi paylaşır (DRY):
 *   1. `lib/server/jobs/handlers.ts`'in `handlePublish`'i — cron/kuyruk
 *      yolu (`sm-publish` → `enqueueInternal` → `sm-worker` → burası).
 *   2. `lib/adapters/live/publisher.ts`'in `publish()`'i — `PublisherPort`
 *      üzerinden doğrudan çağrı (bugün hiçbir UI yolu yok, ama arayüz
 *      "platform detayı taşımaz" sözleşmesini tutmak için gerçek olmalı).
 *
 * Bu ayrım BİLEREK `JobContext`'e bağımlı DEĞİL — yalnızca `contentItemId`
 * + çağıranı tanımlayan bir `lockedBy` etiketi (job id ya da "direct-
 * publish" gibi sabit bir dize) alır. `brand_id`/`user_id` `content_items`
 * satırının KENDİSİNDEN okunur, ayrıca parametre olarak geçmez.
 */

interface ContentItemForPublish {
  id: string;
  brand_id: string;
  user_id: string;
  channel_id: string | null;
  platform: string;
  body: string;
  hashtags: string;
  scheduled_at: string | null;
  primary_media_id: string | null;
  attempt_count: number;
}

interface ChannelForPublish {
  id: string;
  is_connected: boolean;
  platform: string;
}

interface CredentialForPublish {
  access_token: string;
  refresh_token: string | null;
  external_account_id: string;
}

interface MediaAssetForPublish {
  public_url: string;
  mime_type: string;
}

const PUBLISH_IMAGE_PREFIX = "image/";

export interface PublishItemResult {
  externalPostId: string;
  publishedAt: string;
  permalink: string | null;
}

/**
 * Bir yayın denemesini kapatır — `content_items`'ı `scheduled` (geçici hata,
 * yeniden deneme GÜVENLİ) veya `failed`e (kalıcı hata) çevirir, sonra
 * ORİJİNAL hatayı yeniden fırlatır. `scheduled`'a dönmenin neden güvenli
 * olduğu: `publishBlueskyPost` deterministik `rkey` + `putRecord` kullanıyor
 * (idempotent) — bkz. o fonksiyonun başlığı ve `docs/ADIM_17a_RAPOR.md`
 * FAZ B2.
 */
async function closePublishAttempt(admin: SupabaseClient, itemId: string, error: unknown): Promise<never> {
  const isPermanent = error instanceof PermanentJobError;
  const message = sanitizeErrorMessage(error);
  await admin
    .from("content_items")
    .update({
      status: isPermanent ? "failed" : "scheduled",
      failure_error: message,
      last_attempt_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
    })
    .eq("id", itemId);
  if (error instanceof PermanentJobError || error instanceof TransientJobError) throw error;
  throw new TransientJobError(message);
}

/**
 * ── Kilit (FAZ B2) ─────────────────────────────────────────────────────
 * Koşullu `UPDATE ... WHERE status='scheduled'` — iki çağıran aynı içeriği
 * aynı anda çekerse yalnızca BİRİ 1 satır etkiler, kaybeden `null` görür
 * ve SESSİZCE çıkar (bu bir hata değil, korumanın BEKLENEN sonucu).
 *
 * ── Ön kontrol (FAZ B3, adım 20.5 deseni) ─────────────────────────────
 * Kilit alındıktan SONRA, yayından ÖNCE: platform desteği, kanal bağlı mı,
 * token geçerli/yenilenebilir mi, metin sınırı, medya boyutu. Herhangi biri
 * başarısız olursa `PermanentJobError` — bunlar bir sonraki denemede
 * KENDİLİĞİNDEN düzelmez (kullanıcının kanalı yeniden bağlaması/metni
 * kısaltması gerekir).
 *
 * @returns `null` — kilit alınamadı (zaten publishing/published/başkası
 *          kazandı); bu HATA DEĞİL, çağıran sessizce devam etmeli.
 */
export async function publishContentItem(
  admin: SupabaseClient,
  contentItemId: string,
  lockedBy: string,
): Promise<PublishItemResult | null> {
  const { data: item, error: lockError } = await admin
    .from("content_items")
    .update({ status: "publishing", locked_at: new Date().toISOString(), locked_by: lockedBy })
    .eq("id", contentItemId)
    .eq("status", "scheduled")
    .select("id,brand_id,user_id,channel_id,platform,body,hashtags,scheduled_at,primary_media_id,attempt_count")
    .maybeSingle<ContentItemForPublish>();
  if (lockError) throw new TransientJobError(`content_items kilidi alınamadı: ${lockError.message}`);
  if (!item) return null; // çifte-yayın koruması — başka biri zaten aldı/bitirdi.

  try {
    if (!canPublish(item.platform as Platform) || item.platform !== "bluesky") {
      // 17a kapsamı yalnızca bluesky — adım 16/17b Instagram'ı ikinci
      // adaptör olarak ekleyecek (bkz. PublisherPort'un FAZ B1 yorumu).
      throw new PermanentJobError(`bu platform için yayın adaptörü henüz yok: ${item.platform}`);
    }
    if (!item.channel_id) throw new PermanentJobError("içeriğe bağlı bir kanal yok");

    const { data: channel, error: channelError } = await admin
      .from("channels").select("id,is_connected,platform").eq("id", item.channel_id)
      .maybeSingle<ChannelForPublish>();
    if (channelError) throw new TransientJobError(`channels okunamadı: ${channelError.message}`);
    if (!channel || !channel.is_connected) throw new PermanentJobError("kanal bağlı değil");

    const { data: cred, error: credError } = await admin
      .from("channel_credentials").select("access_token,refresh_token,external_account_id")
      .eq("channel_id", item.channel_id).maybeSingle<CredentialForPublish>();
    if (credError) throw new TransientJobError(`channel_credentials okunamadı: ${credError.message}`);
    if (!cred) throw new PermanentJobError("kanal için kimlik bilgisi yok");

    let session: BlueskySession = {
      did: cred.external_account_id, handle: "",
      accessJwt: cred.access_token, refreshJwt: cred.refresh_token ?? "",
    };
    const check = await verifyBlueskySession(session);
    if (!check.ok) {
      if (!cred.refresh_token) {
        await admin.from("channels").update({ is_connected: false }).eq("id", item.channel_id);
        throw new PermanentJobError("token geçersiz, yenileme bilgisi yok — kanalı yeniden bağla");
      }
      const refreshed = await refreshBlueskySession(session);
      if (!refreshed.ok) {
        await admin.from("channels").update({ is_connected: false }).eq("id", item.channel_id);
        throw new PermanentJobError(`token yenilenemedi, kanalı yeniden bağla: ${refreshed.error}`);
      }
      session = refreshed.session;
      await admin.from("channel_credentials").update({
        access_token: session.accessJwt, refresh_token: session.refreshJwt,
        last_refreshed_at: new Date().toISOString(),
      }).eq("channel_id", item.channel_id);
    }

    const text = composePostText(item);
    const limitCheck = checkTextLimit(item.platform as Platform, text);
    if (!limitCheck.ok) {
      throw new PermanentJobError(
        `metin sınırı aşıldı: ${limitCheck.graphemes}/${limitCheck.limits?.maxGraphemes} grapheme, ` +
          `${limitCheck.bytes}/${limitCheck.limits?.maxBytes} bayt`,
      );
    }

    const images: BlueskyImage[] = [];
    if (item.primary_media_id) {
      const { data: asset, error: assetError } = await admin
        .from("media_assets").select("public_url,mime_type").eq("id", item.primary_media_id)
        .maybeSingle<MediaAssetForPublish>();
      if (assetError) throw new TransientJobError(`media_assets okunamadı: ${assetError.message}`);
      if (!asset) throw new PermanentJobError("birincil medya kaydı bulunamadı");
      if (!asset.mime_type.startsWith(PUBLISH_IMAGE_PREFIX)) {
        throw new PermanentJobError(`desteklenmeyen medya tipi: ${asset.mime_type} (bugün yalnızca görsel)`);
      }
      const limits = PLATFORM_PUBLISH_LIMITS.bluesky!;
      let guarded;
      try {
        guarded = await guardedFetch(asset.public_url, {
          maxBytes: limits.maxImageBytes,
          expectedContentTypePrefixes: [PUBLISH_IMAGE_PREFIX],
        });
      } catch (err) {
        throw new TransientJobError(`medya indirilemedi: ${err instanceof Error ? err.message : String(err)}`);
      }
      const bytes = new Uint8Array(await new Response(guarded.stream).arrayBuffer());
      if (bytes.byteLength > limits.maxImageBytes) {
        throw new PermanentJobError(`medya ${limits.maxImageBytes} bayt sınırını aşıyor (${bytes.byteLength} bayt)`);
      }
      images.push({ bytes, mimeType: guarded.contentType || asset.mime_type, alt: "" });
    }

    // ── Yayın — idempotent: rkey = content_item.id'den türetilen TID,
    // createdAt = scheduled_at (ikisi de her denemede AYNI, bkz.
    // publishBlueskyPost başlığı ve contentItemIdToRkey'in canlı bulgusu).
    const rkey = contentItemIdToRkey(item.id);
    const publishResult = await publishBlueskyPost({
      session,
      rkey,
      text,
      createdAt: item.scheduled_at ?? new Date().toISOString(),
      images: images.length ? images : undefined,
    });
    if (!publishResult.ok) throw new TransientJobError(`bluesky yayını başarısız: ${publishResult.error}`);

    const permalink = `https://bsky.app/profile/${session.did}/post/${rkey}`;
    const publishedAt = new Date().toISOString();

    const { error: publishedError } = await admin
      .from("content_items")
      .update({
        status: "published",
        published_at: publishedAt,
        external_post_id: publishResult.receipt.uri,
        failure_error: null,
        last_attempt_at: publishedAt,
        attempt_count: item.attempt_count + 1,
        locked_at: null,
        locked_by: null,
      })
      .eq("id", item.id);
    if (publishedError) {
      // ⚠ Yayın Bluesky'de BAŞARILI oldu, yalnızca DB yazımı başarısız —
      // bu artık GÜVENLE yeniden denenebilir (aynı rkey ile putRecord
      // üzerine yazar, çifte gönderi oluşturmaz).
      throw new TransientJobError(`yayın başarılıydı ama content_items güncellenemedi: ${publishedError.message}`);
    }

    await admin.from("activity").insert({
      brand_id: item.brand_id,
      user_id: item.user_id,
      actor: "publish",
      action: "published",
      target: permalink,
      content_item_id: item.id,
      meta: { platform: item.platform, externalPostId: publishResult.receipt.uri, permalink },
    });

    return { externalPostId: publishResult.receipt.uri, publishedAt, permalink };
  } catch (error) {
    return closePublishAttempt(admin, item.id, error);
  }
}
