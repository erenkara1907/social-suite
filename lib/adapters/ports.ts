/**
 * BIRLESIM_PLANI §9.1 — port listesinin TEK GERÇEK KAYNAĞI.
 *
 * Kural: bu dosyada ALAN TİPİ TANIMLANMAZ. İçerik satırı, marka, metrik,
 * medya işi… hepsi `lib/core/`'da yaşıyor ve buraya import edilir. Burada
 * yalnızca (a) port arayüzleri ve (b) o portların çağrı parametreleri var —
 * yani "hangi soruyu soruyoruz", "cevabın şekli ne" değil.
 *
 * Neden bu ayrım. siraya'da 13 dosya tiplerini `lib/demo/data.ts`'ten import
 * ediyordu (§9.2); demo verisi silinemez hâle gelmişti. Aynı hata bir katman
 * yukarıda da yapılabilir: tipler `ports.ts`'te tanımlanırsa `lib/core/` kendi
 * modelini adapter katmanından okumaya başlar ve bağımlılık yönü ters döner.
 *
 * Hata sözleşmesi. İki farklı şey iki farklı şekilde bildirilir:
 *   - OKUMA (`list*`, `get*`) doğrudan veriyi döndürür ve altyapı hatasında
 *     FIRLATIR. §9.1'in 2. tespiti tam bu: siraya kesintide `null` dönüp sahte
 *     veriyi gerçekmiş gibi gösteriyordu. Sessiz düşme bir hata, kurtarma değil.
 *   - YAZMA / ÜRETİM (dış servise para harcayan her şey) `ApiResult<T>`
 *     döndürür. Hata `ApiErrorCode` taşır, UI onu TR/EN metne çevirir.
 *
 * `isDemo` bilgisi bu arayüzlerde YOK. Mod, `lib/adapters/index.ts`'te
 * çözülür ve view payload'ına veri olarak iner (§9.1) — port implementasyonu
 * kendi modunu bilmez, bilmemeli.
 */
import type { ApiResult, CaptionDraft, GeneratedImage } from "@/lib/core/ai/types";
import type { Brand } from "@/lib/core/brand/types";
import type { SkeletonInput, SkeletonPost } from "@/lib/core/plan/skeleton";
import type {
  ActivityRow, ChannelRow, ContentItemRow, Lang, MediaAssetRow, MediaJobRow,
  MediaJobStep, MediaKind, MetricRow, PersonaRow, PlanChannel, Platform,
  PostStatus,
} from "@/lib/core/types";
import type { TurkishVoice, Voice } from "@/lib/core/providers/elevenlabs";

/* ── Port adları ──────────────────────────────────────────────────────────── */

/**
 * ⚠ Bu dizi hem fabrikanın anahtarı hem de env değişkeninin adı:
 * `content` → `MODE_CONTENT`. Yeni port eklerken üç yer birlikte değişir:
 * burası, `PortMap`, ve `demo/` + `live/` implementasyonları.
 */
export const PORT_NAMES = [
  "content", "planner", "copy", "image", "video", "voice",
  "publisher", "metrics", "channel", "brand", "storage", "dedupe",
] as const;
export type PortName = (typeof PORT_NAMES)[number];

/* ── 1. ContentPort ───────────────────────────────────────────────────────── */

/**
 * İçerik CRUD + takvim/kuyruk görünümlerinin ham girdisi.
 *
 * Ekranlar: `/dashboard` (aylık takvim + hafta ızgarası), `/queue` (onay
 * kuyruğu), `/plan` (üretilen planın gönderileri), `/analytics` (metriklerle
 * eşleştirilecek satırlar).
 * FAZ 2: Supabase `content_items` + `jobs` (§12 adım 8, 12).
 *
 * ⚠ Görünüm TÜRETMESİ burada değil. `buildMonthCells` / `buildQueue` /
 * `buildWeek` saf fonksiyonlar ve `lib/core/derive/` içinde yaşıyor; port
 * onlara SATIR verir. Türetmeyi adapter'a koymak demo ile live'ın aynı
 * takvimi iki farklı şekilde hesaplaması demek olurdu.
 */
