"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireBrand } from "@/lib/server/auth";
import { requestModeOverrides } from "@/lib/server/mode";
import { isDemo, port } from "@/lib/adapters";
import { createDedupeRunBudget, runDedupeCheck } from "@/lib/server/dedupe/run";
import { computeFingerprint } from "@/lib/core/dedupe/fingerprint";
import { PLATFORMS, POST_KINDS, type Platform, type PostKind } from "@/lib/core/types";

/**
 * "Kaydet" düğmesi — BIRLESIM_PLANI §12 adım 11b FAZ C.
 *
 * ⭐ KARAR — bu satır, hangi mod olursa olsun HER ZAMAN gerçek `content_items`
 * tablosuna yazılır; `port("content")`/`isDemo("content")` katmanına HİÇ
 * GİRMEZ. Gerekçe adım 9 B2'nin (`settings/actions.ts`) marka formu
 * kararıyla AYNI: kullanıcının elle yazdığı içerik, AI'ın demo modda
 * taklit ettiği bir ÜRETİM değil — kullanıcının kendi editoryal girdisi
 * (tıpkı marka profili gibi). `demoContent.create()` KALICI DEĞİL (bkz.
 * `lib/adapters/demo/content.ts` başlığı); composer'ı o porta bağlamak
 * "kaydettim" yalanını `/queue`'da hiç görünmeyen bir satırla tekrarlardı —
 * FAZ C'nin kendi kabul kriteri ("kaydedilen içerik /queue'da görünsün")
 * bunu zaten gerektiriyor. Oturumun KENDİ `createClient()`'ıyla (RLS
 * altında, service-role DEĞİL) yazılır — `owns_brand()` politikası burada
 * da gerçek bir kapı.
 *
 * ⭐ Tekrar kontrolü — adım 15'in motoru (`checkDuplicate`) plan_generate
 * içinde çalışıyordu; bu action AYNI motoru (`runDedupeCheck`) elle yazılan
 * içerik için de çağırır. KARAR: ENGELLEMEK değil UYARMAK. Gerekçe: bir
 * insan bilinçli olarak aynı fikri tekrar üretmek isteyebilir (mevsimlik
 * hatırlatma, A/B varyasyonu) — plan üretici gibi 7-30 satırı otomatik
 * basan bir motor için "reddet" doğruyken, tek satır elle yazan bir insan
 * için "reddet" onun kararını gasp eder. Motor yine de fingerprint/embedding
 * kolonlarını DOLDURUR (aşağıda) — böylece bu elle yazılan satır, SONRAKİ
 * bir plan üretiminin veya composer denemesinin tekrar kontrolünde GÖRÜNÜR
 * hâle gelir; yalnızca KENDİSİ engellenmiyor.
 *
 * ⭐ Devam zinciri — `parentId` verilirse `content_chain_guard` trigger'ı
 * (`00_schema.sql`) `root_id`/`chain_position`'ı ebeveynden türetir; burada
 * hesaplama YOK. §12 adım 15 FAZ B3: embedding sağlayıcısı (Voyage) henüz
 * yazılmadığı için (`lib/adapters/live/dedupe.ts`) otomatik "devam mı?"
 * tespiti bugün hiç çalışmıyor — elle işaretleme, zincir kurmanın TEK
 * güvenilir yolu.
 *
 * ⚠ "use server" dosyaları yalnızca ASYNC FONKSİYON export edebilir
 * (adım 20.5 FAZ C1) — başlangıç state sabiti burada değil, `ComposerView`'da.
 */
export interface ComposerActionState {
  status: "idle" | "saved" | "error";
  errorKey: "errComposerTitleRequired" | "errComposerPlatformInvalid" | "errComposerSaveFailed" | null;
  /** Tekrar kontrolünün UYARI mesajı — kaydetmeyi ENGELLEMEDİ, bilgilendirdi. */
  duplicateWarning: string | null;
  savedTitle: string | null;
}

interface ComposerContentInsert {
  brand_id: string;
  user_id: string;
  platform: Platform;
  kind: PostKind;
  title: string;
  hook: string;
  body: string;
  hashtags: string;
  scheduled_at: string | null;
  parent_id: string | null;
  status: "draft";
  content_fingerprint: string | null;
  embedding: number[] | null;
}

