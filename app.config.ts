/**
 * app.config.ts — the single source of truth for the merged product.
 * Every user-facing string is bilingual: { tr, en }.
 *
 * Derived from the three source projects' app.config.ts, whose interfaces were
 * byte-identical (BIRLESIM_PLANI §1.6). Two changes from the originals:
 *   1. `nav` is no longer a static array — modules are enabled per phase, so
 *      `buildNav(enabledModules)` replaces `appConfig.nav`.
 *   2. `integrations` is the union of all three, plus the providers the merged
 *      product adds. Keys are read from `provider_credentials` at runtime, not
 *      from env — `envVars` here is documentation, not a lookup path (§1.12).
 */
import type { L } from "@/lib/i18n/config";

/* ═══════════════════════════════════════════════════════════════════════════
   ⭐ TEK DEĞİŞTİRME NOKTASI — ürün adı ve marka rengi
   BIRLESIM_PLANI §11 S1: yeni isim kullanılacak, isim henüz kesin değil.
   İsim kesinleştiğinde SADECE bu blok ve app/globals.css'teki BRAND HUE
   satırı değişir. Başka hiçbir dosyada ürün adı hardcoded olmamalı.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Görünen ürün adı. Geçici — §11 S1 kesinleşince değiştir. */
export const BRAND_NAME = "Social Suite";

/** Sidebar/logo kısaltması. */
export const BRAND_MARK = "SS";

/** Ürün domaini. Geçici. */
export const BRAND_DOMAIN = "social-suite.app";

/**
 * Marka hue'su (oklch H). app/globals.css içindeki BRAND HUE ile AYNI olmalı —
 * CSS build zamanında çözüldüğü için değer iki yerde tutuluyor; ikisi de
 * bu yorumla işaretli. threadly'nin token YAPISI alındı, hue'su değil (§11 S1).
 */
export const BRAND_HUE = 262;

/* ═══════════════════════ TEK DEĞİŞTİRME NOKTASI SONU ═══════════════════════ */

export type IconName = string;

export interface NavItem { label: L; href: string; icon: IconName; }
export interface Feature { icon: IconName; title: L; body: L; }
export interface Stat { value: string; label: L; }
export interface PricingTier { name: string; price: string; period?: string; tagline: L; features: L[]; cta: L; featured?: boolean; }
export interface FaqItem { q: L; a: L; }

export interface Integration {
  key: string;
  name: string;
  /** Documentation only. The live key is read from `provider_credentials`
   *  (Vault) per brand, never from env — see BIRLESIM_PLANI §1.12 / §8.6. */
  envVars: string[];
  required: boolean;
  docsUrl: string;
  /** Bilingual — §12 adım 13 FAZ C: "müşteri beş anahtar girmenin nedenini
   *  anlamalı". */
  purpose: L;
  /** What breaks if this key is missing. Optional — only meaningful for
   *  keys shown in the /settings integrations form (`managedViaVault`). */
  whenMissing?: L;
  /**
   * true → this key lives in `provider_credentials` + Vault, editable from
   * /settings (§12 adım 13). false → managed elsewhere:
   *   - `instagram`: OAuth connect flow, adım 16 (`/channels`) — not a
   *     raw-text-field key.
   *   - `supabase`: project-level infrastructure, not a per-customer key
   *     the /settings credentials form manages.
   */
  managedViaVault: boolean;
}

/** Modules that can be switched on per phase. `nav` is built from these. */
export const MODULES = [
  "dashboard",
  "plan",
  "queue",
  "studio",
  "library",
  "channels",
  "analytics",
  "composer",
  "settings",
] as const;

export type ModuleName = (typeof MODULES)[number];

export interface AppConfig {
  name: string;
  tagline: L;
  description: L;
  domain: string;
  logoText: string;
  integrations: Integration[];
}

/**
 * Nav entries per module. `buildNav()` filters this by the modules a phase has
 * enabled, so a disabled module cannot leak a dead link into the sidebar.
 */
