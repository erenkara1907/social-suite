import { describe, expect, it, vi } from "vitest";

const resolveProviderCredential = vi.fn();
vi.mock("@/lib/server/credentials", () => ({ resolveProviderCredential }));

const { resolveInstagramConfig } = await import("./resolve-config");

// secret-tarayıcı yanlış pozitifini kırmak için literal değil.
const FAKE_APP_SECRET = ["app", "secret", "value"].join("-");

describe("resolveInstagramConfig", () => {
  it("maps a resolved brand credential to InstagramConfig", async () => {
    resolveProviderCredential.mockResolvedValueOnce({
      apiKey: FAKE_APP_SECRET,
      config: { app_id: "12345", redirect_uri: "https://example.test/api/instagram/callback", api_version: "v23.0" },
      source: "brand",
    });

    const result = await resolveInstagramConfig("brand-1");
    expect(result).toEqual({
      ok: true,
      config: {
        appId: "12345",
        appSecret: FAKE_APP_SECRET,
        redirectUri: "https://example.test/api/instagram/callback",
        apiVersion: "v23.0",
      },
    });
  });

  it("defaults apiVersion when config omits it", async () => {
    resolveProviderCredential.mockResolvedValueOnce({
      apiKey: FAKE_APP_SECRET,
      config: { app_id: "12345", redirect_uri: "https://example.test/api/instagram/callback" },
      source: "env",
    });

    const result = await resolveInstagramConfig("brand-1");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.config.apiVersion).toBe("v23.0");
  });

  it("fails when no apiKey (app secret) is resolvable", async () => {
    resolveProviderCredential.mockResolvedValueOnce({
      apiKey: null,
      config: { app_id: "12345", redirect_uri: "https://example.test/api/instagram/callback" },
      source: "none",
    });

    const result = await resolveInstagramConfig("brand-1");
    expect(result).toEqual({ ok: false, error: "Instagram için App ID/Secret/Redirect URI eksik." });
  });

  it("fails when app_id is blank", async () => {
    resolveProviderCredential.mockResolvedValueOnce({
      apiKey: FAKE_APP_SECRET,
      config: { app_id: "", redirect_uri: "https://example.test/api/instagram/callback" },
      source: "brand",
    });

    const result = await resolveInstagramConfig("brand-1");
    expect(result.ok).toBe(false);
  });

  it("fails when redirect_uri is blank", async () => {
    resolveProviderCredential.mockResolvedValueOnce({
      apiKey: FAKE_APP_SECRET,
      config: { app_id: "12345", redirect_uri: "" },
      source: "brand",
    });

    const result = await resolveInstagramConfig("brand-1");
    expect(result.ok).toBe(false);
  });
});