export interface ContentPort {
  /** Marka kapsamlı liste. Filtre verilmezse arşiv HARİÇ hepsi. */
  list(query?: ContentQuery): Promise<ContentItemRow[]>;
  get(id: string): Promise<ContentItemRow | null>;
  /** §4b zinciri: `root_id` eşleşen tüm satırlar, `chain_position` sırasıyla. */
  listChain(rootId: string): Promise<ContentItemRow[]>;
  create(input: NewContent): Promise<ApiResult<ContentItemRow>>;
  update(id: string, patch: ContentPatch): Promise<ApiResult<ContentItemRow>>;
  /** §4a — silme YOK. Arşiv, tekrar hafızasında kalır. */
  archive(id: string): Promise<ApiResult<ContentItemRow>>;
  /** Son aktiviteler — `/dashboard`'ın sağ sütunu. */
  listActivity(limit?: number): Promise<ActivityRow[]>;
}

export interface ContentQuery {
  status?: readonly PostStatus[];
  platform?: readonly Platform[];
  /** ISO tarih aralığı, `scheduled_at` üzerinden. */
  from?: string;
  to?: string;
  limit?: number;
}

/** Yeni satırda yalnızca uygulamanın YAZDIĞI alanlar var. `root_id` ve
 *  `chain_position` trigger tarafından türetilir (§4b) — buraya girmez. */
export type NewContent = Pick<
  ContentItemRow,
  "platform" | "kind" | "title"
> & Partial<Pick<
  ContentItemRow,
  "plan_id" | "channel_id" | "media_type" | "day_offset" | "time_of_day" |
  "scheduled_at" | "hook" | "body" | "hashtags" | "media_url" |
  "parent_id" | "continuation_note" | "topic_key"
>>;

export type ContentPatch = Partial<Pick<
  ContentItemRow,
  "title" | "hook" | "body" | "hashtags" | "kind" | "media_type" |
  "scheduled_at" | "is_best_time" | "media_url" | "status"
>>;

/* ── 2. PlannerPort ───────────────────────────────────────────────────────── */

/**
 * Plan iskeleti üretimi — takvimin "ne hakkında" kısmı, gövdeler değil.
 *
 * Ekran: `/plan` (§12 adım 9). Demo kaynağı: hazır plan JSON (7 ve 30 günlük).
 * FAZ 2: `lib/core/plan/skeleton.ts` + Anthropic `claude-opus-5`, müşterinin
 * kendi anahtarıyla (§8.6). S4 gereği ilk canlıya alınan port bu (§12 adım 14).
 *
 * ⚠ Anahtar bu arayüzde YOK. `provider_credentials`'tan çözmek `lib/server/`'ın
 * işi; port onu görmez.
 */
export interface PlannerPort {
  generate(input: SkeletonInput): Promise<ApiResult<PlanSkeleton>>;
}

export interface PlanSkeleton {
  title: string;
  posts: SkeletonPost[];
}

/* ── 3. CopyPort ──────────────────────────────────────────────────────────── */

/**
 * Caption yazımı — tek bir gönderinin hook + gövde + hashtag'i.
 *
 * Ekranlar: `/plan` → "yaz" düğmesi, `/composer` (11b).
 * Demo kaynağı: threadly `data.ts:266` `sampleDrafts`.
 * FAZ 2: `lib/core/ai/caption.ts` + Anthropic (§12 adım 14).
 *
 * `chainContext` §4b'nin gereği: bir devam içeriği yazılırken model
 * "daha önce ne söyledim"i görmeli, yoksa zincir kendini tekrar eder.
 */
export interface CopyPort {
  write(input: CopyInput): Promise<ApiResult<CaptionDraft>>;
}

