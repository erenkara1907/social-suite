/**
 * Hazır plan iskeletleri — `/plan` ekranının demo çıktısı.
 *
 * ← threadly `lib/demo/data.ts:127` `ideas` + `:79` `posts`. §9.2: "/plan →
 *   hazır plan JSON (7 ve 30 günlük iki örnek)".
 *
 * ⚠ Bu dosyada TİP TANIMI YOK. `SkeletonPost` `lib/core/plan/skeleton.ts`'te.
 *
 * ⭐ Takvimi model DEĞİL, `WEEKLY_TEMPLATE` belirliyor — demo bunu taklit
 * etmiyor, GERÇEK `buildSlots()` fonksiyonunu çağırıyor. Sebebi
 * `template.ts`'in kendi yorumunda yazıyor: "aynı marka iki kez sorulduğunda
 * aynı ritmi alır". Elle yazılmış 24 gönderilik bir dizi bu ritmi taklit
 * ederdi ve şablon değiştiğinde sessizce ayrışırdı. Modelin yazdığı tek şey
 * her slotun BAŞLIĞI ve KANCASI; demo da yalnızca onu sabitliyor.
 */
import { buildSlots } from "@/lib/core/plan/template";
import type { SkeletonPost } from "@/lib/core/plan/skeleton";
import type { PlanHorizon } from "@/lib/core/plan/types";

/** Modelin dolduracağı kısım: slot başına bir fikir. Sırayla tüketilir. */
const IDEAS: readonly { title: string; hook: string }[] = [
  { title: "Kavurma tarihi neden pakette yazıyor", hook: "Son kullanma tarihi kahve için neredeyse anlamsız bir bilgi." },
  { title: "Bu haftanın kökeni: Huila", hook: "Kakao, badem, koyu şeker — espresso için de iyi." },
  { title: "Değirmen mi makine mi", hook: "Bütçeni bölmen gerekiyorsa değirmene ağırlık ver." },
  { title: "Sabah 06:40, makine ısındı", hook: "Bugün ne kavurduğumuzu birlikte görelim." },
  { title: "V60'ta bloom neden 30 saniye", hook: "Karbondioksit çıkmadan su kahveye tam temas edemiyor." },
  { title: "Abonelik kutusunda bu ay ne var", hook: "İki köken, bir harman, bir de tadım notu kartı." },
  { title: "Suyun sertliği bardağı nasıl değiştirir", hook: "Bardağın %98'i su; geri kalanı tartışıyoruz." },
  { title: "Tadım masası cumartesi 11:00", hook: "Üç köken yan yana, kayıt yok, kontenjan 12." },
  { title: "Espresso için öğütme ayarı", hook: "25 saniyede 36 gram çıkmıyorsa değişken öğütmede." },
  { title: "Üreticiden doğrudan alım nasıl işliyor", hook: "Aracı sayısı üçten bire indi; fark çiftçide kaldı." },
  { title: "Soğuk demleme 12 saat neden bekliyor", hook: "Sıcaklık düşünce ekstraksiyon yavaşlıyor, acılık gelmiyor." },
  { title: "Kurumsal hediye kutusu takvimi", hook: "Yılbaşı siparişleri için son tarih 15 Kasım." },
  { title: "Kahve bozulmaz, yaşlanır", hook: "7-21 gün aralığı aromanın en açık olduğu pencere." },
];

const TITLES: Record<PlanHorizon, string> = {
  7: "Bir haftalık demleme ritmi",
  30: "Eylül ritmi — tazelik, ekipman, köken",
};

/**
 * `startDate`'ten itibaren şablonun yerleştirdiği slotlar + sırayla atanmış
 * fikirler. Aynı girdi → aynı plan; rastgelelik yok.
 */
export function demoPlanSkeleton(horizonDays: PlanHorizon, start: Date): {
  title: string;
  posts: SkeletonPost[];
} {
  const slots = buildSlots(start, horizonDays);

  return {
    title: TITLES[horizonDays],
    posts: slots.map((slot, i) => {
      const idea = IDEAS[i % IDEAS.length];
      return {
        dayOffset: slot.dayOffset,
        timeOfDay: slot.timeOfDay,
        channel: slot.channel,
        kind: slot.kind,
        title: idea.title,
        hook: idea.hook,
      };
    }),
  };
}
