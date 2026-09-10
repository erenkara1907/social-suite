import { describe, expect, it, vi } from "vitest";
import type { InstagramConfig } from "@/lib/core/providers/instagram/config";

const refreshLongLived = vi.fn();
vi.mock("@/lib/core/providers/instagram/oauth", () => ({ refreshLongLived }));

const { usableInstagramToken } = await import("./tokens");

// secret-tarayıcı yanlış pozitifini kırmak için literal değil.
const FAKE_APP_SECRET = ["app", "secret"].join("-");
const FAKE_CURRENT_TOKEN = ["current", "token"].join("-");
const FAKE_REFRESHED_TOKEN = ["refreshed", "token"].join("-");

const config: InstagramConfig = {
  appId: "app-id", appSecret: FAKE_APP_SECRET, redirectUri: "https://example.test/cb", apiVersion: "v23.0",
};

function fakeAdmin(updateResult: { error: { message: string } | null }) {
  const eq = vi.fn().mockResolvedValue(updateResult);
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { admin: { from } as unknown as import("@supabase/supabase-js").SupabaseClient, update, eq };
}

describe("usableInstagramToken", () => {
  it("returns the stored token unchanged when well within its window", async () => {
    const { admin } = fakeAdmin({ error: null });
    const farFuture = new Date(Date.now() + 30 * 86_400_000).toISOString();

    const result = await usableInstagramToken(admin, config, {
      channel_id: "chan-1", access_token: FAKE_CURRENT_TOKEN, token_expires_at: farFuture,
    });

    expect(result).toEqual({ ok: true, accessToken: FAKE_CURRENT_TOKEN, refreshed: false });
    expect(refreshLongLived).not.toHaveBeenCalled();
  });

  it("reports expired without attempting a refresh", async () => {
    const { admin } = fakeAdmin({ error: null });
    const past = new Date(Date.now() - 86_400_000).toISOString();

    const result = await usableInstagramToken(admin, config, {
      channel_id: "chan-1", access_token: FAKE_CURRENT_TOKEN, token_expires_at: past,
    });

    expect(result).toEqual({ ok: false, error: "Instagram bağlantısının süresi doldu. Kanalı yeniden bağla.", expired: true });
    expect(refreshLongLived).not.toHaveBeenCalled();
  });

  it("refreshes and persists when close to expiry", async () => {
    const { admin, update, eq } = fakeAdmin({ error: null });
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const newExpiry = new Date(Date.now() + 60 * 86_400_000);
    refreshLongLived.mockResolvedValueOnce({ ok: true, token: { accessToken: FAKE_REFRESHED_TOKEN, expiresAt: newExpiry } });

    const result = await usableInstagramToken(admin, config, {
      channel_id: "chan-1", access_token: FAKE_CURRENT_TOKEN, token_expires_at: soon,
    });

    expect(result).toEqual({ ok: true, accessToken: FAKE_REFRESHED_TOKEN, refreshed: true });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ access_token: FAKE_REFRESHED_TOKEN }));
    expect(eq).toHaveBeenCalledWith("channel_id", "chan-1");
  });

  it("surfaces a refresh failure without writing to the DB", async () => {
    const { admin, update } = fakeAdmin({ error: null });
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    refreshLongLived.mockResolvedValueOnce({ ok: false, error: "Meta rejected the refresh" });

    const result = await usableInstagramToken(admin, config, {
      channel_id: "chan-1", access_token: FAKE_CURRENT_TOKEN, token_expires_at: soon,
    });

    expect(result).toEqual({ ok: false, error: "Meta rejected the refresh", expired: false });
    expect(update).not.toHaveBeenCalled();
  });

  it("surfaces a DB write failure after a successful upstream refresh", async () => {
    const { admin } = fakeAdmin({ error: { message: "connection reset" } });
    const soon = new Date(Date.now() + 3 * 86_400_000).toISOString();
    refreshLongLived.mockResolvedValueOnce({
      ok: true, token: { accessToken: FAKE_REFRESHED_TOKEN, expiresAt: new Date(Date.now() + 60 * 86_400_000) },
    });

    const result = await usableInstagramToken(admin, config, {
      channel_id: "chan-1", access_token: FAKE_CURRENT_TOKEN, token_expires_at: soon,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("connection reset");
  });
});
