import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { Brand } from "@/lib/core/brand/types";

/**
 * Sunucu tarafı guard'ları — BIRLESIM_PLANI §12 adım 7.
 *
 * ⭐ İkisi de KULLANICI OTURUMUYLA sorguluyor, service-role ile DEĞİL.
 * Sebep: `owns_brand()` politikaları ancak `auth.uid()` dolu olduğunda
 * çalışır. Service-role kullanmak RLS'i baypas eder ve politikaların
 * gerçekten koruyup korumadığını hiç öğrenemezdik — guard "çalışıyor"
 * görünürken RLS bozuk olabilirdi (§5, "tek bir kaçak varsa her şey açılır").
 *
 * Bunlar proxy.ts'in yerine geçmez, ONUN ALTINA ikinci bir kat koyar:
 * proxy `matcher`'ı bir rotayı kaçırırsa sayfa yine de korunur.
 */

/** `brands` satırı — `Brand` profil alanları + sahiplik/kimlik kolonları. */
export interface OwnedBrand extends Brand {
  id: string;
  timezone: string;
  isActive: boolean;
}

/** `brands` tablosundan okunan ham satır (snake_case kolonlar). */
interface BrandRow {
  id: string;
  name: string;
  industry: string;
  description: string;
  products: string;
  audience: string;
  voice: string;
  keywords: string;
  links: string;
  timezone: string;
  is_active: boolean;
}

const BRAND_COLUMNS =
  "id,name,industry,description,products,audience,voice,keywords,links,timezone,is_active";

function toOwnedBrand(row: BrandRow): OwnedBrand {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    description: row.description,
    products: row.products,
    audience: row.audience,
    voice: row.voice,
    keywords: row.keywords,
    links: row.links,
    timezone: row.timezone,
    isActive: row.is_active,
  };
}

/**
 * Oturumdaki kullanıcı; yoksa `/login`'e yönlendirir.
 *
 * ⚠ `?next=` parametresi burada YOK, çünkü bir Server Component istenen
 * yolu göremez (`headers()` pathname taşımaz). Kullanıcı buraya normalde
 * hiç düşmez: proxy.ts korumalı yolları `?next=` ile zaten çevirir. Bu yol
 * yalnızca `matcher`'ın kaçırdığı bir rota için bir emniyet kemeridir.
 *
 * ⭐ `cache()` — adım 8 A2. `(app)/layout.tsx` guard için çağırıyor, bir
 * sayfa marka/kullanıcı bilgisine tekrar ihtiyaç duyarsa AYNI istek
 * içinde ikinci bir çağrı bunu tekrar sorgulamaz; React bu render turunda
 * sonucu belleğe alır. Next'in "prop olarak geçir" öneremediği yerde
 * (ayrı `page.tsx` dosyaları arasında layout prop akıtamaz) resmi çözüm bu.
 */
export const requireUser = cache(async (): Promise<User> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) redirect("/login");
  return data.user;
});

/**
 * Kullanıcının markası; yoksa `/onboarding`'e yönlendirir.
 *
 * ⭐ NEDEN /onboarding VAR (B4): şemadaki `handle_new_user` trigger'ı
 * (`00_schema.sql:68-88`) yalnızca `profiles` satırı yaratıyor, `brands`
 * yaratmıyor. Bu bilinçli — §4e "bir hesap → çok marka" kararını verdi,
 * yani marka artık hesabın bir alanı değil, hesabın SAHİP OLDUĞU bir kayıt.
 * Trigger'ın boş bir marka uydurması bu kararı geri alırdı ve `/plan`'ın
 * girdisi olan profil boş doğardı. Bunun yerine ilk giriş marka adını sorar.
 *
 * Birden çok marka olduğunda ilki (en eski) seçilir. Marka seçici §11 S2'nin
 * organizasyon katmanıyla gelecek; bugün tek marka var.
 */
export const requireBrand = cache(async (): Promise<{ user: User; brand: OwnedBrand }> => {
  const user = await requireUser();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("brands")
    .select(BRAND_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<BrandRow>();

  // Sorgu HATASI ile "marka yok" AYNI ŞEY DEĞİL. Hata durumunda
  // /onboarding'e yollamak, Supabase kesintisini "yeni kullanıcı" gibi
  // gösterirdi — §9.1'in "sessiz düşme"si. Hata yükselir.
  if (error) {
    throw new Error(`brands okunamadı: ${error.message}`);
  }

  if (!data) redirect("/onboarding");

  return { user, brand: toOwnedBrand(data) };
});

/**
 * Marka yoksa yönlendirmeden `null` döner — `/onboarding` sayfasının
 * kendisi bunu kullanır (orada `requireBrand()` sonsuz döngü olurdu).
 */
export const currentBrand = cache(async (): Promise<OwnedBrand | null> => {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("brands")
    .select(BRAND_COLUMNS)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle<BrandRow>();

  if (error) throw new Error(`brands okunamadı: ${error.message}`);
  return data ? toOwnedBrand(data) : null;
});