export interface CopyInput {
  idea: string;
  channel: PlanChannel;
  tone: string;
  lang: Lang;
  brand: Brand | null;
  /** Zincirin önceki halkaları, `chain_position` sırasıyla. Boşsa kök içerik. */
  chainContext?: readonly ContentItemRow[];
  /** ⚠ adım 14 FAZ C — yalnızca `lib/adapters/live/copy.ts`'in anahtar
   *  çözümü + kullanım kaydı için. Demo modda okunmaz. */
  brandId?: string;
}

/* ── 4. ImagePort ─────────────────────────────────────────────────────────── */

/**
 * Tek kare görsel üretimi.
 *
 * Ekranlar: `/composer` (11b), `/plan` → görselli gönderi.
 * Demo kaynağı: statik PNG. FAZ 2: fal flux (§12 adım 19-20).
 */
export interface ImagePort {
  generate(prompt: string): Promise<ApiResult<GeneratedImage>>;
}

/* ── 5. VideoPort ─────────────────────────────────────────────────────────── */

/**
 * UGC video boru hattı ve persona üretimi — §4d'nin beş adımı.
 *
 * Ekranlar: `/studio`, `/studio/personas` (§12 adım 10).
 * Demo kaynağı: S5 kararı gereği stok video ALINMADI; placeholder + sahte adım
 * ilerlemesi. FAZ 2: Kie (OmniHuman/Kling/Nano Banana) + ElevenLabs + fal
 * (§12 adım 20).
 *
 * ⚠ İş DURUMU `media_jobs.state`'te yaşar, `content_items.status`'ta değil —
 * ikisi ortogonal (§4a). Bir içerik `needs_review` iken videosu `running`
 * olabilir; arayüz bu ayrımı korur.
 */
export interface VideoPort {
  /** Boru hattını başlatır; dönen iş kuyruğa girer, tarayıcı kapansa da sürer. */
  start(input: VideoJobInput): Promise<ApiResult<MediaJobRow>>;
  getJob(jobId: string): Promise<MediaJobRow | null>;
  /** Bir içeriğin tüm üretim adımları — `/studio`'nun ilerleme çubuğu. */
  listJobs(contentItemId: string): Promise<MediaJobRow[]>;
  /**
   * Marka kapsamlı TÜM işler — `/studio`'nun üretim listesi (§12 adım 10 C1)
   * ve `/studio/personas`'ın "kaç içerikte kullanıldı" sayacı bunu okur.
   * `listJobs` tek içeriğe göre filtreliyken bu, `ContentPort.list()`'in
   * medya işleri için karşılığı.
   */
  listAllJobs(): Promise<MediaJobRow[]>;
  listPersonas(): Promise<PersonaRow[]>;
  createPersona(input: NewPersona): Promise<ApiResult<PersonaRow>>;
}

export interface VideoJobInput {
  contentItemId: string;
  personaId: string;
  /** Seslendirilecek metin. `MAX_SCRIPT_CHARS` sınırı live tarafta doğrulanır. */
  script: string;
  voiceId: string;
  step: MediaJobStep;
}

export interface NewPersona {
  name: string;
  prompt: string;
  defaultVoiceId?: string;
}

/* ── 6. VoicePort ─────────────────────────────────────────────────────────── */

/**
 * Ses menüsü ve TTS.
 *
 * Ekran: `/studio` → ses seçici (§12 adım 10).
 * Demo kaynağı: sabit ses listesi. FAZ 2: ElevenLabs (§12 adım 20).
 *
 * Türkçe filtresi ayrı bir çağrı: `?language=tr` katı ve hesapta yalnızca üç
 * ses döndürüyor (`lib/core/providers/elevenlabs.ts:88-97` yorumu) — tam liste
 * de gerekiyor.
 */
export interface VoicePort {
  list(): Promise<Voice[]>;
  listTurkish(): Promise<TurkishVoice[]>;
  /** Sentezlenen ses; kalıcılaştırma `StoragePort`'un işi. */
  synthesize(text: string, voiceId: string): Promise<ApiResult<ArrayBuffer>>;
}

/* ── 7. PublisherPort ─────────────────────────────────────────────────────── */