function parsePlatform(raw: FormDataEntryValue | null): Platform | null {
  const value = String(raw ?? "");
  return (PLATFORMS as readonly string[]).includes(value) ? (value as Platform) : null;
}

function parseKind(raw: FormDataEntryValue | null): PostKind {
  const value = String(raw ?? "");
  return (POST_KINDS as readonly string[]).includes(value) ? (value as PostKind) : "text";
}

export async function createComposerContentAction(
  _prev: ComposerActionState,
  formData: FormData,
): Promise<ComposerActionState> {
  const { user, brand } = await requireBrand();

  const title = String(formData.get("title") ?? "").trim();
  if (!title) return { status: "error", errorKey: "errComposerTitleRequired", duplicateWarning: null, savedTitle: null };

  const platform = parsePlatform(formData.get("platform"));
  if (!platform) return { status: "error", errorKey: "errComposerPlatformInvalid", duplicateWarning: null, savedTitle: null };

  const kind = parseKind(formData.get("kind"));
  const hook = String(formData.get("hook") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const hashtags = String(formData.get("hashtags") ?? "").trim();
  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "").trim();
  const scheduledAt = scheduledAtRaw ? new Date(scheduledAtRaw).toISOString() : null;
  const parentId = String(formData.get("parentId") ?? "").trim() || null;
  const requestUgc = formData.get("requestUgc") === "on";

  const supabase = await createClient();

  // ⭐ Tekrar kontrolü — motorun kendisi, WARN modunda çağrılıyor. Tek
  // çağrılık bütçe (`createDedupeRunBudget()`) — bu action bir plan üretimi
  // DEĞİL, LLM "devam mı?" bütçesi plan_generate'inkiyle PAYLAŞILMAZ.
  const decision = await runDedupeCheck(
    supabase,
    { brandId: brand.id, title, hook },
    createDedupeRunBudget(),
  );

  const duplicateWarning =
    decision.verdict === "duplicate"
      ? "Bu içerik daha önce üretilenlere çok benziyor (parmak izi eşleşmesi) — yine de kaydedildi."
      : decision.verdict === "continuation"
        ? "Bu içerik daha önceki bir gönderinin devamı gibi görünüyor — istersen 'Bunun devamı' alanından bağla."
        : null;

  const insert: ComposerContentInsert = {
    brand_id: brand.id,
    user_id: user.id,
    platform,
    kind,
    title,
    hook,
    body,
    hashtags,
    scheduled_at: scheduledAt,
    parent_id: parentId,
    status: "draft",
    // ⭐ Fingerprint HER ZAMAN hesaplanır (verdict'ten bağımsız) — "duplicate"
    // dalı da dahil, aksi hâlde bu satır kendisi bir SONRAKİ tekrar
    // kontrolünde görünmez olurdu (yukarıdaki karar notunun gerekçesi).
    // `embedding` yalnızca motor gerçekten ürettiyse dolar ("new"/
    // "continuation") — "duplicate" kararının embedding'i yok (tip: bkz.
    // `DedupeDecision`), Katman 2 bugün zaten kapalı (Voyage yazılmadı).
    content_fingerprint: computeFingerprint(title, hook),
    embedding: decision.verdict === "duplicate" ? null : decision.embedding,
  };

  const { data: inserted, error } = await supabase
    .from("content_items")
    .insert(insert)
    .select("id")
    .single<{ id: string }>();
  if (error || !inserted) {
    return { status: "error", errorKey: "errComposerSaveFailed", duplicateWarning: null, savedTitle: null };
  }

  // ⭐ "/plan'daki ugc_requested deseninin aynısı" — aynı port, aynı ikinci
  // katman kontrolü (demo modda video portu no-op döner, /plan ile tutarlı).
  if (requestUgc) {
    const overrides = await requestModeOverrides();
    if (!isDemo("video", overrides)) {
      const contentPort = port("content", overrides);
      await contentPort.markUgcRequested([inserted.id]);
    }
  }

  revalidatePath("/composer");
  revalidatePath("/queue");
  revalidatePath("/dashboard");
  return { status: "saved", errorKey: null, duplicateWarning, savedTitle: title };
}
