/**
 * PublisherPort — CANLI implementasyon. §12 adım 17a FAZ B1.
 *
 * Asıl mantık `lib/server/publish/publish-item.ts`'te — `lib/server/jobs/
 * handlers.ts`'in `handlePublish`'i (cron/kuyruk yolu) ile AYNI fonksiyonu
 * paylaşır (DRY, gerekçe o dosyanın başlığında). Bu port bugün hiçbir UI
 * yolundan ÇAĞRILMIYOR (`/queue`'nun onay akışı içeriği `scheduled`'a
 * çevirir, `sm-publish` zamanlayıcısı devralır — FAZ D) ama arayüzün
 * "platform detayı taşımaz" sözleşmesini tutmak için gerçek bir gövdesi
 * olmalı; yarın doğrudan bir "şimdi yayınla" düğmesi eklenirse buraya bağlanır.
 *
 * ⚠ Bu dosyada `process.env` OKUNMAZ — kimlik bilgisi `channel_credentials`
 * satırından (`publishContentItem` içinde) okunur.
 */
import type { PublisherPort } from "@/lib/adapters/ports";
import { PermanentJobError } from "@/lib/core/jobs/errors";
import { PUBLISHABLE_PLATFORMS } from "@/lib/core/publishing";
import { createAdminClient } from "@/lib/supabase/admin";
import { publishContentItem } from "@/lib/server/publish/publish-item";

export const livePublisher: PublisherPort = {
  async publish(contentItemId) {
    const admin = createAdminClient();
    try {
      const result = await publishContentItem(admin, contentItemId, "direct-publish");
      if (!result) {
        return {
          ok: false,
          error: { code: "publish_failed", detail: "içerik 'scheduled' durumunda değil (zaten yayınlanıyor/yayınlanmış olabilir)" },
        };
      }
      return {
        ok: true,
        data: { externalPostId: result.externalPostId, publishedAt: result.publishedAt, permalink: result.permalink },
      };
    } catch (error) {
      const code = error instanceof PermanentJobError ? "publish_failed" : "upstream_error";
      return { ok: false, error: { code, detail: error instanceof Error ? error.message : String(error) } };
    }
  },
  supported() {
    return PUBLISHABLE_PLATFORMS;
  },
};