/**
 * Yayın — ürünün "gerçekten dışarı çıktı" ucu.
 *
 * Ekran: `/queue` → onayla/yayınla (§12 adım 8), cron `sm-publish` (§12 adım 17).
 * Demo kaynağı: no-op + "yayınlandı" damgası, sıfır ağ isteği.
 * FAZ 2: Instagram Graph (§12 adım 17); diğer platformlar §8.8.
 *
 * ⚠ `canPublish()` kontrolü ÇAĞIRANIN işi (`lib/core/publishing.ts`).
 * Yayınlanamayan bir platformu zamanlamak, zamanlayıcının tutamayacağı bir söz.
 */
export interface PublisherPort {
  publish(contentItemId: string): Promise<ApiResult<PublishReceipt>>;
  /** Yayıncı bugün hangi platformları gerçekten götürebiliyor. */
  supported(): readonly Platform[];
}

export interface PublishReceipt {
  /** Platformun kendi id'si — `content_items.external_post_id`'ye yazılır. */
  externalPostId: string;
  publishedAt: string;
  permalink: string | null;
}

/* ── 8. MetricsPort ───────────────────────────────────────────────────────── */

/**
 * Metrik okuma — geri besleme döngüsünün girdisi.
 *
 * Ekranlar: `/analytics` (erişim, etkileşim, en iyi gönderiler), `/dashboard`
 * (ısı haritası) (§12 adım 8).
 * Demo kaynağı: siraya `data.ts:238` reach14d + `:259` topPosts.
 * FAZ 2: Supabase `content_metrics` + §8.2'nin toplayıcısı (§12 adım 18).
 *
 * ⭐ D1 — `latest()` içerik başına EN SON MEVCUT ölçümü döndürür, `tier='final'`
 * olanı değil. 10 gün önce yayınlanmış bir içeriğin `final` satırı YOKTUR ve
 * olmayacaktır; eski kural o içeriği geri beslemeden tamamen düşürüyordu.
 * Şema tarafındaki karşılığı `brand_latest_metrics(brand_id, days)`.
 */
export interface MetricsPort {
  /** Ham satırlar — `h6` dahil. Zaman serisi çizen ekranlar bunu ister. */
  list(days: number): Promise<MetricRow[]>;
  /** ⭐ D1: içerik başına tek satır, en son ölçüm. `h6` HARİÇ. */
  latest(days: number): Promise<MetricRow[]>;
}

/* ── 9. ChannelPort ───────────────────────────────────────────────────────── */

/**
 * Kanal bağlama.
 *
 * Ekranlar: `/channels` (11b), `/dashboard` → kanal rozetleri,
 * `/settings` → entegrasyonlar (11b).
 * Demo kaynağı: sahte "bağlı" kanal. FAZ 2: Instagram OAuth (§12 adım 16).
 *
 * ⚠ Token bu arayüzden GEÇMEZ. `channel_credentials` RLS açık + sıfır
 * politika; yalnızca service-role okur. `startConnect` bir yönlendirme URL'i
 * döndürür, kimlik bilgisi değil.
 */
export interface ChannelPort {
  list(): Promise<ChannelRow[]>;
  startConnect(platform: Platform): Promise<ApiResult<ConnectHandoff>>;
  disconnect(channelId: string): Promise<ApiResult<void>>;
}

export interface ConnectHandoff {
  /** Kullanıcının yönlendirileceği sağlayıcı URL'i. */
  authorizeUrl: string;
  /** CSRF state — callback bunu doğrular. */
  state: string;
}

/* ── 10. BrandPort ────────────────────────────────────────────────────────── */

/**
 * Marka profili — planın ve her caption'ın okuduğu tek durum.
 *
 * Ekran: `/settings` → marka formu (§12 adım 9; kritik yolda, çünkü `/plan`'ın
 * girdisi). Demo kaynağı: dolu örnek marka.
 * FAZ 2: Supabase `brands`.
 */
export interface BrandPort {
  /** Form doldurulana kadar `null` — `EMPTY_BRAND` DEĞİL. Ayrım önemli:
   *  "henüz girilmedi" ile "boş girildi" farklı ekranlar gösterir. */
  get(): Promise<Brand | null>;
  save(brand: Brand): Promise<ApiResult<Brand>>;
}