const NAV_BY_MODULE: Record<ModuleName, NavItem> = {
  dashboard: { label: { tr: "Takvim", en: "Calendar" }, href: "/dashboard", icon: "calendar-days" },
  plan: { label: { tr: "Plan", en: "Plan" }, href: "/plan", icon: "calendar-range" },
  queue: { label: { tr: "Kuyruk", en: "Queue" }, href: "/queue", icon: "layout-list" },
  studio: { label: { tr: "Stüdyo", en: "Studio" }, href: "/studio", icon: "clapperboard" },
  library: { label: { tr: "Kütüphane", en: "Library" }, href: "/library", icon: "images" },
  channels: { label: { tr: "Kanallar", en: "Channels" }, href: "/channels", icon: "share-2" },
  analytics: { label: { tr: "Analitik", en: "Analytics" }, href: "/analytics", icon: "chart-line" },
  composer: { label: { tr: "Düzenleyici", en: "Composer" }, href: "/composer", icon: "pen-line" },
  settings: { label: { tr: "Ayarlar", en: "Settings" }, href: "/settings", icon: "settings" },
};

/** Sidebar order. Filtering preserves it, so nav order never depends on
 *  the order the caller happens to list its enabled modules in. */
const NAV_ORDER: ModuleName[] = [
  "dashboard", "plan", "queue", "studio",
  "library", "channels", "analytics", "composer", "settings",
];

export function buildNav(enabled: readonly ModuleName[]): NavItem[] {
  const on = new Set(enabled);
  return NAV_ORDER.filter((m) => on.has(m)).map((m) => NAV_BY_MODULE[m]);
}

/**
 * AI çağrısı yapan iş tipi başına model — BIRLESIM_PLANI §12 adım 14 FAZ A1.
 *
 * Kodun içine gömülmez (`lib/core/plan/skeleton.ts` / `lib/core/ai/caption.ts`
 * `model`'i PARAMETRE alır, artık kendi sabitleri yok) — burası tek
 * değiştirme noktası, `lib/adapters/live/{planner,copy}.ts` buradan okur.
 *
 * ⭐ Karar: `claude-sonnet-5`, `claude-opus-5` DEĞİL.
 * threadly `claude-opus-5` kullanıyordu (bkz. eski `skeleton.ts` yorumu).
 * Bu üründe faturayı MÜŞTERİ ödüyor (§8.6) — model seçimi onun maliyet
 * profilini belirliyor. Plan iskeleti ve caption ikisi de sınırlı, şemayla
 * kısıtlanmış JSON çıktısı (`output_config.format`): serbest biçimli uzun
 * metin değil, "7-26 kısa başlık+kanca" ya da "tek caption". Opus'un
 * kalite farkının bu şekilde sınırlanmış görevde ölçülebilir bir kazanç
 * getirip getirmediği GERÇEK kullanıcı verisi olmadan ÖLÇÜLEMEZ — ölçemediğimi
 * söylüyorum. Sonnet 5, Opus 5'in ~%40'ı fiyatına (bkz. claude-api skill
 * fiyat tablosu, 2026-06-24) aynı yapılandırılmış-çıktı sözleşmesini
 * karşılıyor; başlangıç noktası olarak makul risk. Kalite şikayeti gelirse
 * TEK satır değişir (kod değil, bu tablo) — iş tipi başına, gerekirse
 * marka bazlı bir sonraki adımda.
 *
 * ⚠ DOĞRULANMALI: model adları `claude-api` skill'inin 2026-06-24 tarihli
 * önbelleğinden alındı (bu oturumda doğrulandı) — Anthropic yeni model
 * yayınlarsa bu tablo elle güncellenmeli, otomatik izlemiyor.
 */
export const AI_JOB_MODELS = {
  plan_generate: "claude-sonnet-5",
  caption_write: "claude-sonnet-5",
  /** §12 adım 15, Akış E Kontrol 3c — "devam mı, tekrar mı?" tek bir
   *  evet/hayır + kısa ifade; caption_write ile aynı model, `effort: "low"`
   *  ile ucuzlatılıyor (bkz. lib/core/dedupe/judge-continuation.ts). */
  continuation_judge: "claude-sonnet-5",
} as const;

