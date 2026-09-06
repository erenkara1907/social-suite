// @vitest-environment node
//
// Gerçek Bluesky (bsky.social) çağrıları — görev metninin "gerçek bir hesap
// gerçekten bağlanıyor" kısıtını, `verify.live.test.ts`'in izlediği aynı
// desenle (`describe.skipIf`, env değişkeniyle kapı) kanıtlıyor.
//
//   BLUESKY_TEST_IDENTIFIER=<handle> BLUESKY_TEST_APP_PASSWORD=<app-password> \
//     RUN_BLUESKY_LIVE_TEST=1 npx vitest run lib/core/providers/bluesky.live.test.ts
//
// ⚠ Gerçek bir Bluesky hesabı + o hesap için oluşturulmuş bir UYGULAMA
// ŞİFRESİ gerekir (hesap şifresi DEĞİL) — bsky.app → Settings → App
// Passwords. Bu dosya hiçbir gönderi oluşturmaz, yalnızca oturum
// açar/doğrular/kapatır (17a FAZ A kapsamı — yayın FAZ B'nin işi).
import { describe, expect, it } from "vitest";
import { connectBluesky, refreshBlueskySession, revokeBlueskySession, verifyBlueskySession } from "./bluesky";

/** JWT'nin ikinci (payload) bölümünü çözer — imza DOĞRULANMAZ, yalnızca
 *  `exp`/`iat` okumak için. Yalnızca SÜRE hesaplamak için kullanılır, hiçbir
 *  çağıran bu değeri yetkilendirme kararı için GÜVENMEMELİ. */
function decodeJwtExpirySeconds(jwt: string): number | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
    exp?: number; iat?: number;
  };
  if (typeof payload.exp !== "number" || typeof payload.iat !== "number") return null;
  return payload.exp - payload.iat;
}

const RUN = process.env.RUN_BLUESKY_LIVE_TEST === "1";
const IDENTIFIER = process.env.BLUESKY_TEST_IDENTIFIER ?? "";
const APP_PASSWORD = process.env.BLUESKY_TEST_APP_PASSWORD ?? "";

describe.skipIf(!RUN)("bluesky — canlı (17a FAZ A)", () => {
  it("GERÇEK kimlik bilgisiyle oturum açar (ok:true, did/handle/accessJwt dolu)", async () => {
    const result = await connectBluesky(IDENTIFIER, APP_PASSWORD);
    console.log("[bluesky canlı] connect —", JSON.stringify({ ok: result.ok }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.session.did).toMatch(/^did:/);
    expect(result.session.handle.length).toBeGreaterThan(0);
    expect(result.session.accessJwt.length).toBeGreaterThan(0);
    expect(result.session.refreshJwt.length).toBeGreaterThan(0);
  });

  it("GEÇERSİZ uygulama şifresiyle net bir hatayla ok:false döner", async () => {
    const result = await connectBluesky(IDENTIFIER, "obviously-invalid-app-password");
    console.log("[bluesky canlı] connect (geçersiz) —", JSON.stringify(result));
    expect(result.ok).toBe(false);
  });

  it("verifyBlueskySession — saklanmış (taze) bir oturumu en ucuz uç noktayla doğrular", async () => {
    const connectResult = await connectBluesky(IDENTIFIER, APP_PASSWORD);
    if (!connectResult.ok) throw new Error("ön koşul: connectBluesky başarısız oldu");
    const verifyResult = await verifyBlueskySession(connectResult.session);
    console.log("[bluesky canlı] verify —", JSON.stringify(verifyResult));
    expect(verifyResult.ok).toBe(true);
  });

  it("revokeBlueskySession — oturumu sunucu tarafında iptal eder", async () => {
    const connectResult = await connectBluesky(IDENTIFIER, APP_PASSWORD);
    if (!connectResult.ok) throw new Error("ön koşul: connectBluesky başarısız oldu");
    const revokeResult = await revokeBlueskySession(connectResult.session);
    console.log("[bluesky canlı] revoke —", JSON.stringify(revokeResult));
    expect(revokeResult.ok).toBe(true);

    // ⚠ CANLI BULGU (17a FAZ A2) — `deleteSession` REFRESH JWT'yi öldürür,
    // ama halihazırda geçerli olan accessJwt kendi doğal ömrü (kısa,
    // dakikalar) dolana kadar `getSession` gibi çağrılarda ÇALIŞMAYA DEVAM
    // EDER (AT Protocol JWT'leri durum sorgusu olmadan kriptografik
    // doğrulanıyor — bir "kara liste" yok). Bu yüzden `verifyBlueskySession`
    // (getSession) revoke'dan hemen sonra hâlâ ok:true dönebilir; bu bir
    // hata DEĞİL, ölçülmüş bir gerçek. Disconnect'in asıl garantisi
    // `channel_credentials` satırının SİLİNMESİ (uygulamamız token'ı bir
    // daha asla kullanmaz) + refreshJwt'in artık işe yaramaması (aşağıda).
    const verifyRightAfterRevoke = await verifyBlueskySession(connectResult.session);
    console.log("[bluesky canlı] verify (iptalden HEMEN sonra, accessJwt hâlâ doğal ömründe) —",
      JSON.stringify(verifyRightAfterRevoke));

    // Asıl "oturum gerçekten öldü mü" kanıtı: refreshJwt bir daha ASLA
    // yeni bir accessJwt üretemez — sunucu bunu reddeder.
    const refreshAfterRevoke = await refreshBlueskySession(connectResult.session);
    console.log("[bluesky canlı] refresh (iptalden sonra) —", JSON.stringify(refreshAfterRevoke));
    expect(refreshAfterRevoke.ok).toBe(false);
  });

  it("A2.1 — accessJwt/refreshJwt ömrü (exp - iat, saniye)", async () => {
    const connectResult = await connectBluesky(IDENTIFIER, APP_PASSWORD);
    if (!connectResult.ok) throw new Error("ön koşul: connectBluesky başarısız oldu");
    const accessLifetimeSeconds = decodeJwtExpirySeconds(connectResult.session.accessJwt);
    const refreshLifetimeSeconds = decodeJwtExpirySeconds(connectResult.session.refreshJwt);
    // ⭐ Yalnızca SAYIYI logluyoruz — token'ın kendisi hiçbir zaman.
    console.log("[bluesky canlı] accessJwt ömrü (saniye) —", accessLifetimeSeconds);
    console.log("[bluesky canlı] accessJwt ömrü (saat) —", accessLifetimeSeconds ? (accessLifetimeSeconds / 3600).toFixed(2) : null);
    console.log("[bluesky canlı] refreshJwt ömrü (saniye) —", refreshLifetimeSeconds);
    console.log("[bluesky canlı] refreshJwt ömrü (gün) —", refreshLifetimeSeconds ? (refreshLifetimeSeconds / 86400).toFixed(2) : null);
    expect(accessLifetimeSeconds).not.toBeNull();
    expect(refreshLifetimeSeconds).not.toBeNull();
    // Belgelenmiş beklenti: access "dakikalar", refresh "çok daha uzun".
    expect(refreshLifetimeSeconds!).toBeGreaterThan(accessLifetimeSeconds!);
  });
});
