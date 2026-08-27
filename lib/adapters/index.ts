/**
 * BIRLESIM_PLANI §9.1 — adapter fabrikası.
 *
 * Uygulamanın veri katmanına tek giriş noktası. Bir ekran ne `demo/` ne de
 * `live/` dizininden doğrudan import eder; `port("content")` der ve hangi
 * implementasyonun geldiğini bilmez.
 *
 * Mod çözümü ayrı bir dosyada (`mode.ts`) — fabrikanın bildiği tek şey
 * "hangi implementasyon", "neden o implementasyon" değil.
 */
import { resolveMode, type Mode, type ModeOverrides } from "@/lib/adapters/mode";
import { PORT_NAMES, type PortMap, type PortName } from "@/lib/adapters/ports";

import { demoBrand } from "@/lib/adapters/demo/brand";
import { demoChannel } from "@/lib/adapters/demo/channel";
import { demoContent } from "@/lib/adapters/demo/content";
import { demoCopy } from "@/lib/adapters/demo/copy";
import { demoDedupe } from "@/lib/adapters/demo/dedupe";
import { demoImage } from "@/lib/adapters/demo/image";
import { demoMetrics } from "@/lib/adapters/demo/metrics";
import { demoPlanner } from "@/lib/adapters/demo/planner";
import { demoPublisher } from "@/lib/adapters/demo/publisher";
import { demoStorage } from "@/lib/adapters/demo/storage";
import { demoVideo } from "@/lib/adapters/demo/video";
import { demoVoice } from "@/lib/adapters/demo/voice";

import { liveBrand } from "@/lib/adapters/live/brand";
import { liveChannel } from "@/lib/adapters/live/channel";
import { liveContent } from "@/lib/adapters/live/content";
import { liveCopy } from "@/lib/adapters/live/copy";
import { liveDedupe } from "@/lib/adapters/live/dedupe";
import { liveImage } from "@/lib/adapters/live/image";
import { liveMetrics } from "@/lib/adapters/live/metrics";
import { livePlanner } from "@/lib/adapters/live/planner";
import { livePublisher } from "@/lib/adapters/live/publisher";
import { liveStorage } from "@/lib/adapters/live/storage";
import { liveVideo } from "@/lib/adapters/live/video";
import { liveVoice } from "@/lib/adapters/live/voice";

/**
 * Her port için iki implementasyon. `Record<PortName, ...>` olduğu için yeni
 * bir port `PORT_NAMES`'e eklendiğinde bu tablo derlemez — port eklenip
 * implementasyonu unutulamaz.
 */
const REGISTRY: { [N in PortName]: Record<Mode, PortMap[N]> } = {
  content: { demo: demoContent, live: liveContent },
  planner: { demo: demoPlanner, live: livePlanner },
  copy: { demo: demoCopy, live: liveCopy },
  image: { demo: demoImage, live: liveImage },
  video: { demo: demoVideo, live: liveVideo },
  voice: { demo: demoVoice, live: liveVoice },
  publisher: { demo: demoPublisher, live: livePublisher },
  metrics: { demo: demoMetrics, live: liveMetrics },
  channel: { demo: demoChannel, live: liveChannel },
  brand: { demo: demoBrand, live: liveBrand },
  storage: { demo: demoStorage, live: liveStorage },
  dedupe: { demo: demoDedupe, live: liveDedupe },
};

/**
 * Bir portun bu istek için geçerli implementasyonu.
 *
 * ⚠ Her istekte yeniden çözülür, modül düzeyinde önbelleklenmez. `MODE_*`
 * runtime env'i; bir kez okuyup sabitlemek threadly'nin `hasSupabase`
 * hatasının aynısını bir katman aşağıda tekrarlamak olurdu.
 */
export function port<N extends PortName>(name: N, overrides?: ModeOverrides): PortMap[N] {
  return REGISTRY[name][resolveMode(name, overrides)];
}

/**
 * Ekranın `DemoBanner`'a vereceği bilgi. §9.1: mod, view payload'ında
 * istemciye **veri gibi** iner — istemci `process.env` okumaz.
 */
export function isDemo(name: PortName, overrides?: ModeOverrides): boolean {
  return resolveMode(name, overrides) === "demo";
}

/** Ekranın okuduğu portların HERHANGİ biri demo mu — banner'ın koşulu. */
export function anyDemo(names: readonly PortName[], overrides?: ModeOverrides): boolean {
  return names.some((name) => isDemo(name, overrides));
}

export { PORT_NAMES, resolveMode };
export type { Mode, ModeOverrides, PortMap, PortName };
