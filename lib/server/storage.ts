import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiResult } from "@/lib/core/ai/types";
import type { MediaAssetRow, MediaKind, MediaSourceVendor } from "@/lib/core/types";
import { FetchGuardError, guardedFetch } from "@/lib/server/fetch-guard";

/**
 * §4g — Sahne → Sıraya medya köprüsü. BIRLESIM_PLANI §12 adım 19 FAZ C.
 *
 * Vendor'ın GEÇİCİ URL'ini (`media_jobs.output_url`) kalıcı Supabase
 * Storage'a taşır ve `media_assets` satırını yazar. İndirme YALNIZCA
 * `lib/server/fetch-guard.ts` üzerinden — SSRF savunmasının tek giriş
 * noktası budur (FAZ A).
 *
 * ⚠ Bu adımda `media_poll`/`ugc_pipeline` kuyruk işleyicilerine BAĞLANMADI
 * — o §12 adım 20'nin işi (`lib/server/jobs/handlers.ts`'in yorumu: "kalan
 * altısı hâlâ NOT_IMPLEMENTED, adım 15/16/17/18/20"). Bu dosya köprünün
 * KENDİSİ; kim çağıracağı ayrı bir karar.
 *
 * Kullanılan istemci ÇAĞIRANIN sorumluluğu — `lib/server/README.md`'nin
 * "üç yer" kuralı: kuyruk işleyicisi service-role verir (cron), etkileşimli
 * bir ekran (`/studio`) oturum istemcisi verir (RLS'ten geçer). Bu dosya
 * ikisini de KABUL EDER, hiçbirini kendi seçmez.
 */

const BUCKET = "media";

/** §4g: "izinli görsel 25MB, video 100MB". Ses için görevde açık bir sınır
 *  yok — ElevenLabs TTS çıktıları birkaç MB'lık kısa klipler (KESIF_SAHNE),
 *  görselle aynı üst sınır makul bir varsayılan (⚠ DOĞRULANMALI, gerçek
 *  UGC ses adımı devreye girince — adım 20 — kalibre edilebilir). */
const MAX_BYTES_BY_KIND: Record<MediaKind, number> = {
  image: 25 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 25 * 1024 * 1024,
};

const CONTENT_TYPE_PREFIX_BY_KIND: Record<MediaKind, string> = {
  image: "image/",
  video: "video/",
  audio: "audio/",
};

/** Content-Type → uzantı. Bilinmeyen bir tip `bin` alır — indirme yine de
 *  içerik tipi doğrulamasından geçmiş olmalı (fetch-guard), bu yalnızca
 *  dosya adı seçimi. */
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/webm": "weba",
};

function extensionFor(contentType: string, sourceUrl: string): string {
  const bare = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (EXTENSION_BY_CONTENT_TYPE[bare]) return EXTENSION_BY_CONTENT_TYPE[bare];
  const fromUrl = new URL(sourceUrl).pathname.split(".").pop();
  if (fromUrl && /^[a-z0-9]{2,5}$/i.test(fromUrl)) return fromUrl.toLowerCase();
  return "bin";
}

/** `source`'u tüketirken bayt sayar — DB satırına gerçek boyut yazılabilsin
 *  diye (`fetch-guard`'ın kendi sayacı yalnızca SINIRI uygular, dışarı bir
 *  toplam sızdırmaz — iki kaygı kasıtlı ayrı: biri güvenlik, biri kayıt). */
function countingStream(source: ReadableStream<Uint8Array>, box: { bytes: number }): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      box.bytes += value.byteLength;
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

export interface PersistVendorAssetInput {
  brandId: string;
  userId: string;
  sourceUrl: string;
  kind: MediaKind;
  vendor: MediaSourceVendor | null;
  /** Verilirse §4g adım 3f/4: iş satırı da güncellenir — idempotency bu
   *  alan üzerinden kurulur (aşağıya bkz.). */
  mediaJobId?: string;
}

interface MediaAssetDbRow {
  id: string;
  brand_id: string;
  kind: MediaKind;
  storage_path: string;
  public_url: string;
  mime_type: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  source_vendor: MediaSourceVendor | null;
  created_at: string;
}

