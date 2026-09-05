# UGC boru hattı maliyet notu

Tarih: 2026-09-05
Kaynak: `docs/BIRLESIM_PLANI.md` §12 adım 20.5 FAZ C3 · birim maliyetler
`docs/ADIM_20_RAPOR.md`nin "Bu oturumda harcanan gerçek vendor kaynağı"
bölümünde CANLI ölçüldü (`lib/core/providers/kie.ts`'in ölçülmüş sabitleri:
`PERSONA_IMAGE_CREDITS=24`, `PERSONA_VIDEO_CREDITS_PER_SECOND.pro=27`,
`LIPSYNC_CREDITS_PER_SECOND=27` @ Kie tarafında; fal ayrı: `~$5/dk`).

---

## 1. Birim maliyetler (ölçülmüş, canlı)

| Adım | Vendor | Birim | Maliyet | Kaynak |
|---|---|---|---|---|
| `persona_image` | Kie (Nano Banana Pro) | kare başına | **24 kredi** | ölçülmüş, 3 canlı çalıştırma |
| `persona_video` | Kie (Kling 3.0, `pro`, 5sn) | klip başına | **135 kredi** (27 kredi/sn × 5sn) | ölçülmüş, 5 canlı çalıştırma |
| `voice` | ElevenLabs (TTS) | — | **0 kredi ek** — abonelik dahilinde | ölçülmüş (Carino Pizza aboneliği) |
| `lipsync` | fal (sync-lipsync v3) | dakika başına | **~$5/dk** → 5sn klip ≈ **$0.42** | ölçülmüş, 1 canlı çalıştırma |

**`persona_image` bir video maliyeti DEĞİL, bir persona maliyeti.** Ürün
tasarımı gereği (`app/(app)/studio/actions.ts` `generateUgcAction`) her video
üretimi `persona_video`'dan başlar — `persona_image` yalnızca bir persona
İLK oluşturulduğunda, BİR KEZ çalışır. Aşağıdaki "video başına" tutarlar bu
yüzden `persona_image`'i İÇERMEZ; ayrı bir "kurulum maliyeti" satırında.

### Video başına marjinal maliyet

| Bileşen | Kredi/tutar |
|---|---|
| `persona_video` | 135 kredi |
| `voice` | 0 kredi (abonelik) |
| `lipsync` | ~$0.42 |
| **Toplam (kredi cinsinden)** | **135 kredi + ~$0.42** |

⚠ **Kredinin dolar karşılığı bu belgede YOK.** Kie'nin kredi/$ oranı bu
oturumda doğrulanamadı — **Kie panelinden (kie.ai/dashboard veya faturalama
sayfası) doldurulmalı.** Aşağıdaki tablolar bu yüzden kredi/persona/$ (yalnızca
fal için) cinsinden ayrı tutuluyor; uydurma bir $/kredi çarpanı KULLANILMADI.

---

## 2. Aylık tüketim senaryoları

Varsayımlar (açıkça işaretli):
- Her video 5sn klip, `pro` modu (`PERSONA_VIDEO_DURATION_DEFAULT`/`_MODE_DEFAULT`).
- **1 persona** ayda tüm videoları üretiyor varsayılıyor (persona_image bu
  yüzden aylık toplamda BİR KEZ, 24 kredi). Birden fazla persona
  kullanılıyorsa bu satır `× persona sayısı` ile çarpılır — ürün bunu
  zorunlu kılmıyor, yalnızca bu tablonun basitleştirici varsayımı.
- Script uzunluğu fal `cut_off` sınırının (65 karakter, `maxScriptCharsForClip`)
  altında — ADIM_20.5 FAZ A'nın ön kontrolü zaten bunu garanti ediyor,
  aksi hâlde video hiç üretilmez.

| Aylık video sayısı | `persona_image` (bir kez) | `persona_video` (kredi) | Toplam Kie kredisi | `lipsync` (fal, $) |
|---|---|---|---|---|
| 10  | 24 kredi | 10 × 135 = 1.350 | **1.374 kredi** | 10 × $0.42 = **$4.20** |
| 30  | 24 kredi | 30 × 135 = 4.050 | **4.074 kredi** | 30 × $0.42 = **$12.60** |
| 60  | 24 kredi | 60 × 135 = 8.100 | **8.124 kredi** | 60 × $0.42 = **$25.20** |

**Kie kredisinin $ karşılığı:** ⚠ **BOŞ — Kie panelinden doldurulacak.**
Doldurulduğunda yukarıdaki "Toplam Kie kredisi" sütunu tek bir çarpma ile
$ karşılığına çevrilir (`toplam_kredi × ($/kredi)`); bu notun geri kalanı
değişmez.

### ElevenLabs (voice) kota kontrolü — kredi değil ama gerçek bir sınır

`getVoiceQuota()`'nun okuduğu `/v1/user/subscription`, karakter cinsinden
aylık kota döndürüyor (kod yorumu: ücretsiz kademe 10.000 karakter/ay).
Video başına script en fazla 65 karakter (fal `cut_off` sınırı) —

| Aylık video sayısı | En kötü durum karakter tüketimi (65 × video) |
|---|---|
| 10  | 650 |
| 30  | 1.950 |
| 60  | 3.900 |

60 video/ay bile ücretsiz kademenin (10.000 karakter) **%39**'unu kullanıyor
— marjinal ElevenLabs maliyeti bu ölçekte **$0** kalmaya devam eder,
kota aşımı riski yalnızca çok daha yüksek hacimde (>150 video/ay, ücretsiz
kademede) gündeme gelir.

---

## 3. Duyarlılık — `mode: "std"` seçilseydi

`PERSONA_VIDEO_MODE_DEFAULT = "pro"` sabit; `std` mod `20 kredi/sn` (pro'nun
`27`'sine karşı, `PERSONA_VIDEO_CREDITS_PER_SECOND` tablosu, `kie.ts`). Aynı
5sn klip için `std` → 100 kredi (pro'nun 135'ine karşı, **%26 daha ucuz**).
Bu bir öneri DEĞİL — `kie.ts`'in kendi yorumu ("pro'nun `sound: true`
gerektirdiği, native lip-sync'i tetiklediği") `pro`'yu kalite gerekçesiyle
seçiyor; burada yalnızca sayı referans olsun diye not edildi.

---

## Kalan boşluk

Kie kredisinin dolar karşılığı bu notta **bilinçli olarak boş** bırakıldı —
bkz. yukarıdaki ⚠ işaretleri. Doldurma kaynağı: Kie.ai kontrol paneli
(hesap/faturalama sayfası, `getCredits()`'in okuduğu `/chat/credit`
uç noktasının kendisi $ döndürmüyor, yalnızca ham kredi bakiyesi).
