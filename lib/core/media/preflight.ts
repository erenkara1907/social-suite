/**
 * `ugc_pipeline` ön kontrol kuralları — BIRLESIM_PLANI §12 adım 20.5 FAZ A.
 *
 * ⭐ SAF — hiçbir DB/HTTP okuması yapmaz, yalnızca zaten okunmuş verilerle
 * karar verir. Bu, TEK karar mantığının hem iş kuyruğu tarafında
 * (`lib/server/media/preflight.ts`, service-role okumasıyla, iş
 * başlamadan) hem de tarayıcı tarafında (`/studio`'nun kullanıcı
 * oturumuyla okuduğu veriyle, kullanıcı "üret"e basmadan ÖNCE) BİREBİR AYNI
 * mesajları üretmesini sağlar — iki yerde iki ayrı "hangi kontrol düştü"
 * listesi İCAT EDİLMEDİ (DRY).
 *
 * ADIM_20'nin öğrettiği ders: `persona_video` (Kling, pahalı) iki kez
 * ödendi çünkü zincirin SONUNDAKİ ucuz kontroller (metin uzunluğu,
 * default_voice_id) yalnızca `voice` adımına gelindiğinde çalışıyordu.
 * Bu modül "geriye kalan zincirin TAMAMI" için gereken önkoşulları, ilk
 * adım dispatch edilmeden ÖNCE toplu değerlendirir.
 */
import type { MediaJobStep } from "@/lib/core/types";

export const UGC_PIPELINE_STEP_ORDER: MediaJobStep[] = ["persona_image", "persona_video", "voice", "lipsync"];

export type UgcVendor = "kie" | "elevenlabs" | "fal";

/** `post_image` bu boru hattının parçası DEĞİL (bkz. `lib/adapters/live/
 *  video.ts`'in aynı gerekçeli `stepMeta()`'sı) — `ugc_pipeline` işleyicisi
 *  ona hiç ulaşmaz, o yüzden `null` döner (savunma amaçlı, pratikte çağrılmaz). */
export function ugcStepVendor(step: MediaJobStep): UgcVendor | null {
  switch (step) {
    case "persona_image":
    case "persona_video":
      return "kie";
    case "voice":
      return "elevenlabs";
    case "lipsync":
      return "fal";
    default:
      return null;
  }
}

export type PreflightCheck = "credential" | "persona_image" | "voice_id" | "script_length";

export interface PreflightIssue {
  check: PreflightCheck;
  vendor?: UgcVendor;
  message: string;
}

export interface PreflightFacts {
  /** Bu dispatch'in başlayacağı adım — zincirin GERİ KALANI buradan hesaplanır. */
  fromStep: MediaJobStep;
  /** `null` → bağımsız `persona_image` (yeni persona akışı); zincir orada durur. */
  contentItemId: string | null;
  /** Her `UgcVendor` için markanın o sağlayıcıda çalışır bir anahtarı var mı. */
  credentialConfigured: Record<UgcVendor, boolean>;
  personaImageAssetId: string | null;
  personaDefaultVoiceId: string | null;
  /** `contentItemId` doluysa içeriğin (hook+body) birleşmiş, kırpılmış metni. */
  script: string | null;
  /** fal'in `cut_off` modu bu karakter sayısını AŞAN metni ortadan keser. */
  maxScriptChars: number;
}

/** Bu adımdan zincirin sonuna kadar hangi adımlar KALIYOR. `contentItemId`
 *  yoksa (bağımsız `persona_image`) zincir hiç ilerlemez — yalnızca o adım. */
export function remainingUgcSteps(fromStep: MediaJobStep, contentItemId: string | null): MediaJobStep[] {
  if (!contentItemId) return [fromStep];
  const startIndex = UGC_PIPELINE_STEP_ORDER.indexOf(fromStep);
  return startIndex >= 0 ? UGC_PIPELINE_STEP_ORDER.slice(startIndex) : [fromStep];
}

/** Sıfır IO — girdi olarak verilen olgulardan (facts) ihlal listesi üretir. */
export function evaluateUgcPreflight(facts: PreflightFacts): PreflightIssue[] {
  const issues: PreflightIssue[] = [];
  const remaining = remainingUgcSteps(facts.fromStep, facts.contentItemId);

  const vendorsNeeded = Array.from(
    new Set(remaining.map((step) => ugcStepVendor(step)).filter((v): v is UgcVendor => v !== null)),
  );
  for (const vendor of vendorsNeeded) {
    if (!facts.credentialConfigured[vendor]) {
      issues.push({
        check: "credential",
        vendor,
        message: `${vendor} anahtarı yapılandırılmamış (kalan adımlar için gerekli: ${remaining.join(", ")})`,
      });
    }
  }

  if (remaining.includes("persona_video") && !facts.personaImageAssetId) {
    issues.push({ check: "persona_image", message: "persona henüz görsel üretmedi — persona_video atlanamaz" });
  }

  if (remaining.includes("voice")) {
    if (!facts.personaDefaultVoiceId) {
      issues.push({ check: "voice_id", message: "personanın varsayılan sesi yok — /studio/personas'tan atanmalı" });
    }
    if (facts.script && facts.script.length > facts.maxScriptChars) {
      issues.push({
        check: "script_length",
        message:
          `metin ${facts.script.length} karakter, sınır ${facts.maxScriptChars} — ` +
          `fal cut_off modu klip süresinden uzun sesin SONUNU keser`,
      });
    }
  }

  return issues;
}