function toMediaAssetRow(row: MediaAssetDbRow): MediaAssetRow {
  return { ...row };
}

async function findExistingByJob(
  supabase: SupabaseClient,
  mediaJobId: string,
): Promise<MediaAssetRow | null> {
  const { data: job, error: jobError } = await supabase
    .from("media_jobs")
    .select("result_asset_id")
    .eq("id", mediaJobId)
    .maybeSingle<{ result_asset_id: string | null }>();
  if (jobError) throw new Error(`media_jobs okunamadı: ${jobError.message}`);
  if (!job?.result_asset_id) return null;

  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .select("id,brand_id,kind,storage_path,public_url,mime_type,bytes,width,height,duration_ms,source_vendor,created_at")
    .eq("id", job.result_asset_id)
    .maybeSingle<MediaAssetDbRow>();
  if (assetError) throw new Error(`media_assets okunamadı: ${assetError.message}`);
  return asset ? toMediaAssetRow(asset) : null;
}

/** İş id'si yoksa (ör. etkileşimli çağrı) ikinci hat: aynı marka + aynı
 *  vendor URL'i daha önce köprülenmiş mi? Yarış penceresi kabul edilebilir
 *  (bir UNIQUE kısıtı yok — düşük olasılıklı, en kötü sonucu iki kopya
 *  dosya, ne bir güvenlik ne bir doğruluk sorunu); asıl idempotency hattı
 *  `mediaJobId` üzerinden (aşağıdaki koşullu UPDATE). */
async function findExistingByUrl(
  supabase: SupabaseClient,
  brandId: string,
  sourceUrl: string,
): Promise<MediaAssetRow | null> {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id,brand_id,kind,storage_path,public_url,mime_type,bytes,width,height,duration_ms,source_vendor,created_at")
    .eq("brand_id", brandId)
    .eq("source_url", sourceUrl)
    .maybeSingle<MediaAssetDbRow>();
  if (error) throw new Error(`media_assets (source_url) sorgusu başarısız: ${error.message}`);
  return data ? toMediaAssetRow(data) : null;
}

export interface PersistBytesInput {
  brandId: string;
  userId: string;
  bytes: ArrayBuffer;
  kind: MediaKind;
  mimeType: string;
  vendor: MediaSourceVendor | null;
  mediaJobId?: string;
}

/**
 * §12 adım 20 FAZ B — `persistVendorAsset`'in bayt kardeşi. ElevenLabs'ın
 * TTS uç noktası bir URL değil, ham mp3 baytları döner (`synthesizeSpeech()`
 * dönüşü) — indirilecek bir vendor URL'i yok, o yüzden `guardedFetch` devreye
 * girmiyor (SSRF riski de yok: baytlar zaten güvenilir bir sağlayıcı
 * çağrısından geldi, kullanıcı girdisi değil).
 *
 * İdempotency `persistVendorAsset` ile AYNI desen (`mediaJobId` → önce
 * `findExistingByJob`, sonra koşullu UPDATE ile kazanan/kaybeden ayrımı) —
 * kod tekrarı burada BİLİNÇLİ: iki fonksiyonun "kaynak" adımı (fetch vs.
 * doğrudan bayt) kalıcı olarak farklı, ortak bir üçüncü soyutlama bu tek
 * farkı gizlemek için gereğinden karmaşık bir sarmalayıcı gerektirirdi.
 */
