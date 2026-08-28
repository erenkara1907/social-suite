/**
 * ← threadly/lib/brand/types.ts
 * Uyarlama: `L` tipi `lib/core/types`'tan geliyor (i18n bağı koparıldı); gövde aynen.
 *
 * The brand profile: who the business is, what it sells, who it talks to and
 * how it sounds. Every plan skeleton and every caption is written against this,
 * so it is the one piece of state the whole app reads from.
 *
 * Field names match the snake_case-free columns in
 * supabase/00_schema.sql (brands) (they are already single words).
 */
import type { L } from "@/lib/core/types";

export interface Brand {
  name: string;
  industry: string;
  description: string;
  products: string;
  audience: string;
  voice: string;
  keywords: string;
  links: string;
}

/** GET /api/brand — null until the user fills the form in Settings. */
export interface BrandResponse {
  brand: Brand | null;
}

export const BRAND_FIELDS = [
  "name",
  "industry",
  "description",
  "products",
  "audience",
  "voice",
  "keywords",
  "links",
] as const;

export type BrandField = (typeof BRAND_FIELDS)[number];

/** Per-field caps. The long ones are pasted into a prompt, so they stay small. */
export const MAX_LENGTH: Record<BrandField, number> = {
  name: 80,
  industry: 80,
  description: 600,
  products: 600,
  audience: 400,
  voice: 300,
  keywords: 300,
  links: 300,
};

export const EMPTY_BRAND: Brand = {
  name: "",
  industry: "",
  description: "",
  products: "",
  audience: "",
  voice: "",
  keywords: "",
  links: "",
};

export const BRAND_LABEL: Record<BrandField, L> = {
  name: { tr: "İşletme adı", en: "Business name" },
  industry: { tr: "Sektör", en: "Industry" },
  description: { tr: "İşletme ne yapıyor?", en: "What does the business do?" },
  products: { tr: "Ürünler / hizmetler", en: "Products / services" },
  audience: { tr: "Hedef kitle", en: "Target audience" },
  voice: { tr: "Marka sesi", en: "Brand voice" },
  keywords: { tr: "Anahtar kelimeler & hashtagler", en: "Keywords & hashtags" },
  links: { tr: "Bağlantılar", en: "Links" },
};

export const BRAND_PLACEHOLDER: Record<BrandField, L> = {
  name: { tr: "Kahve Durağı", en: "Corner Coffee" },
  industry: { tr: "Üçüncü nesil kahveci", en: "Specialty coffee shop" },
  description: {
    tr: "Kadıköy'de tek şubeli, kendi çekirdeğini kavuran bir kahveci. Sabah 7'de açılıyor, hafta içi ofis çalışanlarına, hafta sonu mahalleliye hizmet veriyor.",
    en: "A single-shop roaster in Kadikoy. Opens at 7am, serves office workers on weekdays and the neighbourhood at weekends.",
  },
  products: {
    tr: "Filtre kahve, cold brew, ev tipi 250g çekirdek paketleri, tarçınlı rulo",
    en: "Filter coffee, cold brew, 250g retail bean bags, cinnamon rolls",
  },
  audience: {
    tr: "25-40 yaş, Kadıköy ve çevresinde çalışan, kaliteli kahveye para vermeye istekli beyaz yakalılar",
    en: "25-40, works nearby, happy to pay for good coffee",
  },
  voice: {
    tr: "Samimi ama abartısız, bilgili, satış diline kaçmayan",
    en: "Warm but understated, knowledgeable, never salesy",
  },
  keywords: { tr: "#kahve #kadıköy #filtrekahve #coldbrew", en: "#coffee #specialtycoffee #coldbrew" },
  links: { tr: "instagram.com/kahvedurag - kahvedurag.com", en: "instagram.com/cornercoffee - cornercoffee.com" },
};

/** True when there is enough here for the planner to be useful. */
export function isBrandUsable(brand: Brand | null): brand is Brand {
  if (!brand) return false;
  return brand.name.trim().length > 0 && brand.description.trim().length > 0;
}

/**
 * ⭐ adım 9 B4 — /settings ve /plan'ın paylaştığı tek hesap. Boş marka 0,
 * hepsi dolu 100. `name` de dahil sekiz alanın hepsi eşit ağırlıklı —
 * `toPromptBlock`'un okuduğu satırların tamamı bu.
 */
export function brandCompletionPercent(brand: Brand | null): number {
  if (!brand) return 0;
  const filled = BRAND_FIELDS.filter((field) => brand[field].trim().length > 0).length;
  return Math.round((filled / BRAND_FIELDS.length) * 100);
}

/**
 * `links` alanı serbest metin — birden çok bağlantı virgül, satır sonu veya
 * " - " ile ayrılabilir (bkz. `BRAND_PLACEHOLDER.links`: "a.com - b.com").
 * Tekil bir ayraç olan "-"/"–" belirteci link SAYILMAZ, atılır.
 */
const LINK_SEPARATOR = /[\s,]+/;

export function splitLinks(raw: string): string[] {
  return raw
    .split(LINK_SEPARATOR)
    .map((token) => token.trim())
    .filter((token) => token.length > 0 && token !== "-" && token !== "–");
}

/**
 * Cömert doğrulama: şema (`https://`) YOKSA eklenir — placeholder çıplak alan
 * adı gösteriyor ("kahvedurag.com"), kullanıcıdan `https://` yazmasını
 * istemek gereksiz bir sürtünme olurdu.
 */
export function isValidLinkToken(token: string): boolean {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(token) ? token : `https://${token}`;
  try {
    const { hostname } = new URL(withScheme);
    return hostname.includes(".") && !hostname.startsWith(".") && !hostname.endsWith(".");
  } catch {
    return false;
  }
}

/** `links` alanının TAMAMI geçerli mi — boş dize her zaman geçerli (alan opsiyonel). */
export function validateLinks(raw: string): boolean {
  return splitLinks(raw).every(isValidLinkToken);
}

/** Trims, drops unknown keys and enforces the caps. Returns null when invalid. */
export function parseBrand(raw: unknown): Brand | null {
  if (typeof raw !== "object" || raw === null) return null;
  const source = raw as Record<string, unknown>;
  const brand = { ...EMPTY_BRAND };

  for (const field of BRAND_FIELDS) {
    const value = source[field];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") return null;
    const trimmed = value.trim();
    if (trimmed.length > MAX_LENGTH[field]) return null;
    brand[field] = trimmed;
  }

  if (brand.name.length === 0) return null;
  return brand;
}

/**
 * The brand as the model sees it. Empty fields are dropped rather than sent as
 * blanks — a labelled empty line reads as "we have none of this" and drags the
 * output down.
 */
export function toPromptBlock(brand: Brand | null): string {
  if (!isBrandUsable(brand)) return "";

  const lines: [string, string][] = [
    ["Business", brand.name],
    ["Industry", brand.industry],
    ["What it does", brand.description],
    ["Products and services", brand.products],
    ["Target audience", brand.audience],
    ["Brand voice", brand.voice],
    ["Keywords and hashtags to favour", brand.keywords],
    ["Links", brand.links],
  ];

  return [
    "The brand every post must serve:",
    ...lines.filter(([, value]) => value.length > 0).map(([label, value]) => `${label}: ${value}`),
  ].join("\n");
}
