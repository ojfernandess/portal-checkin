import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { CheckCircle2, HardDrive, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  PlatformCard,
  PlatformSection,
  PlatformShell,
  usePlatformAccount,
} from "@/components/admin/PlatformShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { platformGetMinioConfig, platformTestMinio } from "@/lib/api/platform.functions";
import type { MinioOnlyConfig, MinioTestReport } from "@/lib/minio-test.server";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/platform/minio")({
  head: () => ({ meta: [{ title: "Super Admin | MinIO" }] }),
  component: PlatformMinioPage,
});

function PlatformMinioPage() {
  const { t } = useI18n();
  const account = usePlatformAccount();
  const configFn = useServerFn(platformGetMinioConfig);
  const testFn = useServerFn(platformTestMinio);

  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [config, setConfig] = useState<MinioOnlyConfig | null>(null);
  const [report, setReport] = useState<MinioTestReport | null>(null);

  useEffect(() => {
    void configFn()
      .then(setConfig)
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : t("platform.minioPage.loadError"));
      })
      .finally(() => setLoading(false));
  }, [configFn, t]);

  async function handleTest() {
    setTesting(true);
    setReport(null);
    try {
      const result = await testFn();
      setReport(result);
      if (result.ok) {
        toast.success(t("platform.minioPage.testSuccess"));
      } else {
        toast.error(result.error ?? t("platform.minioPage.testFailed"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("platform.minioPage.testFailed"));
    } finally {
      setTesting(false);
    }
  }

  return (
    <PlatformShell
      title={t("platform.minioPage.title")}
      subtitle={t("platform.minioPage.subtitle")}
      account={account}
    >
      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
          {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-8">
          <PlatformSection
            title={t("platform.minioPage.configTitle")}
            description={t("platform.minioPage.configHint")}
          >
            <PlatformCard className="space-y-4">
              <div className="flex items-center gap-3">
                <HardDrive className="size-5 text-muted-foreground" aria-hidden />
                <Badge variant={config?.configured ? "default" : "destructive"}>
                  {config?.configured
                    ? t("platform.minioPage.configured")
                    : t("platform.minioPage.notConfigured")}
                </Badge>
              </div>

              {config ? (
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <ConfigRow label="MINIO_ENDPOINT" value={config.endpoint ?? "—"} />
                  <ConfigRow label="MINIO_BUCKET" value={config.bucket ?? "—"} />
                  <ConfigRow label="MINIO_REGION" value={config.region ?? "—"} />
                  <ConfigRow
                    label="MINIO_FORCE_PATH_STYLE"
                    value={config.forcePathStyle ? "true" : "false"}
                  />
                  <ConfigRow label="MINIO_ACCESS_KEY" value={config.accessKeyMasked ?? "—"} />
                  <ConfigRow label="MINIO_SECRET_KEY" value={config.secretKeyMasked ?? "—"} />
                </dl>
              ) : null}

              {config && config.missingVars.length > 0 ? (
                <p className="text-sm text-destructive">
                  {t("platform.minioPage.missingVars")}: {config.missingVars.join(", ")}
                </p>
              ) : null}
            </PlatformCard>
          </PlatformSection>

          <PlatformSection
            title={t("platform.minioPage.testTitle")}
            description={t("platform.minioPage.testHint")}
            action={
              <Button disabled={testing || !config?.configured} onClick={() => void handleTest()}>
                {testing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    {t("platform.minioPage.testing")}
                  </>
                ) : (
                  t("platform.minioPage.runTest")
                )}
              </Button>
            }
          >
            {!config?.configured ? (
              <PlatformCard>
                <p className="text-sm text-muted-foreground">{t("platform.minioPage.configureFirst")}</p>
              </PlatformCard>
            ) : report ? (
              <TestReportView report={report} t={t} />
            ) : (
              <PlatformCard>
                <p className="text-sm text-muted-foreground">{t("platform.minioPage.noTestYet")}</p>
              </PlatformCard>
            )}
          </PlatformSection>
        </div>
      )}
    </PlatformShell>
  );
}

function ConfigRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
      <dt className="font-code text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-medium">{value}</dd>
    </div>
  );
}

function TestReportView({
  report,
  t,
}: {
  report: MinioTestReport;
  t: (key: string) => string;
}) {
  return (
    <div className="space-y-4">
      <PlatformCard className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {report.ok ? (
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
          ) : (
            <XCircle className="size-5 text-destructive" aria-hidden />
          )}
          <Badge variant={report.ok ? "default" : "destructive"}>
            {report.ok ? t("platform.minioPage.passed") : t("platform.minioPage.failed")}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {t("platform.minioPage.duration")}: {report.durationMs} ms
          </span>
        </div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <ConfigRow label={t("platform.minioPage.runId")} value={report.testRunId} />
          <ConfigRow
            label={t("platform.minioPage.bucketReachable")}
            value={report.bucketReachable ? t("common.yes") : t("common.no")}
          />
          <ConfigRow label={t("platform.minioPage.startedAt")} value={report.startedAt} />
          <ConfigRow label={t("platform.minioPage.finishedAt")} value={report.finishedAt} />
        </dl>
        {report.error ? <p className="text-sm text-destructive">{report.error}</p> : null}
        {report.bucketError ? (
          <p className="text-sm text-destructive">
            {t("platform.minioPage.bucketError")}: {report.bucketError}
          </p>
        ) : null}
      </PlatformCard>

      {report.uploads.length > 0 ? (
        <PlatformSection title={t("platform.minioPage.uploadsTitle")}>
          <div className="space-y-3">
            {report.uploads.map((upload) => (
              <PlatformCard key={upload.key} className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{upload.kind}</Badge>
                  <Badge variant={upload.verified ? "default" : "destructive"}>
                    {upload.verified ? t("platform.minioPage.verified") : t("platform.minioPage.notVerified")}
                  </Badge>
                </div>
                <dl className="grid gap-2 sm:grid-cols-2">
                  <ConfigRow label={t("platform.minioPage.objectKey")} value={upload.key} />
                  <ConfigRow label={t("platform.minioPage.bucket")} value={upload.bucket} />
                  <ConfigRow label={t("platform.minioPage.contentType")} value={upload.contentType} />
                  <ConfigRow label={t("platform.minioPage.size")} value={`${upload.size} bytes`} />
                  <ConfigRow label="ETag" value={upload.etag ?? "—"} />
                  <ConfigRow label={t("platform.minioPage.objectUrl")} value={upload.objectUrl} />
                </dl>
                <p className="text-xs text-muted-foreground">{upload.verifyDetail}</p>
              </PlatformCard>
            ))}
          </div>
        </PlatformSection>
      ) : null}

      {report.listedObjects.length > 0 ? (
        <PlatformSection title={t("platform.minioPage.listTitle")}>
          <PlatformCard className="space-y-2">
            {report.listedObjects.map((item) => (
              <div
                key={item.key}
                className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 py-2 last:border-0"
              >
                <code className="text-xs">{item.key}</code>
                <span className="text-xs text-muted-foreground">
                  {item.size} bytes · {item.lastModified ?? "—"}
                </span>
              </div>
            ))}
          </PlatformCard>
        </PlatformSection>
      ) : report.listError ? (
        <p className="text-sm text-destructive">
          {t("platform.minioPage.listError")}: {report.listError}
        </p>
      ) : null}
    </div>
  );
}
