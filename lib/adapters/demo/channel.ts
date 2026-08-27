/**
 * ChannelPort — DEMO implementasyon.
 *
 * Demo kaynağı: `fixtures/channels.ts` — beş platform, biri bağlı.
 *
 * ⚠ `startConnect` gerçek bir OAuth URL'i DÖNDÜRMEZ. Demoda kullanıcıyı
 * Instagram'a yönlendirmek "hiçbir dış servis çağrılmaz" kriterini kırardı;
 * dönen yol uygulamanın kendi içinde kalan bir demo sayfası.
 */
import type { ChannelPort } from "@/lib/adapters/ports";
import { DEMO_CHANNELS } from "@/lib/adapters/demo/fixtures/channels";

const DEMO_CONNECT_PATH = "/channels?demo=connect";
const DEMO_OAUTH_STATE = "demo-state";

export const demoChannel: ChannelPort = {
  async list() {
    return DEMO_CHANNELS;
  },
  async startConnect(platform) {
    return {
      ok: true,
      data: {
        authorizeUrl: `${DEMO_CONNECT_PATH}&platform=${platform}`,
        state: DEMO_OAUTH_STATE,
      },
    };
  },
  async disconnect() {
    return { ok: true, data: undefined };
  },
};
