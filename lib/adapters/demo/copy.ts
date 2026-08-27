/**
 * CopyPort — DEMO implementasyon.
 *
 * Demo kaynağı: `fixtures/content.ts` → `DEMO_CAPTION_DRAFTS`
 * (← threadly `lib/demo/data.ts:266` `sampleDrafts`, küçük harf anahtarlarla).
 *
 * ⚠ Kanal başına tek taslak var; `idea` ve `tone` yok sayılıyor. Demoda
 * modelin ne kadar iyi yazdığını değil, AKIŞIN çalıştığını gösteriyoruz.
 * Girdiye göre değişen sahte metin üretmek, modelin yeteneği hakkında
 * satılmayan bir söz verirdi.
 */
import type { CopyPort } from "@/lib/adapters/ports";
import { DEMO_CAPTION_DRAFTS } from "@/lib/adapters/demo/fixtures/content";

export const demoCopy: CopyPort = {
  async write(input) {
    return { ok: true, data: { ...DEMO_CAPTION_DRAFTS[input.channel] } };
  },
};