/* ── 11. StoragePort ──────────────────────────────────────────────────────── */

/**
 * Dosya kalıcılaştırma — sağlayıcının GEÇİCİ URL'i ile yayın arasındaki köprü.
 *
 * Ekranlar: `/library` (11b), `/studio` → üretilen videonun kalıcı URL'i.
 * Demo kaynağı: data URL (ağ yok). FAZ 2: Supabase Storage `media` bucket'ı
 * (§12 adım 19).
 *
 * ⚠ §10 bulgu 1 — `persistFromUrl` SSRF yüzeyidir. Live implementasyon
 * allowlist uygulamak ZORUNDA (izinli vendor host'ları, https, boyut sınırı).
 * Arayüz bunu zorlayamaz; §12 adım 19'un kabul kriteri zorlar.
 */
export interface StoragePort {
  /** Vendor'ın geçici URL'ini indirir, bucket'a yazar, satırı döndürür. */
  persistFromUrl(input: PersistFromUrlInput): Promise<ApiResult<MediaAssetRow>>;
  persistBytes(input: PersistBytesInput): Promise<ApiResult<MediaAssetRow>>;
  list(kind?: MediaKind): Promise<MediaAssetRow[]>;
}

export interface PersistFromUrlInput {
  sourceUrl: string;
  kind: MediaKind;
  /** Hangi sağlayıcıdan geldi — allowlist ve izlenebilirlik için. */
  vendor: MediaAssetRow["source_vendor"];
}

export interface PersistBytesInput {
  bytes: ArrayBuffer;
  kind: MediaKind;
  mimeType: string;
  vendor: MediaAssetRow["source_vendor"];
}

/* ── 12. DedupePort ───────────────────────────────────────────────────────── */

/**
 * Tekrar kontrolü — ürün tanımının 5. maddesi ("aynı içerik tekrar üretilmez").
 *
 * Ekran: doğrudan bir ekranı beslemez; `/plan` üretimi sırasında araya girer ve
 * sonucu `/dashboard`'ın aktivite akışında `duplicate_blocked` olarak görünür.
 * Demo kaynağı: her zaman "yeni". FAZ 2: fingerprint + pgvector (§12 adım 15).
 *
 * ⚠ D3 — `embed()` TAM 1024 boyut döndürmek zorunda; live implementasyon dönen
 * uzunluğu çalışma zamanında doğrular ve değilse FIRLATIR (sessizce kırpmaz).
 * Kolon sözleşmedir, sağlayıcı ona uyar.
 * ⚠ Eşikler (0.92 / 0.82) kalibre EDİLMEDİ — ilk ~200 içerikten sonra ölçülecek.
 */
export interface DedupePort {
  check(candidate: DedupeCandidate): Promise<ApiResult<DedupeVerdict>>;
  /** Boyutu `EMBEDDING_DIMENSIONS` olan vektör. Doğrulama implementasyonda. */
  embed(input: string): Promise<ApiResult<number[]>>;
}

export interface DedupeCandidate {
  title: string;
  hook: string;
  topicKey?: string;
}

/** §4c'nin üç kararı. `near` durumunda `parentId` bir devam önerisidir. */
export type DedupeVerdict =
  | { decision: "new" }
  | { decision: "near"; similarity: number; parentId: string }
  | { decision: "duplicate"; similarity: number; matchedId: string };

/* ── Port adı → arayüz eşlemesi ───────────────────────────────────────────── */

/** Fabrikanın tip güvenliği buradan geliyor: `port("planner")` → `PlannerPort`. */
export interface PortMap {
  content: ContentPort;
  planner: PlannerPort;
  copy: CopyPort;
  image: ImagePort;
  video: VideoPort;
  voice: VoicePort;
  publisher: PublisherPort;
  metrics: MetricsPort;
  channel: ChannelPort;
  brand: BrandPort;
  storage: StoragePort;
  dedupe: DedupePort;
}
