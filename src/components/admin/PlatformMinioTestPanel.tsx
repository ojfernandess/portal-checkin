import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, HardDriveUpload, Loader2, XCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { PlatformCard, PlatformSection } from "@/components/admin/PlatformShell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  platformGetMinioStatus,
  platformTestMinioStorage,
} from "@/lib/api/platform.functions";
import type { MinioTestResult } from "@/lib/s3.server";
import { useI18n } from "@/lib/i18n/context";

type PendingUpload = {
  name: string;
  base64: string;
  contentType?: string;
};

function readFileAsBase64(file: File): Promise<PendingUpload> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("empty file"));
        return;
      }
      resolve({
        name: file.name,
        base64: result,
        contentType: file.type || undefined,
      });
    };
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export function PlatformMinioTestPanel() {
  const { t } = useI18n();
  const loadStatus = useServerFn(platformGetMinioStatus);
  const runTest = useServerFn(platformTestMinioStorage);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [statusLoading, setStatusLoading] = useState(true);
  const [configured, setConfigured] = useState(false);
  const [bucket, setBucket] = useState<string>();
  const [endpoint, setEndpoint] = useState<string>();
  const [region, setRegion] = useState<string>();
  const [pendingFiles, setPendingFiles] = useState<PendingUpload[]>([]);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<MinioTestResult | null>(null);

  useEffect(() => {
    void loadStatus()
      .then((summary) => {
        setConfigured(summary.configured);
        setBucket(summary.bucket);
        setEndpoint(summary.endpoint);
        setRegion(summary.region);
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : t("platform.minio.loadError"));
      })
      .finally(() => setStatusLoading(false));
  }, [loadStatus, t]);

  async function handleFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    try {
      const uploads = await Promise.all(Array.from(files).slice(0, 5).map(readFileAsBase64));
      setPendingFiles((current) => [...current, ...uploads].slice(0, 5));
      setResult(null);
    } catch {
      toast.error(t("platform.minio.fileReadError"));
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleRunTest() {
    setTesting(true);
    setResult(null);
    try {
      const response = await runTest({
        data: pendingFiles.length > 0 ? { files: pendingFiles } : {},
      });
      setResult(response);
      if (response.success) {
        toast.success(t("platform.minio.testSuccess"));
      } else {
        toast.error(response.error ?? t("platform.minio.testFailed"));
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("platform.minio.testFailed"));
    } finally {
      setTesting(false);
    }
  }

  return (
    <PlatformSection
      title={t("platform.minio.title")}
      description={t("platform.minio.description")}
    >
      {statusLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {t("common.loading")}
        </div>
      ) : (
        <div className="space-y-5">
          <PlatformCard className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={configured ? "default" : "secondary"}>
                {configured ? t("platform.minio.configured") : t("platform.minio.notConfigured")}
              </Badge>
              {bucket ? (
                <Badge variant="outline">
                  {t("platform.minio.bucket")}: {bucket}
                </Badge>
              ) : null}
            </div>
            {endpoint ? (
              <p className="text-sm text-muted-foreground">
                {t("platform.minio.endpoint")}: <span className="font-mono text-foreground">{endpoint}</span>
              </p>
            ) : null}
            {region ? (
              <p className="text-sm text-muted-foreground">
                {t("platform.minio.region")}: <span className="font-mono text-foreground">{region}</span>
              </p>
            ) : null}
            {!configured ? (
              <p className="text-sm text-muted-foreground">{t("platform.minio.envHint")}</p>
            ) : null}
          </PlatformCard>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="minio-test-files">{t("platform.minio.optionalFiles")}</Label>
              <Input
                id="minio-test-files"
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,.pdf,.txt,.json"
                disabled={!configured || testing}
                onChange={(event) => void handleFilesSelected(event.target.files)}
              />
              <p className="text-xs text-muted-foreground">{t("platform.minio.optionalFilesHint")}</p>
            </div>

            {pendingFiles.length > 0 ? (
              <ul className="space-y-1 text-sm text-muted-foreground">
                {pendingFiles.map((file) => (
                  <li key={file.name} className="font-mono">
                    {file.name}
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" disabled={!configured || testing} onClick={() => void handleRunTest()}>
                {testing ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    {t("platform.minio.testing")}
                  </>
                ) : (
                  <>
                    <HardDriveUpload className="mr-2 size-4" aria-hidden />
                    {t("platform.minio.runTest")}
                  </>
                )}
              </Button>
              {pendingFiles.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={testing}
                  onClick={() => {
                    setPendingFiles([]);
                    setResult(null);
                  }}
                >
                  {t("platform.minio.clearFiles")}
                </Button>
              ) : null}
            </div>
          </div>

          {result ? (
            <PlatformCard className="space-y-4">
              <div className="flex items-center gap-2">
                {result.success ? (
                  <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
                ) : (
                  <XCircle className="size-5 text-destructive" aria-hidden />
                )}
                <p className="font-medium">
                  {result.success ? t("platform.minio.testSuccess") : t("platform.minio.testFailed")}
                </p>
              </div>
              {result.error ? <p className="text-sm text-destructive">{result.error}</p> : null}
              <div className="overflow-x-auto rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">{t("platform.minio.colFile")}</th>
                      <th className="px-3 py-2 font-medium">{t("platform.minio.colKey")}</th>
                      <th className="px-3 py-2 font-medium">{t("platform.minio.colSize")}</th>
                      <th className="px-3 py-2 font-medium">{t("platform.minio.colVerified")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.uploads.map((upload) => (
                      <tr key={upload.key} className="border-t border-border">
                        <td className="px-3 py-2">{upload.name}</td>
                        <td className="px-3 py-2 font-mono text-xs">{upload.key}</td>
                        <td className="px-3 py-2 tabular-nums">{upload.sizeBytes} B</td>
                        <td className="px-3 py-2">
                          {upload.verified ? (
                            <Badge className="border-0 bg-emerald-600 text-white hover:bg-emerald-600">
                              {t("platform.minio.verified")}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">{t("platform.minio.notVerified")}</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PlatformCard>
          ) : null}
        </div>
      )}
    </PlatformSection>
  );
}
