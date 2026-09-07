import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PermanentJobError, TransientJobError } from "@/lib/core/jobs/errors";
import { platformProvidesReach } from "@/lib/core/publishing";
import {
  getBlueskyPostMetrics, getBlueskyProfileStats, refreshBlueskySession, verifyBlueskySession,
  type BlueskySession,
} from "@/lib/core/providers/bluesky";
import { metricsCollectionStatus, type LatestMetricPoint } from "@/lib/core/metrics/tier";
import { dominantEngagementGroup } from "@/lib/core/metrics/basis";
import type { EngagementRateBasis, MetricTier } from "@/lib/core/types";

/**
 * `metrics_collect` işleyicisinin gövdesi — §12 adım 18 FAZ A2. Yapısı
 * `lib/server/publish/publish-item.ts`'in aynısı: ön kontrol → jeton
 * doğrula/yenile → gerçek çağrı → append-only yaz.
 *
 * ⭐ `content_metrics.engagement_rate` PLATFORM-FARKINDA hesaplanır — §4f'in
 * Instagram formülü (`(likes+comments+saves+shares)/reach×100`) Bluesky'de
 * ANLAMSIZ, çünkü Bluesky reach VERMİYOR (bkz. `platformProvidesReach`).
 * Sıfıra bölmek yerine reach yoksa TAKİPÇİ TABANLI bir oran kullanılır:
 * `(likes+comments+shares)/followers×100` — sektörde "erişim verisi yoksa
 * takipçiye göre etkileşim" olarak bilinen, ayrı ama meşru bir formül
 * (bkz. `docs/ADIM_18_RAPOR.md` §A1'in bu kararı gerekçelendirdiği bölüm).
 * Hangi formülün kullanıldığı HER SATIRDA `raw.engagementRateBasis`'e
 * yazılır — bu bilinçli bir SAPMA, plan metninde yoktu; ⚠ kalibre edilmeli.
 */

interface ContentItemForMetrics {
  id: string;
  brand_id: string;
  user_id: string;
  channel_id: string | null;
  platform: string;
  status: string;
  external_post_id: string | null;
  published_at: string | null;
}

interface ChannelForMetrics {
  id: string;
  is_connected: boolean;
  followers: number;
}

interface CredentialForMetrics {
  access_token: string;
  refresh_token: string | null;
  external_account_id: string;
}

interface LatestMetricRow {
  tier: MetricTier;
  collected_at: string;
}

export interface CollectResult {
  status: "collected" | "not_found" | "skipped_final_exists" | "skipped_not_due";
  tier: MetricTier | null;
}

/** Ortak jeton doğrulama/yenileme — hem içerik toplayıcı hem kanal
 *  tazeleyici kullanıyor, `publish-item.ts`'in FAZ B3 deseninin aynısı. */
async function ensureValidSession(
  admin: SupabaseClient,
  channelId: string,
  cred: CredentialForMetrics,
): Promise<BlueskySession> {
  let session: BlueskySession = {
    did: cred.external_account_id, handle: "",
    accessJwt: cred.access_token, refreshJwt: cred.refresh_token ?? "",
  };
  const check = await verifyBlueskySession(session);
  if (check.ok) return session;

  if (!cred.refresh_token) {
    await admin.from("channels").update({ is_connected: false }).eq("id", channelId);
    throw new PermanentJobError("token geçersiz, yenileme bilgisi yok — kanalı yeniden bağla");
  }
  const refreshed = await refreshBlueskySession(session);
  if (!refreshed.ok) {
    await admin.from("channels").update({ is_connected: false }).eq("id", channelId);
    throw new PermanentJobError(`token yenilenemedi, kanalı yeniden bağla: ${refreshed.error}`);
  }
  session = refreshed.session;
  await admin.from("channel_credentials").update({
    access_token: session.accessJwt, refresh_token: session.refreshJwt,
    last_refreshed_at: new Date().toISOString(),
  }).eq("channel_id", channelId);
  return session;
}

/**
 * Bir içeriğin metriğini GERÇEKTEN çeker ve `content_metrics`'e append eder.
 * `contentItemId` başına ÇAĞRILIR — `app/api/cron/metrics/route.ts`'in
 * tarayıcısı `publish`'le AYNI granülerlikte iş açar (bkz. o dosyanın
 * başlığı): tek bir içeriğin hatası worker'ın diğer işlerini etkilemez.
 */
