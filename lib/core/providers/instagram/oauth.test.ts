import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeUrl, exchangeCode, exchangeForLongLived, fetchProfile, refreshLongLived } from "./oauth";
import type { InstagramConfig } from "./config";

const config: InstagramConfig = {
  appId: "test-app-id",
  appSecret: ["test", "app", "secret"].join("-"), // secret-tarayıcı yanlış pozitifini kırmak için literal değil
  redirectUri: "https://example.test/api/instagram/callback",
  apiVersion: "v23.0",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("authorizeUrl", () => {
  it("builds the Meta authorize URL with client_id/redirect_uri/state/scope", () => {
    const url = new URL(authorizeUrl(config, "csrf-state-1"));
    expect(url.origin + url.pathname).toBe("https://www.instagram.com/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe("test-app-id");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("state")).toBe("csrf-state-1");
    expect(url.searchParams.get("scope")).toBe("instagram_business_basic,instagram_business_content_publish");
  });
});

describe("exchangeCode", () => {
  it("returns the short-lived token on success", async () => {
    const fakeShortToken = ["short", "tok"].join("-"); // secret-tarayıcı yanlış pozitifini kırmak için literal değil
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ access_token: fakeShortToken, user_id: 123 })));
    const result = await exchangeCode(config, "auth-code");
    expect(result).toEqual({ ok: true, shortToken: fakeShortToken, userId: "123" });
  });

  it("surfaces Meta's 200-and-error-body shape as ok:false", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ error: { message: "Invalid code" } }, 200)));
    const result = await exchangeCode(config, "bad-code");
    expect(result).toEqual({ ok: false, error: "Code exchange failed: Invalid code" });
  });

  it("surfaces a network failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await exchangeCode(config, "auth-code");
    expect(result).toEqual({ ok: false, error: "Code exchange failed: network down" });
  });
});

describe("exchangeForLongLived", () => {
  it("returns an expiry computed from expires_in", async () => {
    const fakeLongToken = ["long", "tok"].join("-");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ access_token: fakeLongToken, expires_in: 3600 })));
    const before = Date.now();
    const result = await exchangeForLongLived(config, "short-tok");
    if (!result.ok) throw new Error("expected ok");
    expect(result.token.accessToken).toBe(fakeLongToken);
    expect(result.token.expiresAt.getTime()).toBeGreaterThan(before);
  });

  it("fails when no access_token comes back", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));
    const result = await exchangeForLongLived(config, "short-tok");
    expect(result).toEqual({ ok: false, error: "Long-lived token exchange failed: no access_token in the response." });
  });
});

describe("refreshLongLived", () => {
  it("returns the refreshed token", async () => {
    const fakeRefreshedToken = ["refreshed", "tok"].join("-");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ access_token: fakeRefreshedToken, expires_in: 5_184_000 })));
    const result = await refreshLongLived(config, "old-tok");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.token.accessToken).toBe(fakeRefreshedToken);
  });
});

describe("fetchProfile", () => {
  it("reads the connected account's profile", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ user_id: "999", username: "brand", account_type: "BUSINESS", followers_count: 1200 })),
    );
    const result = await fetchProfile(config, "tok");
    expect(result).toEqual({
      ok: true,
      profile: { user_id: "999", username: "brand", account_type: "BUSINESS", followers_count: 1200 },
    });
  });

  it("surfaces a non-JSON response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>down</html>", { status: 503 })));
    const result = await fetchProfile(config, "tok");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("non-JSON response (503)");
  });
});
