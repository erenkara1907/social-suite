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
import { connectBluesky, revokeBlueskySession, verifyBlueskySession } from "./bluesky";

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

    // İptalden sonra AYNI accessJwt artık geçersiz olmalı.
    const verifyAfterRevoke = await verifyBlueskySession(connectResult.session);
    console.log("[bluesky canlı] verify (iptalden sonra) —", JSON.stringify(verifyAfterRevoke));
    expect(verifyAfterRevoke.ok).toBe(false);
  });
});
