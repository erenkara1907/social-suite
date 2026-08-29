import "server-only";

import { createClient } from "@/lib/supabase/server";
import { JOB_STATES, type JobKind, type JobState } from "@/lib/core/jobs/types";

/**
 * Kuyruk görünürlüğü — BIRLESIM_PLANI §12 adım 12 FAZ C.
 *
 * ⭐ ANON KEY + kullanıcı çerezi, DEMO/LIVE MODUNA BAKMAKSIZIN her zaman
 * GERÇEK sorgu. Gerekçe (B1, `lib/supabase/config.ts`): "Kimlik doğrulama
 * HER MODDA gerçektir" — `jobs` tablosu 12 port'un (`lib/adapters/`) HİÇBİRİNE
 * ait değil, auth gibi platform altyapısı. `APP_MODE=demo`'nun "sıfır ağ
 * isteği" kuralı TARAYICI DevTools'unda ölçülür (adım 8/11 kabul kriteri);
 * bu bir Server Component sorgusu — `requireBrand()` zaten her sayfada aynı
 * şekilde çalışıyor. Demo modda kuyruk gerçekten BOŞTUR (adım 14'ten önce
 * hiçbir çağıran enqueue etmiyor) — sahte bir dolu kuyruk göstermek "sessiz
 * düşme"nin tersi bir yalan olurdu (§9.1).
 *
 * ⚠ Yalnızca OTURUM SAHİBİNİN işleri — `jobs` RLS'i `own jobs read`
 * (`auth.uid() = user_id`), marka bazlı DEĞİL. Bugün marka:kullanıcı 1:1
 * (§4e organizasyon katmanı henüz yok) olduğu için pratikte fark etmiyor;
 * çok kullanıcılı bir markada bu görünüm EKSİK kalır — adım 21'in tam panel
 * işi bunu marka bazlı bir RLS politikasıyla çözmeli.
 *
 * ⚠ `failed` durumu SAYILARDA VAR ama worker (`lib/server/jobs/worker.ts`)
 * onu HİÇ ÜRETMİYOR: geçici hata doğrudan `queued`'e (backoff ile) döner,
 * kalıcı/tükenmiş hata doğrudan `dead`'e gider. Ara `failed` durumu şemada
 * dursun diye tutuluyor (CHECK listesinde var) ama bu tasarımda gözlenmez —
 * bilinçli, dokümante edilmiş bir karar (adım 12b'nin gerekçesi).
 */

const DEAD_LETTER_LIMIT = 10;

export interface DeadJob {
  id: string;
  kind: JobKind;
  lastError: string | null;
  updatedAt: string;
}

export interface JobsSummary {
  counts: Record<JobState, number>;
  deadJobs: DeadJob[];
}

function emptyCounts(): Record<JobState, number> {
  return Object.fromEntries(JOB_STATES.map((state) => [state, 0])) as Record<JobState, number>;
}

export async function getJobsSummary(): Promise<JobsSummary> {
  const supabase = await createClient();

  const { data: stateRows, error: stateError } = await supabase.from("jobs").select("state");
  if (stateError) throw new Error(`jobs okunamadı: ${stateError.message}`);

  const counts = emptyCounts();
  for (const row of stateRows ?? []) {
    const state = row.state as JobState;
    counts[state] = (counts[state] ?? 0) + 1;
  }

  const { data: deadRows, error: deadError } = await supabase
    .from("jobs")
    .select("id, kind, last_error, updated_at")
    .eq("state", "dead")
    .order("updated_at", { ascending: false })
    .limit(DEAD_LETTER_LIMIT);
  if (deadError) throw new Error(`ölü mektup listesi okunamadı: ${deadError.message}`);

  const deadJobs: DeadJob[] = (deadRows ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as JobKind,
    lastError: row.last_error as string | null,
    updatedAt: row.updated_at as string,
  }));

  return { counts, deadJobs };
}
