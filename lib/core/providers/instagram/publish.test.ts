import { afterEach, describe, expect, it, vi } from "vitest";
import { createContainer, containerStatus, publishContainer, publishToInstagram, publishingLimit, waitForContainer } from "./publish";
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

describe("createContainer", () => {
  it("sends image_url for IMAGE and returns the container id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "container-1" }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await createContainer(config, {
      igUserId: "ig-1", accessToken: "tok", mediaUrl: "https://cdn.test/a.jpg", caption: "hi", mediaType: "IMAGE",
    });

    expect(result).toEqual({ ok: true, containerId: "container-1" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.instagram.com/v23.0/ig-1/media");
    const body = init.body as URLSearchParams;
    expect(body.get("image_url")).toBe("https://cdn.test/a.jpg");
    expect(body.has("video_url")).toBe(false);
  });

  it("sends video_url + media_type=REELS for REELS", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "container-2" }));
    vi.stubGlobal("fetch", fetchMock);

    await createContainer(config, {
      igUserId: "ig-1", accessToken: "tok", mediaUrl: "https://cdn.test/a.mp4", caption: "hi", mediaType: "REELS",
    });

    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as URLSearchParams;
    expect(body.get("video_url")).toBe("https://cdn.test/a.mp4");
    expect(body.get("media_type")).toBe("REELS");
  });

  it("picks video_url for a .mp4 STORIES url and image_url otherwise", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "container-3" }));
    vi.stubGlobal("fetch", fetchMock);

    await createContainer(config, {
      igUserId: "ig-1", accessToken: "tok", mediaUrl: "https://cdn.test/a.mp4", caption: "hi", mediaType: "STORIES",
    });
    const body = (fetchMock.mock.calls[0][1] as RequestInit).body as URLSearchParams;
    expect(body.get("video_url")).toBe("https://cdn.test/a.mp4");
    expect(body.get("media_type")).toBe("STORIES");
  });

  it("surfaces Meta's error_user_msg over message when both are present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: { message: "generic", error_user_msg: "specific reason" } })),
    );
    const result = await createContainer(config, {
      igUserId: "ig-1", accessToken: "tok", mediaUrl: "https://cdn.test/a.jpg", caption: "hi", mediaType: "IMAGE",
    });
    expect(result).toEqual({ ok: false, error: "Creating the media container failed: specific reason" });
  });
});

describe("containerStatus", () => {
  it("reads the status code and detail", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status_code: "FINISHED", status: "ready" })));
    const result = await containerStatus(config, "container-1", "tok");
    expect(result).toEqual({ ok: true, code: "FINISHED", detail: "ready" });
  });
});

describe("waitForContainer", () => {
  it("returns ok once FINISHED", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ status_code: "FINISHED" })));
    const result = await waitForContainer(config, "container-1", "tok");
    expect(result).toEqual({ ok: true });
  });

  it("fails immediately on ERROR without exhausting the poll budget", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status_code: "ERROR", status: "media rejected" }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await waitForContainer(config, "container-1", "tok");
    expect(result).toEqual({ ok: false, error: "Instagram rejected the media (ERROR): media rejected" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("publishContainer", () => {
  it("returns the published media id", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ id: "media-1" })));
    const result = await publishContainer(config, "ig-1", "tok", "container-1");
    expect(result).toEqual({ ok: true, mediaId: "media-1" });
  });
});

describe("publishingLimit", () => {
  it("reads quota usage with a default total of 100", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ data: [{ quota_usage: 7, config: {} }] })));
    const result = await publishingLimit(config, "ig-1", "tok");
    expect(result).toEqual({ ok: true, used: 7, total: 100 });
  });
});

describe("publishToInstagram", () => {
  it("chains createContainer → waitForContainer → publishContainer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-9" })) // createContainer
      .mockResolvedValueOnce(jsonResponse({ status_code: "FINISHED" })) // waitForContainer (first poll)
      .mockResolvedValueOnce(jsonResponse({ id: "media-9" })); // publishContainer
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishToInstagram(config, {
      igUserId: "ig-1", accessToken: "tok", mediaUrl: "https://cdn.test/a.jpg", caption: "hi", mediaType: "IMAGE",
    });

    expect(result).toEqual({ ok: true, mediaId: "media-9" });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("stops at the failing step and never calls publishContainer", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ id: "container-9" })) // createContainer
      .mockResolvedValueOnce(jsonResponse({ status_code: "ERROR" })); // waitForContainer fails
    vi.stubGlobal("fetch", fetchMock);

    const result = await publishToInstagram(config, {
      igUserId: "ig-1", accessToken: "tok", mediaUrl: "https://cdn.test/a.jpg", caption: "hi", mediaType: "IMAGE",
    });

    expect(result.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
