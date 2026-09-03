/**
 * ContentPort — DEMO implementasyon.
 *
 * Demo kaynağı: `fixtures/content.ts` (satırlar) + `fixtures/activity.ts`.
 *
 * ⚠ Sıfır ağ isteği, sıfır kuruş — FAZ 1'in kabul kriteri.
 *
 * ⚠ Yazma işlemleri KALICI DEĞİL. Fixture dizisi salt okunur; `create` /
 * `update` / `archive` yeni bir satır nesnesi döndürür ama hiçbir yere
 * yazmaz. Demo modda "kaydettim" demek, sayfa yenilendiğinde kaybolan bir
 * yalan olurdu; ekranlar (adım 8-9) iyimser güncellemeyi kendi state'inde
 * tutacak. Mutasyon yok — global bir dizi mutasyonu SSR'da istekler arası
 * sızardı.
 */
import type { ContentPort } from "@/lib/adapters/ports";
import type { ContentItemRow } from "@/lib/core/types";
import { demoActivity } from "@/lib/adapters/demo/fixtures/activity";
import { DEMO_BRAND_ID } from "@/lib/adapters/demo/fixtures/brands";
import { demoContentItems } from "@/lib/adapters/demo/fixtures/content";

/** §12 adım 8'in "sıfır ağ isteği" kriteri: liste varsayılan üst sınırı. */
const DEFAULT_ACTIVITY_LIMIT = 12;

function rows(): ContentItemRow[] {
  return demoContentItems(new Date());
}

export const demoContent: ContentPort = {
  async list(query) {
    let result = rows();

    // Filtre verilmediyse arşiv gizlenir — arşiv "üretilmeyecek" demek.
    if (!query?.status) result = result.filter((r) => r.status !== "archived");
    else result = result.filter((r) => query.status!.includes(r.status));

    if (query?.platform) result = result.filter((r) => query.platform!.includes(r.platform));
    if (query?.from) result = result.filter((r) => (r.scheduled_at ?? "") >= query.from!);
    if (query?.to) result = result.filter((r) => (r.scheduled_at ?? "") <= query.to!);

    return query?.limit ? result.slice(0, query.limit) : result;
  },

  async get(id) {
    return rows().find((r) => r.id === id) ?? null;
  },

  async listChain(rootId) {
    return rows()
      .filter((r) => r.root_id === rootId)
      .sort((a, b) => a.chain_position - b.chain_position);
  },

  async create(input) {
    const now = new Date().toISOString();
    return {
      ok: true,
      data: {
        ...input,
        id: `demo-${now}`,
        brand_id: DEMO_BRAND_ID,
        plan_id: input.plan_id ?? null,
        channel_id: input.channel_id ?? null,
        media_type: input.media_type ?? "IMAGE",
        day_offset: input.day_offset ?? null,
        time_of_day: input.time_of_day ?? null,
        scheduled_at: input.scheduled_at ?? null,
        published_at: null,
        is_best_time: false,
        hook: input.hook ?? "",
        body: input.body ?? "",
        hashtags: input.hashtags ?? "",
        media_url: input.media_url ?? null,
        status: "idea",
        external_post_id: null,
        parent_id: input.parent_id ?? null,
        // Canlıda trigger türetir; demoda kök varsayılıyor (§4b).
        root_id: input.parent_id ?? null,
        chain_position: input.parent_id ? 2 : 1,
        continuation_note: input.continuation_note ?? "",
        content_fingerprint: null,
        topic_key: input.topic_key ?? null,
      },
    };
  },

  async update(id, patch) {
    const current = rows().find((r) => r.id === id);
    if (!current) return { ok: false, error: { code: "not_found" } };
    return { ok: true, data: { ...current, ...patch } };
  },

  async archive(id) {
    const current = rows().find((r) => r.id === id);
    if (!current) return { ok: false, error: { code: "not_found" } };
    return { ok: true, data: { ...current, status: "archived" } };
  },

  async listActivity(limit = DEFAULT_ACTIVITY_LIMIT) {
    return demoActivity(new Date())
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit);
  },

  // §12 adım 20 FAZ C1 — demo modda da KALICI DEĞİL (dosya başlığının aynı
  // gerekçesi: sunucu tarafında mutasyon istekler arası sızardı). Ekran
  // kendi iyimser state'ini tutar; bu iki metot yalnızca tip sözleşmesini
  // doldurur, "seçildi" sayısı sıfır döner.
  async markUgcRequested() {
    return { ok: true, data: 0 };
  },
  async listUgcRequested() {
    return [];
  },
};
