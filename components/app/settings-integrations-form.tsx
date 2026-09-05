"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Loader2 } from "lucide-react";
import { useLang } from "@/components/i18n/language-provider";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { appConfig, type Integration } from "@/app.config";
import {
  saveCredentialAction,
  deleteCredentialAction,
  verifyCredentialAction,
  type CredentialActionState,
  type VerifyActionState,
} from "@/app/(app)/settings/integrations-actions";
import type { CredentialStatus } from "@/app/(app)/settings/integrations-data";

/**
 * `/settings` entegrasyon bölümü — BIRLESIM_PLANI §12 adım 13 FAZ C.
 *
 * ⭐ Sağlayıcı listesi `app.config.ts`'in `managedViaVault` bayrağından
 * türetilir (TEK kaynak, B3'ün action dosyasıyla aynı filtre) — burada
 * ikinci bir liste İCAT EDİLMEZ. D3 kararı gereği beş sağlayıcı görünür:
 * Anthropic, Kie, ElevenLabs, fal, Voyage. `instagram` (OAuth, adım 16) ve
 * `supabase` (altyapı) bu formda YOK.
 *
 * ⚠ Bu adımda anahtar DOĞRULAMASI yapılmıyor (dış çağrı gerektirir, adım 13
 * kuralı) — "kaydet" yalnızca Vault'a yazar, sağlayıcının kendisine hiç
 * dokunmaz. `last_verified_at`/`last_error` şemada var ama adım 14+'in ilk
 * gerçek çağrısıyla dolacak.
 */

const CREDENTIAL_INITIAL_STATE: CredentialActionState = { errorKey: null, provider: null, savedAt: null, formatWarning: false };
const VERIFY_INITIAL_STATE: VerifyActionState = { provider: null, status: "idle", detail: null, verifiedAt: null };

const MANAGED_INTEGRATIONS = appConfig.integrations.filter((i) => i.managedViaVault);

/** ⭐ adım 20.5 FAZ B — "test et" yalnızca `ugc_pipeline` + `plan_generate`/
 *  `caption_write`'ın gerçekten çağırdığı dört sağlayıcı için var (görev
 *  metni: "dört sağlayıcı için test düğmesi"). `voyage` (embedding, adım 15)
 *  dışarıda bırakıldı — bu oturumun kapsamı yalnızca bu dördü. */
const VERIFIABLE_PROVIDERS = new Set(["anthropic", "kie", "elevenlabs", "fal"]);

