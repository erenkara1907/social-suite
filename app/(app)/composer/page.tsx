import { isDemo } from "@/lib/adapters";
import { requestModeOverrides } from "@/lib/server/mode";
import { requireBrand } from "@/lib/server/auth";
import { createClient } from "@/lib/supabase/server";
import { ComposerView, type ComposerParentOption } from "@/components/app/composer-view";

export const metadata = { title: "Düzenleyici" };

interface ParentCandidateRow {
  id: string;
  title: string;
  chain_position: number;
}

/**
 * `/composer` — BIRLESIM_PLANI §12 adım 11b FAZ C.
 *
 * Elle içerik yazma ekranı — AI üretmiyor, insan yazıyor. Kaydetme yolunun
 * KENDİSİ (`actions.ts`) demo/live mod ayrımına HİÇ girmiyor (gerekçe orada).
 *
 * ⭐ Aynı sebeple "devam zinciri" seçici de `port("content")` (mod'a bağlı)
 * ÜZERİNDEN OKUMAZ — demo modda bu port fixture döndürür, ve o fixture
 * id'leri gerçek `content_items` tablosunda YOK. Kullanıcı bir demo satırını
 * ebeveyn seçse `content_chain_guard` trigger'ı ("parent_id bulunamadi")
 * ile ANINDA patlardı — composer'ın kendi gerçek yazdığı satırlar da zaten
 * demo modda bu listede hiç GÖRÜNMEZDİ. Çözüm: yazma neyse okuma da o —
 * oturumun kendi istemcisiyle GERÇEK `content_items`'ı okur.
 *
 * Guard'ı `(app)/layout.tsx` sağlıyor; bu dosyada kontrol YOK.
 */
export default async function Page() {
  const overrides = await requestModeOverrides();
  const { brand } = await requireBrand();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("content_items")
    .select("id,title,chain_position")
    .eq("brand_id", brand.id)
    .neq("status", "archived")
    .order("title", { ascending: true })
    .returns<ParentCandidateRow[]>();
  if (error) throw new Error(`content_items (devam zinciri seçici) okunamadı: ${error.message}`);

  const parentOptions: ComposerParentOption[] = (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    chainPosition: row.chain_position,
  }));

  return <ComposerView parentOptions={parentOptions} ugcDisabled={isDemo("video", overrides)} />;
}
