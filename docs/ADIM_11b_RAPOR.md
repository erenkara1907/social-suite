# ADIM 11b RAPORU — ertelenen ekranlar + demo senkronizasyonu

Tarih: 2026-09-05 · Kaynak: `docs/BIRLESIM_PLANI.md` · önceki oturum: `docs/ADIM_20-5_RAPOR.md`

Bu belge faz faz yazılıyor; her fazın sonunda ilgili bölüm eklenip commit
atılıyor. Aşağıdaki FAZ 0 bölümü ilk commit.

---

## FAZ 0 — Devralınan borç taraması

### 0.1 — `"use server"` denetimi

Altı dosya bulundu (`grep -rl '"use server"' app lib`). Hepsi tek tek okundu:
her biri **yalnızca async fonksiyon** export ediyor (interface'ler sorun
değil — derleme zamanında silinir, runtime export'u yalnızca fonksiyonlar).
C1'in bulduğu hata sınıfı (bir sabit/obje export edilip Next'in "a 'use
server' file can only export async functions" ile çökmesi) **başka hiçbir
dosyada yok** — 20.5'te düzeltilen üçü (`plan/actions.ts`,
`studio/actions.ts`, `studio/personas/actions.ts`) zaten temizdi, kalan üçü
(`settings/actions.ts`, `settings/integrations-actions.ts`,
`onboarding/actions.ts`) baştan temiz yazılmış.

| Dosya | Export edilen değerler | Durum |
|---|---|---|
| `app/(app)/settings/actions.ts` | `SettingsState` (interface), `saveBrandAction` (async fn) | ✅ temiz |
| `app/(app)/settings/integrations-actions.ts` | `CredentialActionState`, `VerifyActionState` (interface), `saveCredentialAction`, `deleteCredentialAction`, `verifyCredentialAction` (async fn) | ✅ temiz |
| `app/(app)/studio/personas/actions.ts` | `CreatePersonaActionState` (interface), `createPersonaAction` (async fn) | ✅ temiz (20.5'te düzeltildi) |
| `app/(app)/studio/actions.ts` | `GenerateUgcActionState` (interface), `generateUgcAction` (async fn) | ✅ temiz (20.5'te düzeltildi) |
| `app/(app)/plan/actions.ts` | `GeneratePlanActionState`, `RequestUgcActionState` (interface), `generatePlanAction`, `requestUgcAction` (async fn) | ✅ temiz (20.5'te düzeltildi) |
| `app/(auth)/onboarding/actions.ts` | `OnboardingState` (interface), `createBrandAction` (async fn) | ✅ temiz |

**Sonuç: sıfır ek ihlal.** Modül seviyesinde tanımlanan yardımcı sabitler
(`MANAGED_PROVIDERS`, `KEY_PREFIX_HINTS` — `integrations-actions.ts`)
export EDİLMİYOR, yalnızca dosya içi kullanım — bu da güvenli.

### 0.2 — Tıklanmamış yollar envanteri

`app/(app)/` altındaki (+ sidebar'ın logout'u) her etkileşimli öğe ve onu
GERÇEKTEN tetikleyen test:

| Öğe | Dosya | Server action | Gerçek tıklamayla test eden | Durum |
|---|---|---|---|---|
| Giriş formu | `(auth)/login` | Supabase Auth | `journey.spec.ts`, `plan.spec.ts`, vd. (hepsi giriş yapıyor) | ✅ |
| Kayıt formu | `(auth)/signup` | Supabase Auth | `journey.spec.ts` | ✅ |
| Marka oluştur formu | `onboarding` | `createBrandAction` | `journey.spec.ts` | ✅ |
| Marka profili formu "Kaydet" | `settings-brand-form.tsx` | `saveBrandAction` | `settings.spec.ts` | ✅ |
| Entegrasyon "Anahtarı gir" | `settings-integrations-form.tsx` | `saveCredentialAction` | `settings-integrations.spec.ts` | ✅ |
| Entegrasyon "Sil" | `settings-integrations-form.tsx` | `deleteCredentialAction` | `settings-integrations.spec.ts` | ✅ |
| **Entegrasyon "Test et"** | `settings-integrations-form.tsx` | `verifyCredentialAction` | **YOK** — spec bilinçli olarak `voyage` (VERIFIERS'ta yok) kullanıyor, doğrulama düğmesine hiç basmıyor | ❌ **BOŞLUK** |
| "Planı üret" | `plan-view.tsx` | `generatePlanAction` | demo modda `disabled`; canlı tıklama testi yok (kuyruğa yazma, ucuz — LLM çağrısı yapmaz) | ⚠ düşük öncelik (kuyruk zaten `enqueue.type-check.test.ts` + worker testleriyle kaplı; UI düğmesi ayrı) |
| UGC seç → "İste" | `plan-view.tsx` | `requestUgcAction` | `plan-studio-bridge.spec.ts` (gerçek tıklama) | ✅ |
| **"Yeni persona" formu "Oluştur"** | `persona-studio-view.tsx` | `createPersonaAction` | **YOK** — `plan-studio-bridge.spec.ts` personayı service-role ile DOĞRUDAN ekliyor, formu hiç kullanmıyor | ❌ **BOŞLUK** |
| **"Üret" (UGC video)** | `studio-view.tsx` | `generateUgcAction` | **YOK** — para harcayan yol, hiçbir e2e onu tıklamıyor | ❌ **BOŞLUK** (gerçek üretim kasıtlı olarak test edilmeyecek — aşağıda FAZ D) |
| Ölü mektup listesi | `jobs-queue-status.tsx` | — (salt okunur) | `jobs-queue-status.spec.ts` | ✅ |
| Kuyruk "Onayla/Ertele/İptal" | `queue-view.tsx` | — | `disabled` (bilinçli, §12 adım 17'nin işi) | N/A — tıklanamaz |
| **Çıkış yap** | `sidebar.tsx` | `/logout` route handler | **YOK** — hiçbir e2e çıkış düğmesine basmıyor (testler oturumu yeniden giriş ile yönetiyor) | ❌ boşluk, düşük risk (route handler basit bir `signOut()+redirect`, veri yazmıyor) |

**Boşluk özeti — FAZ D'nin girdisi (para/DB açısından öncelik sırasıyla):**
1. `createPersonaAction` — DB'ye YENİ satır yazıyor + `persona_image` işini
   kuyruğa sokuyor (dolaylı maliyet). **Yüksek öncelik.**
2. `verifyCredentialAction` — gerçek vendor'a HTTP isteği atıyor (ucuz ama
   dış istek + rate-limit RPC'si + `record_provider_verification` yazımı).
   **Orta öncelik.**
3. `generateUgcAction` — GERÇEK para harcıyor (Kie/ElevenLabs/fal). Gerçek
   üretimi asla e2e'de tetiklemeyeceğiz; ama **ön kontrol (preflight) dalı**
   ücretsiz ve test edilebilir — düğmeye basılıp `videoPort.start()`'a hiç
   girilmeden dönen hata yollarını kapsayabiliriz. **Orta öncelik.**
4. Çıkış düğmesi — düşük risk, route handler zaten basit. **Düşük öncelik.**

Bu liste FAZ D'de kapatılacak.
