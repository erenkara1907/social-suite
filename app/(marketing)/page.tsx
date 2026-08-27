import appConfig from "@/app.config";

/**
 * Placeholder home page — BIRLESIM_PLANI §12 adım 1 ("`/` boş sayfa render
 * eder"). The real landing page is written from scratch later; all three
 * source projects' marketing pages were discarded (§7.3).
 *
 * It lives under (marketing) rather than at app/page.tsx so the real landing
 * page can replace it in place — two files both resolving to `/` would be a
 * Next.js build error.
 */
export default function Home() {
  return (
    <main className="grid min-h-dvh place-items-center p-8">
      <div className="text-center">
        <p className="label-mono text-muted-foreground">iskelet</p>
        <h1 className="mt-3 font-display text-4xl tracking-tight">
          {appConfig.name}
        </h1>
      </div>
    </main>
  );
}
