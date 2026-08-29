import { describe, expect, it } from "vitest";
import { enqueue } from "@/lib/server/jobs/enqueue";

/**
 * Derleme-zamanı kanıtı — BIRLESIM_PLANI §12 adım 12 FAZ A doğrulama:
 * "tip uyuşmazlığı derleme hatası veriyor (kanıt göster)".
 *
 * Bu fonksiyon hiçbir yerde ÇAĞRILMAZ (`enqueue()` `server-only` + gerçek
 * Supabase oturumu ister) — yalnızca `npx tsc --noEmit`'in bu dosyayı da
 * taradığını ve aşağıdaki YANLIŞ kullanımların GERÇEKTEN hata verdiğini
 * kanıtlar. `@ts-expect-error` bir sonraki satır hata VERMEZSE kendisi hata
 * olur — yani tip gevşetilip yanlışlıkla derlenir hâle gelirse bu dosya da
 * kırılır, sessizce geçmez.
 */
function neverCalled() {
  // ✅ doğru kullanım — derlenir.
  void enqueue("brand-id", "publish", { contentItemId: "content-id" });

  // ❌ "publish" payload'u yalnızca contentItemId kabul eder, theme YOK.
  // @ts-expect-error — theme, PublishPayload'da yok
  void enqueue("brand-id", "publish", { theme: "yanlış alan" });

  // ❌ "plan_generate" beş alanlı bir payload ister; boş obje eksik.
  // @ts-expect-error — {} PlanGeneratePayload değil
  void enqueue("brand-id", "plan_generate", {});

  // ❌ kind'ın kendisi JobKind birliğinde yok.
  // @ts-expect-error — "not_a_real_kind" JobKind değil
  void enqueue("brand-id", "not_a_real_kind", {});
}

describe("enqueue — derleme zamanı tip güvenliği", () => {
  it("bu dosya tsc --noEmit'i hatasız geçerse kanıt geçerlidir", () => {
    // Asıl doğrulama yukarıdaki @ts-expect-error yorumlarında; burada
    // yalnızca dosyanın test koşucusu tarafından da taranıp derlendiğini
    // teyit ediyoruz (fonksiyon çağrılmıyor, yalnızca referans alınıyor).
    expect(typeof neverCalled).toBe("function");
  });
});