export function SettingsIntegrationsForm({ statuses }: { statuses: CredentialStatus[] }) {
  const { ui } = useLang();
  const statusByProvider = new Map(statuses.map((s) => [s.provider, s]));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{ui.integrations}</CardTitle>
        <CardDescription>{ui.integrationsHint}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {MANAGED_INTEGRATIONS.map((integration) => (
          <IntegrationRow
            key={integration.key}
            integration={integration}
            status={statusByProvider.get(integration.key) ?? null}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function IntegrationRow({
  integration,
  status,
}: {
  integration: Integration;
  status: CredentialStatus | null;
}) {
  const { ui, t } = useLang();
  const router = useRouter();
  const [saveState, saveAction, savePending] = useActionState(saveCredentialAction, CREDENTIAL_INITIAL_STATE);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCredentialAction, CREDENTIAL_INITIAL_STATE);
  const [verifyState, verifyAction, verifyPending] = useActionState(verifyCredentialAction, VERIFY_INITIAL_STATE);

  const isConfigured = !!status;
  const canVerify = isConfigured && VERIFIABLE_PROVIDERS.has(integration.key);
  // ⭐ FAZ B — hata her zaman en son durumu yansıtır (bir sonraki başarılı
  // testte record_provider_verification last_error'ı temizler); bu satırın
  // KENDİ verify çağrısı henüz dönmemişse status.lastError'a güvenilir.
  const hasVerifyError = !!status?.lastError;

  // Kaydetme/silme/doğrulama başarılıysa sunucu bileşenini tazele —
  // masked_hint/last_verified_at/last_error'ın yeni değeri buradan gelir.
  useEffect(() => {
    if (saveState.savedAt || deleteState.savedAt || verifyState.verifiedAt) router.refresh();
  }, [saveState.savedAt, deleteState.savedAt, verifyState.verifiedAt, router]);

  return (
    <div className="rounded-lg border border-border p-4 space-y-3" data-testid={`integration-row-${integration.key}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground">{integration.name}</span>
          {integration.required && <Badge tone="warning">{ui.integrationRequiredBadge}</Badge>}
          {!isConfigured && <Badge tone="neutral">{ui.integrationMissing}</Badge>}
          {isConfigured && hasVerifyError && <Badge tone="destructive">{ui.integrationVerifyErrorBadge}</Badge>}
          {isConfigured && !hasVerifyError && status?.lastVerifiedAt && (
            <Badge tone="success">{ui.integrationVerifiedBadge}</Badge>
          )}
          {isConfigured && !hasVerifyError && !status?.lastVerifiedAt && (
            <Badge tone="neutral">{ui.integrationConfigured}</Badge>
          )}
        </div>
        <a
          href={integration.docsUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
        >
          {ui.integrationDocsLink}
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      <p className="text-sm text-muted-foreground">{t(integration.purpose)}</p>

      {!isConfigured && integration.whenMissing && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{ui.integrationWhenMissingPrefix}</span>{" "}
          {t(integration.whenMissing)}
        </p>
      )}

      {isConfigured && <p className="label-mono text-sm text-foreground">{status.maskedHint}</p>}

      <form action={saveAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="provider" value={integration.key} />
        <div className="min-w-48 flex-1 space-y-1">
          <Label htmlFor={`apiKey-${integration.key}`} className="sr-only">
            {ui.integrationApiKeyLabel}
          </Label>
          <Input
            id={`apiKey-${integration.key}`}
            name="apiKey"
            type="password"
            autoComplete="off"
            placeholder={ui.integrationApiKeyPlaceholder}
          />
        </div>
        <Button type="submit" size="sm" disabled={savePending} className="gap-1.5">
          {savePending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {savePending ? ui.integrationSaving : isConfigured ? ui.integrationUpdateCta : ui.integrationEnterCta}
        </Button>
        {isConfigured && (
          <Button type="submit" formAction={deleteAction} variant="destructive" size="sm" disabled={deletePending}>
            {deletePending ? ui.integrationDeleting : ui.integrationDelete}
          </Button>
        )}
        {/* ⭐ adım 20.5 FAZ B — aynı form, farklı formAction (delete butonuyla
         *  aynı desen): apiKey alanı boş gönderilse de sorun değil, verifyCredentialAction
         *  yalnızca `provider`'ı okur — anahtarın KENDİSİ zaten kayıtlı olan. */}
        {canVerify && (
          <Button type="submit" formAction={verifyAction} variant="outline" size="sm" disabled={verifyPending} className="gap-1.5">
            {verifyPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {verifyPending ? ui.integrationVerifying : ui.integrationVerifyCta}
          </Button>
        )}
      </form>

      {saveState.provider === integration.key && saveState.errorKey && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ui[saveState.errorKey]}
        </p>
      )}
      {saveState.provider === integration.key && !saveState.errorKey && saveState.savedAt && (
        <p role="status" className="rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
          {ui.integrationSavedAt}
        </p>
      )}
      {saveState.provider === integration.key && saveState.savedAt && saveState.formatWarning && (
        <p role="alert" className="rounded-lg bg-warning/10 px-3 py-2 text-sm text-warning-foreground">
          {ui.integrationFormatWarning}
        </p>
      )}
      {deleteState.provider === integration.key && deleteState.errorKey && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {ui[deleteState.errorKey]}
        </p>
      )}
      {verifyState.provider === integration.key && verifyState.status === "error" && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {verifyState.detail}
        </p>
      )}
      {verifyState.provider === integration.key && verifyState.status === "ok" && (
        <p role="status" className="rounded-lg bg-success/10 px-3 py-2 text-sm text-success">
          {ui.integrationVerifySuccessMsg}
        </p>
      )}
    </div>
  );
}
