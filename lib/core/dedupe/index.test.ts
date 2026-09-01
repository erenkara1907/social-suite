import { describe, expect, it } from "vitest";
import {
  checkDuplicate,
  createDedupeRunBudget,
  type DedupeDeps,
  type SimilarContentMatch,
} from "@/lib/core/dedupe";
import { demoEmbed } from "@/lib/core/dedupe/demo-embedding";
import { demoDedupe } from "@/lib/adapters/demo/dedupe";
import { DEFAULT_DEDUPE_CONFIG } from "@/lib/core/dedupe/config";

const NOW = new Date("2026-09-01T00:00:00Z");
const BRAND = "brand-1";

/** Sahte deps — hiçbir ağ/DB çağrısı yapmaz. `overrides` ile katman katman
 *  senaryo kurulur (§12 adım 15 FAZ B DOĞRULAMA: "her katman için birim
 *  testi, mock embedding ile"). */
function makeDeps(overrides: Partial<DedupeDeps> = {}): DedupeDeps {
  return {
    findByFingerprint: async () => null,
    embeddingAvailable: async () => false,
    embed: async (text) => ({ ok: true, vector: demoEmbed(text) }),
    findSimilar: async () => [],
    judgeContinuation: async () => ({ ok: true, isContinuation: false, aspect: "" }),
    now: () => NOW,
    budget: createDedupeRunBudget(),
    config: DEFAULT_DEDUPE_CONFIG,
    ...overrides,
  };
}

const PUBLISHED_NEIGHBOR: SimilarContentMatch = {
  id: "neighbor-1",
  title: "Ürün A lansmanı",
  hook: "Bugün duyuruyoruz",
  status: "published",
  publishedAt: "2026-08-20T00:00:00Z", // NOW'dan 12 gün önce — gün kapısını geçer
  similarity: 0.87,
  chainPosition: 1,
};

describe("checkDuplicate — Kontrol 1 (fingerprint)", () => {
  it("fingerprint eşleşirse duplicate döner, embed HİÇ çağrılmaz", async () => {
    let embedCalled = false;
    const deps = makeDeps({
      findByFingerprint: async () => ({ id: "match-1" }),
      embed: async (text) => {
        embedCalled = true;
        return { ok: true, vector: demoEmbed(text) };
      },
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision).toMatchObject({ verdict: "duplicate", reason: "fingerprint", matchedId: "match-1" });
    expect(embedCalled).toBe(false);
  });
});

describe("checkDuplicate — Katman 2 kapalı (zarif düşüş)", () => {
  it("embeddingAvailable false ise 'new' döner, embed/findSimilar HİÇ çağrılmaz", async () => {
    let findSimilarCalled = false;
    const deps = makeDeps({
      embeddingAvailable: async () => false,
      findSimilar: async () => {
        findSimilarCalled = true;
        return [];
      },
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision).toMatchObject({ verdict: "new", embedding: null });
    expect(findSimilarCalled).toBe(false);
  });

  it("embed() başarısız olursa AÇIK tarafa düşer (new), duplicate DEĞİL", async () => {
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      embed: async () => ({ ok: false }),
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision.verdict).toBe("new");
  });
});

describe("checkDuplicate — Kontrol 2 (benzerlik eşikleri)", () => {
  it("komşu yoksa 'new' döner", async () => {
    const deps = makeDeps({ embeddingAvailable: async () => true, findSimilar: async () => [] });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision.verdict).toBe("new");
  });

  it("similarity < 0.82 ise 'new' döner", async () => {
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [{ ...PUBLISHED_NEIGHBOR, similarity: 0.5 }],
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision.verdict).toBe("new");
  });

  it("similarity >= 0.92 ise 'duplicate' döner, LLM'e HİÇ SORULMAZ", async () => {
    let judgeCalled = false;
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [{ ...PUBLISHED_NEIGHBOR, similarity: 0.95 }],
      judgeContinuation: async () => {
        judgeCalled = true;
        return { ok: true, isContinuation: true, aspect: "x" };
      },
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision).toMatchObject({ verdict: "duplicate", reason: "similarity", matchedId: "neighbor-1" });
    expect(judgeCalled).toBe(false);
  });
});

