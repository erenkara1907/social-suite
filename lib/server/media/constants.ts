/**
 * UGC boru hattı sabitleri — BIRLESIM_PLANI §12 adım 20 FAZ 0.3/B.
 *
 * Model adları/parametreleri KURULMADI — `lib/core/providers/kie.ts` ve
 * `fal.ts`'in zaten taşıdığı (sahne'den birebir gelen) sabitler kullanılıyor.
 * Bu dosya yalnızca BORU HATTININ KENDİSİNE ait, sahne'de karşılığı olmayan
 * değerleri taşır (poll bütçesi, motion prompt).
 */

/**
 * ⚠ FAZ 0.3 — Kling render süresi bu oturumda ÖLÇÜLDÜ (bkz. ADIM_20_RAPOR.md
 * "Gerçek Kling süresi" bölümü). Ölçüm + güvenli pay bu sabitleri belirledi;
 * `media_poll` bir vendor işi hâlâ "generating" derken KENDİSİNİ yeniden
 * kuyruğa alır (bkz. `lib/server/media/poll.ts`) — bu, `JOB_RETRY_POLICY.
 * media_poll.maxAttempts`'in (5 deneme, gerçek HATA'lar için) tüketilmesini
 * "hâlâ üretiliyor" durumuyla KARIŞTIRMAMAK için: üretim süren bir iş asla
 * "tükenmiş deneme" yüzünden ölü mektuba düşmez, yalnızca gerçek vendor
 * hataları (ağ, 4xx/5xx) o sayaca sayılır.
 */
export const MEDIA_POLL_CHAIN_INTERVAL_MS = 15_000;

/**
 * Zincirleme bu süreden sonra DURUR — ama `media_jobs` satırı `running`'de
 * kalır, `vendor_task_id` korunur (§12 adım 20 FAZ 0.3: "vendor tarafında
 * sonuç varsa sonradan toplanabilmeli"). Bu oturumda GERÇEK ölçüm (4 canlı
 * çalıştırma, ADIM_20_RAPOR.md "Gerçek Kling süresi" bölümü): persona_video
 * (Kling) 179/249/284sn, persona_image (Nano Banana Pro) 76/81/269sn,
 * lipsync (fal) 83sn — en yavaş adım Kling, 284sn (~4.7dk). 20 dakika bunun
 * ~4.2 katı bir pay; tek, muhafazakâr bir üst sınır tüm adımlar için yeterli
 * (lipsync/persona_image ölçülenden zaten daha hızlı).
 */
export const MEDIA_POLL_MAX_WAIT_MS = 20 * 60_000;

/**
 * ⚠ DOĞRULANMALI — Kling'e giden "prompt" işin İÇERİĞİYLE (hook/body)
 * eşleşmiyor, kasıtlı olarak. `lib/core/providers/kie.ts:206-224` yorumu:
 * Kling'in native lipsync'i yalnızca KENDİ ürettiği sesle çalışıyor, ve o
 * dudak hareketi zaten fal.ai adımında Türkçe sesle YENİDEN senkronlanıyor
 * (Sync Labs). Yani Kling'in İngilizce SÖYLEDİĞİ ŞEYİN anlamı önemsiz —
 * önemli olan doğal, sürekli bir ağız hareketi üretmesi. sahne'nin UI'ında
 * bu prompt kullanıcı tarafından elle giriliyordu (persona-studio.tsx);
 * otomatik boru hattında böyle bir giriş adımı yok, o yüzden sabit bir
 * şablon kullanılıyor. Gerçek kullanıcı geri bildirimiyle KALİBRE edilmeli.
 */
export const PERSONA_VIDEO_MOTION_PROMPT_EN =
  "A person speaks warmly and naturally to the camera, subtle hand gestures, " +
  "direct eye contact, relaxed confident energy, casual indoor setting.";