export async function collectContentMetrics(admin: SupabaseClient, contentItemId: string): Promise<CollectResult> {
  const { data: item, error: itemError } = await admin
    .from("content_items")
    .select("id,brand_id,user_id,channel_id,platform,status,external_post_id,published_at")
    .eq("id", contentItemId)
    .maybeSingle<ContentItemForMetrics>();
  if (itemError) throw new TransientJobError(`content_items okunamadı: ${itemError.message}`);
  if (!item) throw new PermanentJobError(`content_item bulunamadı: ${contentItemId}`);
  if (item.status !== "published" || item.platform !== "bluesky" || !item.external_post_id || !item.published_at) {
    // Şu an desteklenen tek platform bluesky (bkz. lib/core/metrics/schedule.ts
    // başlığı) — tarayıcı zaten filtreliyor, bu ikinci bir savunma katmanı.
    throw new PermanentJobError(`bu içerik metrik toplamaya uygun değil: ${item.id}`);
  }
  if (!item.channel_id) throw new PermanentJobError("içeriğe bağlı bir kanal yok");

  const { data: latestRow, error: latestError } = await admin
    .from("content_metrics")
    .select("tier,collected_at")
    .eq("content_item_id", item.id)
    .order("collected_at", { ascending: false })
    .limit(1)
    .maybeSingle<LatestMetricRow>();
  if (latestError) throw new TransientJobError(`content_metrics okunamadı: ${latestError.message}`);

  const latest: LatestMetricPoint | null = latestRow
    ? { tier: latestRow.tier, collectedAt: new Date(latestRow.collected_at) }
    : null;

  const now = new Date();
  const check = metricsCollectionStatus(new Date(item.published_at), now, latest);
  if (!check.due || !check.tier) {
    return { status: latest?.tier === "final" ? "skipped_final_exists" : "skipped_not_due", tier: null };
  }
  const tier = check.tier;

  const { data: channel, error: channelError } = await admin
    .from("channels").select("id,is_connected,followers").eq("id", item.channel_id)
    .maybeSingle<ChannelForMetrics>();
  if (channelError) throw new TransientJobError(`channels okunamadı: ${channelError.message}`);
  if (!channel || !channel.is_connected) throw new PermanentJobError("kanal bağlı değil");

  const { data: cred, error: credError } = await admin
    .from("channel_credentials").select("access_token,refresh_token,external_account_id")
    .eq("channel_id", item.channel_id).maybeSingle<CredentialForMetrics>();
  if (credError) throw new TransientJobError(`channel_credentials okunamadı: ${credError.message}`);
  if (!cred) throw new PermanentJobError("kanal için kimlik bilgisi yok");

  const session = await ensureValidSession(admin, item.channel_id, cred);

  const metricsResult = await getBlueskyPostMetrics(session, [item.external_post_id]);
  if (!metricsResult.ok) throw new TransientJobError(`bluesky metrik çekilemedi: ${metricsResult.error}`);

  const post = metricsResult.posts.find((p) => p.uri === item.external_post_id);

  if (!post) {
    // ⚠ FAZ A3 — silinmiş/erişilemeyen gönderi: İŞ HATASI DEĞİL. `final` ile
    // işaretlenir ki `metricsCollectionStatus` bu içeriği bir daha "due"
    // görmesin — sonsuza kadar her turda yeniden denenmesin.
    const { error: insertError } = await admin.from("content_metrics").insert({
      content_item_id: item.id, brand_id: item.brand_id, user_id: item.user_id,
      tier: "final", reach: 0, impressions: 0, likes: 0, comments: 0, shares: 0,
      saves: 0, video_views: 0, profile_visits: 0, engagement_rate: 0,
      engagement_rate_basis: "unavailable", // ölçülemedi — 0 GERÇEK bir oran değil
      raw: { status: "not_found", uri: item.external_post_id },
    });
    if (insertError && insertError.code !== "23505") {
      throw new TransientJobError(`content_metrics yazılamadı (not_found): ${insertError.message}`);
    }
    if (!insertError) {
      await admin.from("activity").insert({
        brand_id: item.brand_id, user_id: item.user_id, actor: "metrics_collect",
        action: "metrics_collected", target: item.external_post_id,
        content_item_id: item.id, meta: { status: "not_found" },
      });
    }
    return { status: "not_found", tier: "final" };
  }

  const rawEngagement = post.likeCount + post.replyCount + post.repostCount;
  let engagementRate = 0;
  let engagementRateBasis: EngagementRateBasis = "unavailable";
  if (!platformProvidesReach("bluesky") && channel.followers > 0) {
    engagementRate = Number(((rawEngagement / channel.followers) * 100).toFixed(2));
    engagementRateBasis = "followers";
  }

  const { error: insertError } = await admin.from("content_metrics").insert({
    content_item_id: item.id, brand_id: item.brand_id, user_id: item.user_id,
    tier, reach: 0, impressions: 0,
    likes: post.likeCount, comments: post.replyCount, shares: post.repostCount,
    saves: 0, video_views: 0, profile_visits: 0,
    engagement_rate: engagementRate,
    engagement_rate_basis: engagementRateBasis, // birinci sınıf kolon — sıralama/geri besleme RAW'a bakmaz
    raw: { ...post, engagementRateBasis },
  });
  if (insertError) {
    if (insertError.code === "23505") {
      // ⭐ content_metrics_final_idx UNIQUE — ikinci bir 'final' yazma
      // denemesi burada gerçekten reddedildi (adım 18 FAZ A doğrulama kanıtı).
      return { status: "skipped_final_exists", tier: null };
    }
    throw new TransientJobError(`content_metrics yazılamadı: ${insertError.message}`);
  }

  await admin.from("activity").insert({
    brand_id: item.brand_id, user_id: item.user_id, actor: "metrics_collect",
    action: "metrics_collected", target: item.external_post_id,
    content_item_id: item.id,
    meta: { tier, likes: post.likeCount, comments: post.replyCount, shares: post.repostCount },
  });

  return { status: "collected", tier };
}

