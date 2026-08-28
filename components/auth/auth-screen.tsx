"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2, MailCheck } from "lucide-react";
import appConfig from "@/app.config";
import { useLang } from "@/components/i18n/language-provider";
import { createClient } from "@/lib/supabase/client";
import { authErrorKey } from "@/lib/supabase/auth-errors";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DEFAULT_LANDING, safeNextPath } from "@/lib/routes";
import { Logo } from "@/components/ui/logo";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { LanguageToggle } from "@/components/ui/language-toggle";

/**
 * Giriş / kayıt — siraya/components/auth/auth-screen.tsx tabanlı (§7.4:
 * "tek gerçek Supabase auth'u + e-posta onay ekranı").
 *
 * ÜÇ FARK, hepsi bilinçli:
 *
 * 1. ⭐ DEMO BYPASS YOK (B1). siraya'da Supabase yapılandırılmamışsa her
 *    buton doğrudan `/dashboard`'a atıyordu (`enterDemo`). `APP_MODE=demo`
 *    artık yalnızca VERİYİ demo yapar; kimlik her modda gerçektir. Bypass
 *    kalsaydı adım 8-10'da yazılan her sayfa "acaba gerçekten korunuyor mu"
 *    diye yeniden gözden geçirilmek zorunda kalırdı.
 * 2. OAuth (Google/GitHub) YOK. B5 "e-posta + şifre yeterli" dedi; ayrıca
 *    hiçbir OAuth sağlayıcısı Supabase panelinde açık değil — açık olmayan
 *    bir düğme yalnızca `errProviderDisabled` üretirdi.
 * 3. Magic link YOK (B5 açıkça istemedi).
 */
export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const { ui, lang } = useLang();
  const router = useRouter();

  // Yapılandırma yoksa istemci KURULMAZ (createClient patlar). Formu
  // kilitleyip sebebi yazıyoruz — sessizce içeri almak yerine.
  const supabase = useMemo(() => (isSupabaseConfigured ? createClient() : null), []);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentEmail, setSentEmail] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const isLogin = mode === "login";

  /** Giriş sonrası varılacak yer — proxy istenen yolu `?next=`'e park eder.
   *  Açık yönlendirme kapısı `safeNextPath`'te, testi `lib/routes.test.ts`'te. */
  function destination() {
    if (typeof window === "undefined") return DEFAULT_LANDING;
    return safeNextPath(new URLSearchParams(window.location.search).get("next"));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!supabase) return;

    setLoading(true);
    setError(null);

    const { error: authError, data } = isLogin
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({
          email,
          password,
          options: {
            // handle_new_user() trigger'ı bunu profiles.display_name'e yazar
            // (00_schema.sql:68-88).
            data: { display_name: name || email.split("@")[0] },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(destination())}`,
          },
        });

    if (authError) {
      setError(ui[authErrorKey(authError.message)]);
      setLoading(false);
      return;
    }

    // E-posta onayı açıkken kayıtta henüz oturum yok — bağlantıyı bekle.
    if (!isLogin && !data.session) {
      setSentEmail(true);
      setLoading(false);
      return;
    }

    router.push(destination());
    router.refresh();
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Sol — marka paneli */}
      <section
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex"
        style={{ backgroundImage: "var(--grad-brand)" }}
      >
        <span className="pointer-events-none absolute -right-16 -top-20 h-80 w-80 rounded-full bg-white/15 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-16 -left-10 h-64 w-64 rounded-full bg-black/15 blur-3xl" />

        <Link href="/" className="relative">
          <Logo onDark />
        </Link>

        <div className="relative max-w-md">
          <h1 className="font-display text-4xl font-semibold leading-tight">
            {appConfig.tagline[lang]}
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/85">
            {appConfig.description[lang]}
          </p>
        </div>

        <p className="relative text-xs text-white/65">
          © {appConfig.name} · {appConfig.domain}
        </p>
      </section>

      {/* Sağ — form */}
      <section className="relative flex flex-col items-center justify-center px-6 py-12">
        <div className="absolute right-5 top-5">
          <LanguageToggle />
        </div>

        <div className="w-full max-w-sm space-y-7">
          <Link href="/" className="inline-flex lg:hidden">
            <Logo />
          </Link>

          <div>
            <p className="label-mono text-muted-foreground">{appConfig.name}</p>
            <h2 className="mt-1 font-display text-3xl font-semibold tracking-tight">
              {isLogin ? ui.welcomeBack : ui.createAccount}
            </h2>
          </div>

          {!supabase && (
            <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
              {ui.configMissing}
            </p>
          )}

          {sentEmail ? (
            <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3.5 text-sm">
              <MailCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <p className="leading-relaxed text-foreground">{ui.checkEmail}</p>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              {!isLogin && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">{ui.fullName}</Label>
                  <Input
                    id="name"
                    name="name"
                    autoComplete="name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={lang === "tr" ? "Adın Soyadın" : "Jane Doe"}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">{ui.email}</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">{ui.password}</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={isLogin ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              {error && (
                <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  {error}
                </p>
              )}

              <Button type="submit" disabled={loading || !supabase} className="w-full gap-2">
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading
                  ? isLogin ? ui.signingIn : ui.creatingAccount
                  : isLogin ? ui.signIn : ui.getStarted}
                {!loading && <ArrowRight className="h-4 w-4" />}
              </Button>
            </form>
          )}

          <p className="text-center text-sm text-muted-foreground">
            {isLogin ? ui.noAccount : ui.haveAccount}{" "}
            <Link
              href={isLogin ? "/signup" : "/login"}
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              {isLogin ? ui.getStarted : ui.signIn}
            </Link>
          </p>
        </div>
      </section>
    </div>
  );
}