describe("checkDuplicate — Kontrol 3 (devam kararı, 0.82-0.92 bandı)", () => {
  it("komşu 'published' değilse REDDEDER (duplicate), LLM'e sorulmaz", async () => {
    let judgeCalled = false;
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [{ ...PUBLISHED_NEIGHBOR, status: "draft" }],
      judgeContinuation: async () => {
        judgeCalled = true;
        return { ok: true, isContinuation: true, aspect: "x" };
      },
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision).toMatchObject({ verdict: "duplicate", reason: "similarity" });
    expect(judgeCalled).toBe(false);
  });

  it("gün kapısını geçemezse (çok taze) REDDEDER, LLM'e sorulmaz", async () => {
    let judgeCalled = false;
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [{ ...PUBLISHED_NEIGHBOR, publishedAt: "2026-08-31T00:00:00Z" }], // dün
      judgeContinuation: async () => {
        judgeCalled = true;
        return { ok: true, isContinuation: true, aspect: "x" };
      },
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision).toMatchObject({ verdict: "duplicate", reason: "similarity" });
    expect(judgeCalled).toBe(false);
  });

  it("LLM 'evet, devam' derse → continuation, parentId + aspect taşınır", async () => {
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [PUBLISHED_NEIGHBOR],
      judgeContinuation: async () => ({ ok: true, isContinuation: true, aspect: "farklı özellik" }),
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision).toMatchObject({
      verdict: "continuation",
      parentId: "neighbor-1",
      continuationNote: "farklı özellik",
      similarity: 0.87,
    });
  });

  it("LLM 'hayır, aynı fikir' derse → duplicate (continuation_declined)", async () => {
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [PUBLISHED_NEIGHBOR],
      judgeContinuation: async () => ({ ok: true, isContinuation: false, aspect: "" }),
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision).toMatchObject({ verdict: "duplicate", reason: "continuation_declined" });
  });

  it("LLM çağrısı BAŞARISIZ olursa muhafazakâr tarafa düşer (duplicate)", async () => {
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [PUBLISHED_NEIGHBOR],
      judgeContinuation: async () => ({ ok: false }),
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision).toMatchObject({ verdict: "duplicate", reason: "continuation_declined" });
  });

  it("Kontrol 3c gerçekten SADECE bant içindeyken çağrılır — bütçe bir artar", async () => {
    const budget = createDedupeRunBudget();
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [PUBLISHED_NEIGHBOR],
      judgeContinuation: async () => ({ ok: true, isContinuation: true, aspect: "x" }),
      budget,
    });
    expect(budget.continuationChecksUsed).toBe(0);
    await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(budget.continuationChecksUsed).toBe(1);
  });
});

describe("checkDuplicate — FAZ B4 sonsuz döngü tavanı (LLM çağrı bütçesi)", () => {
  it("bütçe tükenince LLM'e SORULMADAN duplicate(budget_exhausted) döner", async () => {
    const budget = createDedupeRunBudget();
    budget.continuationChecksUsed = DEFAULT_DEDUPE_CONFIG.maxContinuationChecksPerRun;
    let judgeCalled = false;
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [PUBLISHED_NEIGHBOR],
      judgeContinuation: async () => {
        judgeCalled = true;
        return { ok: true, isContinuation: true, aspect: "x" };
      },
      budget,
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "x", hook: "y" }, deps);
    expect(decision).toMatchObject({ verdict: "duplicate", reason: "budget_exhausted" });
    expect(judgeCalled).toBe(false);
  });

  it("N adet çağrıdan sonra (N+1). çağrı bütçeyi aşar — tavan gerçekten sayıyor", async () => {
    const budget = createDedupeRunBudget();
    const deps = makeDeps({
      embeddingAvailable: async () => true,
      findSimilar: async () => [PUBLISHED_NEIGHBOR],
      judgeContinuation: async () => ({ ok: true, isContinuation: true, aspect: "x" }),
      budget,
    });
    const cap = DEFAULT_DEDUPE_CONFIG.maxContinuationChecksPerRun;
    for (let i = 0; i < cap; i++) {
      const d = await checkDuplicate({ brandId: BRAND, title: `x${i}`, hook: "y" }, deps);
      expect(d.verdict).toBe("continuation");
    }
    const last = await checkDuplicate({ brandId: BRAND, title: "x-son", hook: "y" }, deps);
    expect(last).toMatchObject({ verdict: "duplicate", reason: "budget_exhausted" });
  });
});

describe("checkDuplicate — demoDedupe ile MOCK'SUZ uçtan uca (§12 adım 15 revize B2-EK)", () => {
  it("demoDedupe.embed gerçekten çağrılıp 1024 boyutlu vektör taşınıyor", async () => {
    const deps = makeDeps({
      embeddingAvailable: async () => demoDedupe.isAvailable(BRAND),
      embed: async (text) => {
        const r = await demoDedupe.embed(text, BRAND);
        return r.ok ? { ok: true, vector: r.data } : { ok: false };
      },
      findSimilar: async () => [],
    });
    const decision = await checkDuplicate({ brandId: BRAND, title: "kahve", hook: "yeni" }, deps);
    expect(decision.verdict).toBe("new");
    expect(decision.verdict === "new" && decision.embedding?.length).toBe(1024);
  });
});