export const appConfig: AppConfig = {
  name: BRAND_NAME,
  tagline: {
    tr: "Planla, üret, yayınla, ölç — tek yerden.",
    en: "Plan, create, publish, measure — from one place.",
  },
  description: {
    tr: "Marka profilinden aylık içerik planı üretir, UGC videolarını hazırlar, kanallara yayınlar ve sonuçları bir sonraki planına geri besler.",
    en: "Turns a brand profile into a monthly content plan, produces the UGC videos, publishes to your channels, and feeds the results back into the next plan.",
  },
  domain: BRAND_DOMAIN,
  logoText: BRAND_MARK,

  /**
   * Union of the three source configs (§1.6) plus the providers the merged
   * product adds. `instagram` carries the app credentials that D2 moved from
   * global env to per-brand `provider_credentials` (env is fallback only).
   */
  integrations: [
    {
      key: "anthropic", name: "Anthropic (Claude)", envVars: ["ANTHROPIC_API_KEY"], required: true,
      docsUrl: "https://console.anthropic.com/settings/keys", managedViaVault: true,
      purpose: { tr: "İçerik planını, caption'ları, kancaları ve devam kararlarını yazar.", en: "Writes the content plan, captions, hooks and continuation decisions." },
      whenMissing: { tr: "Plan üretimi ve caption yazımı çalışmaz — ürünün beyni bu anahtara bağlı.", en: "Plan generation and caption writing stop working — the product's brain runs on this key." },
    },
    {
      key: "kie", name: "Kie.ai", envVars: ["KIE_API_KEY"], required: false,
      docsUrl: "https://kie.ai/api-key", managedViaVault: true,
      purpose: { tr: "Persona görselini ve konuşan UGC klibini üretir.", en: "Generates the persona still and the talking UGC clip." },
      whenMissing: { tr: "UGC video üretimi (persona görseli + konuşan klip) çalışmaz.", en: "UGC video production (persona still + talking clip) stops working." },
    },
    {
      key: "elevenlabs", name: "ElevenLabs", envVars: ["ELEVENLABS_API_KEY"], required: false,
      docsUrl: "https://elevenlabs.io/app/settings/api-keys", managedViaVault: true,
      purpose: { tr: "Persona'nın sesiyle Türkçe seslendirme üretir.", en: "Turkish voiceover that delivers the script in the persona's voice." },
      whenMissing: { tr: "UGC videolarında Türkçe seslendirme üretilemez.", en: "UGC videos can't get a Turkish voiceover." },
    },
    {
      key: "fal", name: "fal.ai", envVars: ["FAL_KEY"], required: false,
      docsUrl: "https://fal.ai/dashboard/keys", managedViaVault: true,
      purpose: { tr: "UGC klibi için dudak senkronu, ve prompttan gönderi görseli üretir.", en: "Lipsync for the UGC clip, and post images from a prompt." },
      whenMissing: { tr: "Dudak senkronu ve prompttan görsel üretimi çalışmaz.", en: "Lipsync and prompt-to-image generation stop working." },
    },
    {
      key: "voyage", name: "Voyage AI", envVars: ["VOYAGE_API_KEY"], required: false,
      docsUrl: "https://dashboard.voyageai.com/api-keys", managedViaVault: true,
      purpose: { tr: "Tekrar/benzerlik kontrolü için embedding üretir. Tam 1024 boyut dönmeli (§4c / D3).", en: "Embeddings for duplicate detection. Must return exactly 1024 dimensions (§4c / D3)." },
      whenMissing: { tr: "Tekrar/benzerlik kontrolü ve devam zinciri önerileri çalışmaz.", en: "Duplicate/similarity checks and continuation-chain suggestions stop working." },
    },
    {
      key: "instagram", name: "Instagram", envVars: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"], required: false,
      docsUrl: "https://developers.facebook.com/apps", managedViaVault: false,
      purpose: { tr: "Yayın ve metrik toplama. Marka bazlı uygulama kimliği, env yalnızca yedek (D2).", en: "Publishing and insights. Per-brand app credentials, with the env vars as fallback only (D2)." },
      whenMissing: { tr: "Instagram'a otomatik yayın ve metrik toplama çalışmaz.", en: "Automatic Instagram publishing and metrics collection stop working." },
    },
    {
      key: "supabase", name: "Supabase", envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"], required: true,
      docsUrl: "https://supabase.com/dashboard/project/_/settings/api", managedViaVault: false,
      purpose: { tr: "Tüm ürün için veritabanı, kimlik doğrulama ve medya depolama.", en: "Database, auth and media storage for the whole product." },
    },
  ],
};

export default appConfig;