interface ChannelForRefresh {
  id: string;
  brand_id: string;
  user_id: string;
  followers: number;
  is_connected: boolean;
}

interface ContentIdRow {
  id: string;
}

/**
 * §4f "Kanal düzeyi" — `channels.followers/growth/engagement` bugüne kadar
 * hiçbir kodun güncellemediği alanlar. Kanal başına, `metrics_collect`
 * işlerinden BAĞIMSIZ olarak `/api/cron/metrics` tarafından doğrudan
 * çağrılır (bir kuyruk işi DEĞİL — `getProfile` tek, ucuz bir çağrı,
 * `sm-reaper`'ın iki sweep'i tek rotada topladığı desenin aynısı).
 *
 * ⚠ SAPMA — `growth` kolonunun yorumu şemada "% / 30 gün" diyor; burada
 * hesaplanan şey SON SENKRONDAN BU YANA değişim yüzdesi (30 günlük bir
 * geçmiş tablosu yok, icat edilmedi). `sm-metrics` saatte bir çalıştığı
 * için bu "son ~1 saatteki değişim" anlamına gelir — 30 günlük bir trend
 * DEĞİL. Rapora açık madde olarak yazıldı.
 */
export async function refreshBlueskyChannelStats(admin: SupabaseClient, channelId: string): Promise<void> {
  const { data: channel, error: channelError } = await admin
    .from("channels").select("id,brand_id,user_id,followers,is_connected").eq("id", channelId)
    .maybeSingle<ChannelForRefresh>();
  if (channelError || !channel || !channel.is_connected) return;

  const { data: cred } = await admin
    .from("channel_credentials").select("access_token,refresh_token,external_account_id")
    .eq("channel_id", channelId).maybeSingle<CredentialForMetrics>();
  if (!cred) return;

  let session: BlueskySession;
  try {
    session = await ensureValidSession(admin, channelId, cred);
  } catch {
    return; // token sorunu — content-level iş zaten aynı kanalı işaretleyecek
  }

  const profile = await getBlueskyProfileStats(session);
  if (!profile.ok) return;

  const oldFollowers = channel.followers;
  const newFollowers = profile.stats.followersCount;
  const growth = oldFollowers > 0 ? Number((((newFollowers - oldFollowers) / oldFollowers) * 100).toFixed(2)) : 0;

  // Kanalın en son içerik-başına ölçümlerinin ortalaması (h6 hariç, D1 ruhu).
  //
  // ⭐ adım 18 Düzeltme 1 — bu ortalama yalnızca AYNI tabana sahip satırlar
  // arasında alınır (`dominantEngagementGroup`). `unavailable` satırlar hiç
  // katılmaz — onların `0`'ı GERÇEK bir değer değil. Bugün tek platform
  // (bluesky, hep `followers` ya da `unavailable`) olduğu için bu fonksiyon
  // pratikte tek grubu ortalıyor; Instagram (adım 17b) `reach` tabanını
  // gerçek veriyle devreye soktuğunda bu satır İKİ tabanı KARIŞTIRMAYACAK.
  const { data: contentIds } = await admin
    .from("content_items").select("id").eq("channel_id", channelId)
    .returns<ContentIdRow[]>();
  let engagement = 0;
  if (contentIds && contentIds.length > 0) {
    const ids = contentIds.map((c) => c.id);
    const { data: rows } = await admin
      .from("content_metrics")
      .select("content_item_id,engagement_rate,engagement_rate_basis,collected_at,tier")
      .in("content_item_id", ids)
      .neq("tier", "h6")
      .order("collected_at", { ascending: false })
      .returns<
        { content_item_id: string; engagement_rate: number; engagement_rate_basis: EngagementRateBasis; collected_at: string; tier: MetricTier }[]
      >();
    if (rows && rows.length > 0) {
      const latestPerItem = new Map<string, { engagement_rate: number; engagement_rate_basis: EngagementRateBasis }>();
      for (const row of rows) {
        if (!latestPerItem.has(row.content_item_id)) {
          latestPerItem.set(row.content_item_id, {
            engagement_rate: Number(row.engagement_rate),
            engagement_rate_basis: row.engagement_rate_basis,
          });
        }
      }
      const dominant = dominantEngagementGroup([...latestPerItem.values()]);
      if (dominant) {
        engagement = Number(
          (dominant.rows.reduce((a, b) => a + b.engagement_rate, 0) / dominant.rows.length).toFixed(2),
        );
      }
    }
  }

  await admin.from("channels").update({
    followers: newFollowers, growth, engagement, last_synced_at: new Date().toISOString(),
  }).eq("id", channelId);
}