export async function persistBytesAsset(
  supabase: SupabaseClient,
  input: PersistBytesInput,
): Promise<ApiResult<MediaAssetRow>> {
  const { brandId, userId, bytes, kind, mimeType, vendor, mediaJobId } = input;

  try {
    if (mediaJobId) {
      const existing = await findExistingByJob(supabase, mediaJobId);
      if (existing) return { ok: true, data: existing };
    }

    if (bytes.byteLength === 0) throw new Error("boş bayt dizisi — üretim başarısız olmuş olabilir");
    if (bytes.byteLength > MAX_BYTES_BY_KIND[kind]) {
      throw new Error(`bayt sınırını aştı (>${MAX_BYTES_BY_KIND[kind]} bayt)`);
    }

    const ext = EXTENSION_BY_CONTENT_TYPE[mimeType.split(";")[0]?.trim().toLowerCase() ?? ""] ?? "bin";
    const objectId = crypto.randomUUID();
    const storagePath = `${userId}/${brandId}/${kind}/${objectId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType: mimeType || "application/octet-stream", upsert: false });
    if (uploadError) throw new Error(`storage yüklemesi başarısız: ${uploadError.message}`);

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    const { data: inserted, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        brand_id: brandId,
        user_id: userId,
        kind,
        storage_path: storagePath,
        public_url: pub.publicUrl,
        mime_type: mimeType,
        bytes: bytes.byteLength,
        source_vendor: vendor,
        source_url: null,
      })
      .select("id,brand_id,kind,storage_path,public_url,mime_type,bytes,width,height,duration_ms,source_vendor,created_at")
      .single<MediaAssetDbRow>();

    if (insertError || !inserted) {
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      throw new Error(`media_assets yazılamadı: ${insertError?.message ?? "boş yanıt"}`);
    }

    let winner = toMediaAssetRow(inserted);

    if (mediaJobId) {
      const { data: locked, error: lockError } = await supabase
        .from("media_jobs")
        .update({ result_asset_id: winner.id, state: "succeeded", error: null, finished_at: new Date().toISOString() })
        .eq("id", mediaJobId)
        .is("result_asset_id", null)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (lockError) throw new Error(`media_jobs güncellenemedi: ${lockError.message}`);

      if (!locked) {
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
        await supabase.from("media_assets").delete().eq("id", winner.id);
        const actual = await findExistingByJob(supabase, mediaJobId);
        if (actual) winner = actual;
      }
    }

    return { ok: true, data: winner };
  } catch (err) {
    const message = (err as Error).message;
    if (mediaJobId) await markJobFailed(supabase, mediaJobId, message).catch(() => {});
    return { ok: false, error: { code: "storage_error", detail: message } };
  }
}

async function markJobFailed(supabase: SupabaseClient, mediaJobId: string, message: string): Promise<void> {
  await supabase
    .from("media_jobs")
    .update({ state: "failed", error: message.slice(0, 500), finished_at: new Date().toISOString() })
    .eq("id", mediaJobId);
}

export interface DeleteMediaAssetInput {
  brandId: string;
  assetId: string;
}

/**
 * §12 adım 11b FAZ B — `/library`'nin silme yolu. adım 19'un
 * `persistVendorAsset`'teki temizlik deseninin TERSİ: orada "satır
 * yazılamazsa dosyayı sil" vardı, burada "önce dosyayı sil, sonra satırı".
 *
 * Sıra bilinçli: depolama nesnesi ÖNCE silinir. Başarısız olursa hiçbir şey
 * değişmemiş olur (satır + dosya hâlâ tutarlı). Depolama silme başarılı
 * olduktan SONRA satır silinemezse (nadir — ağ kesintisi gibi) geriye
 * "dosyası olmayan bir satır" kalır; bu, "satırı olmayan bir dosya"dan
 * (görünmez, hiç temizlenmeyen depolama israfı) daha iyi bir başarısızlık
 * modu — kullanıcı kırık bir önizleme görür ve tekrar silmeyi dener, oysa
 * ters sıradaki hata sessizce depolama israfı biriktirirdi.
 */
export async function deleteMediaAsset(
  supabase: SupabaseClient,
  input: DeleteMediaAssetInput,
): Promise<ApiResult<void>> {
  const { brandId, assetId } = input;

  const { data: asset, error: findError } = await supabase
    .from("media_assets")
    .select("id,storage_path")
    .eq("id", assetId)
    .eq("brand_id", brandId)
    .maybeSingle<{ id: string; storage_path: string }>();
  if (findError) return { ok: false, error: { code: "storage_error", detail: findError.message } };
  if (!asset) return { ok: false, error: { code: "not_found" } };

  const { error: removeError } = await supabase.storage.from(BUCKET).remove([asset.storage_path]);
  if (removeError) return { ok: false, error: { code: "storage_error", detail: removeError.message } };

  const { error: deleteError } = await supabase.from("media_assets").delete().eq("id", assetId).eq("brand_id", brandId);
  if (deleteError) return { ok: false, error: { code: "storage_error", detail: deleteError.message } };

  return { ok: true, data: undefined };
}

/**
 * Vendor'ın geçici URL'ini indirir, `media` bucket'ına yazar, `media_assets`
 * satırını oluşturur. `mediaJobId` verilirse işi de günceller.
 *
 * İdempotency: `mediaJobId` verilmişse ve o işin `result_asset_id`'si zaten
 * doluysa, hiçbir ağ isteği YAPILMADAN o satır döner. Yoksa indirilir,
 * yüklenir, satır yazılır; iş satırı KOŞULLU UPDATE (`where result_asset_id
 * is null`) ile kilitlenir — iki eşzamanlı çağrı aynı işi bridgelerse
 * kaybeden kendi yüklediğini SİLER ve kazananın satırını döner (yetim
 * kayıt kalmaz, iki kopya dosya kalmaz).
 */
export async function persistVendorAsset(
  supabase: SupabaseClient,
  input: PersistVendorAssetInput,
): Promise<ApiResult<MediaAssetRow>> {
  const { brandId, userId, sourceUrl, kind, vendor, mediaJobId } = input;

  try {
    if (mediaJobId) {
      const existing = await findExistingByJob(supabase, mediaJobId);
      if (existing) return { ok: true, data: existing };
    } else {
      const existing = await findExistingByUrl(supabase, brandId, sourceUrl);
      if (existing) return { ok: true, data: existing };
    }

    const bytesBox = { bytes: 0 };
    const guarded = await guardedFetch(sourceUrl, {
      maxBytes: MAX_BYTES_BY_KIND[kind],
      expectedContentTypePrefixes: [CONTENT_TYPE_PREFIX_BY_KIND[kind]],
    });

    const ext = extensionFor(guarded.contentType, guarded.finalUrl);
    const objectId = crypto.randomUUID();
    const storagePath = `${userId}/${brandId}/${kind}/${objectId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, countingStream(guarded.stream, bytesBox), {
        contentType: guarded.contentType || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) {
      throw new Error(`storage yüklemesi başarısız: ${uploadError.message}`);
    }

    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);

    const { data: inserted, error: insertError } = await supabase
      .from("media_assets")
      .insert({
        brand_id: brandId,
        user_id: userId,
        kind,
        storage_path: storagePath,
        public_url: pub.publicUrl,
        mime_type: guarded.contentType,
        bytes: bytesBox.bytes,
        source_vendor: vendor,
        source_url: sourceUrl,
      })
      .select("id,brand_id,kind,storage_path,public_url,mime_type,bytes,width,height,duration_ms,source_vendor,created_at")
      .single<MediaAssetDbRow>();

    if (insertError || !inserted) {
      // Yetim depolama nesnesi kalmasın — satır yazılamadıysa dosya da gitmeli.
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
      throw new Error(`media_assets yazılamadı: ${insertError?.message ?? "boş yanıt"}`);
    }

    let winner = toMediaAssetRow(inserted);

    if (mediaJobId) {
      const { data: locked, error: lockError } = await supabase
        .from("media_jobs")
        .update({ result_asset_id: winner.id, state: "succeeded", error: null, finished_at: new Date().toISOString() })
        .eq("id", mediaJobId)
        .is("result_asset_id", null)
        .select("id")
        .maybeSingle<{ id: string }>();
      if (lockError) throw new Error(`media_jobs güncellenemedi: ${lockError.message}`);

      if (!locked) {
        // Yarışı kaybettik — başka bir çağrı bu işi bizden ÖNCE bridgeledi.
        // Kendi kopyamızı temizle, kazananı döndür.
        await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
        await supabase.from("media_assets").delete().eq("id", winner.id);
        const actual = await findExistingByJob(supabase, mediaJobId);
        if (actual) winner = actual;
      }
    }

    return { ok: true, data: winner };
  } catch (err) {
    const message = err instanceof FetchGuardError ? `${err.reason}: ${err.message}` : (err as Error).message;
    if (mediaJobId) await markJobFailed(supabase, mediaJobId, message).catch(() => {});
    return { ok: false, error: { code: "storage_error", detail: message } };
  }
}
