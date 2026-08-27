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
  purpose: string;
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
    { key: "anthropic", name: "Anthropic (Claude)", envVars: ["ANTHROPIC_API_KEY"], required: true, docsUrl: "https://console.anthropic.com/settings/keys", purpose: "Writes the content plan, captions, hooks and continuation decisions." },
    { key: "kie", name: "Kie.ai", envVars: ["KIE_API_KEY"], required: false, docsUrl: "https://kie.ai/api-key", purpose: "Generates the persona still and the talking UGC clip." },
    { key: "elevenlabs", name: "ElevenLabs", envVars: ["ELEVENLABS_API_KEY"], required: false, docsUrl: "https://elevenlabs.io/app/settings/api-keys", purpose: "Turkish voiceover that delivers the script in the persona's voice." },
    { key: "fal", name: "fal.ai", envVars: ["FAL_KEY"], required: false, docsUrl: "https://fal.ai/dashboard/keys", purpose: "Lipsync for the UGC clip, and post images from a prompt." },
    { key: "voyage", name: "Voyage AI", envVars: ["VOYAGE_API_KEY"], required: false, docsUrl: "https://dashboard.voyageai.com/api-keys", purpose: "Embeddings for duplicate detection. Must return exactly 1024 dimensions (§4c / D3)." },
    { key: "instagram", name: "Instagram", envVars: ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"], required: false, docsUrl: "https://developers.facebook.com/apps", purpose: "Publishing and insights. Per-brand app credentials, with the env vars as fallback only (D2)." },
    { key: "supabase", name: "Supabase", envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"], required: true, docsUrl: "https://supabase.com/dashboard/project/_/settings/api", purpose: "Database, auth and media storage for the whole product." },
  ],
};

export default appConfig;
