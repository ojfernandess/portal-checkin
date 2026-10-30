import { maskToken } from "@/lib/tenant-pms.server";

const TEST_PREFIX = "platform-test";

export type MinioOnlyConfig = {
  configured: boolean;
  endpoint: string | null;
  bucket: string | null;
  region: string | null;
  forcePathStyle: boolean;
  accessKeyId: string | null;
  accessKeyMasked: string | null;
  secretKeyConfigured: boolean;
  secretKeyMasked: string | null;
  missingVars: string[];
};

export type MinioUploadResult = {
  kind: "image" | "text";
  key: string;
  bucket: string;
  size: number;
  contentType: string;
  etag: string | null;
  lastModified: string | null;
  objectUrl: string;
  verified: boolean;
  verifyDetail: string;
};

export type MinioTestReport = {
  ok: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  config: MinioOnlyConfig;
  bucketReachable: boolean;
  bucketError: string | null;
  testRunId: string;
  uploads: MinioUploadResult[];
  listedObjects: Array<{
    key: string;
    size: number;
    lastModified: string | null;
    etag: string | null;
  }>;
  listError: string | null;
  error: string | null;
};

function readEnv(name: string): string | undefined {
  const raw =
    process.env[name] ??
    (globalThis as { __env__?: Record<string, string | undefined> }).__env__?.[name];
  if (raw == null) return undefined;
  const trimmed = String(raw).trim();
  if (!trimmed) return undefined;
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim() || undefined;
  }
  return trimmed;
}

/** Lê somente variáveis MINIO_* (sem fallback AWS). */
export function readMinioOnlyConfig(): MinioOnlyConfig {
  const accessKeyId = readEnv("MINIO_ACCESS_KEY");
  const secretAccessKey = readEnv("MINIO_SECRET_KEY");
  const bucket = readEnv("MINIO_BUCKET");
  const endpoint = readEnv("MINIO_ENDPOINT");
  const region = readEnv("MINIO_REGION") ?? "sa-east-1";
  const forcePathStyle = readEnv("MINIO_FORCE_PATH_STYLE") !== "false";

  const missingVars: string[] = [];
  if (!accessKeyId) missingVars.push("MINIO_ACCESS_KEY");
  if (!secretAccessKey) missingVars.push("MINIO_SECRET_KEY");
  if (!bucket) missingVars.push("MINIO_BUCKET");
  if (!endpoint) missingVars.push("MINIO_ENDPOINT");

  return {
    configured: missingVars.length === 0,
    endpoint: endpoint ?? null,
    bucket: bucket ?? null,
    region,
    forcePathStyle,
    accessKeyId: accessKeyId ?? null,
    accessKeyMasked: accessKeyId ? maskToken(accessKeyId) : null,
    secretKeyConfigured: !!secretAccessKey,
    secretKeyMasked: secretAccessKey ? maskToken(secretAccessKey) : null,
    missingVars,
  };
}

function buildObjectUrl(
  config: MinioOnlyConfig & { configured: true },
  key: string,
): string {
  const base = config.endpoint!.replace(/\/$/, "");
  if (config.forcePathStyle) {
    return `${base}/${config.bucket}/${key}`;
  }
  return `${base}/${key}`;
}

async function getMinioClient(config: MinioOnlyConfig) {
  if (!config.configured || !config.accessKeyId || !config.secretKeyConfigured) {
    throw new Error("MinIO não configurado. Defina MINIO_ACCESS_KEY, MINIO_SECRET_KEY, MINIO_BUCKET e MINIO_ENDPOINT.");
  }

  const secretAccessKey = readEnv("MINIO_SECRET_KEY")!;
  const { S3Client } = await import("@aws-sdk/client-s3");

  return new S3Client({
    region: config.region ?? "sa-east-1",
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey,
    },
    endpoint: config.endpoint!,
    forcePathStyle: config.forcePathStyle,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/** JPEG mínimo válido (1×1 px) para teste de upload de foto. */
const MINIMAL_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAB//2Q==",
  "base64",
);

export async function runMinioStorageTest(): Promise<MinioTestReport> {
  const startedAt = new Date();
  const config = readMinioOnlyConfig();
  const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const report: MinioTestReport = {
    ok: false,
    startedAt: startedAt.toISOString(),
    finishedAt: startedAt.toISOString(),
    durationMs: 0,
    config,
    bucketReachable: false,
    bucketError: null,
    testRunId,
    uploads: [],
    listedObjects: [],
    listError: null,
    error: null,
  };

  if (!config.configured) {
    report.error = `Variáveis ausentes: ${config.missingVars.join(", ")}`;
    report.finishedAt = new Date().toISOString();
    report.durationMs = Date.now() - startedAt.getTime();
    return report;
  }

  try {
    const client = await getMinioClient(config);
    const bucket = config.bucket!;
    const { HeadBucketCommand, PutObjectCommand, HeadObjectCommand, ListObjectsV2Command, GetObjectCommand } =
      await import("@aws-sdk/client-s3");

    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      report.bucketReachable = true;
    } catch (error) {
      report.bucketError = error instanceof Error ? error.message : String(error);
      throw new Error(`Bucket "${bucket}" inacessível: ${report.bucketError}`);
    }

    const uploadSpecs = [
      {
        kind: "image" as const,
        key: `${TEST_PREFIX}/${testRunId}/test-photo.jpg`,
        body: MINIMAL_JPEG,
        contentType: "image/jpeg",
        expectedSnippet: null as string | null,
      },
      {
        kind: "text" as const,
        key: `${TEST_PREFIX}/${testRunId}/test-file.txt`,
        body: Buffer.from(
          `MinIO platform test\nrunId=${testRunId}\nat=${startedAt.toISOString()}\n`,
          "utf8",
        ),
        contentType: "text/plain; charset=utf-8",
        expectedSnippet: testRunId,
      },
    ];

    for (const spec of uploadSpecs) {
      const putResult = await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: spec.key,
          Body: spec.body,
          ContentType: spec.contentType,
          Metadata: {
            "x-test-run-id": testRunId,
            "x-test-kind": spec.kind,
          },
        }),
      );

      let verified = false;
      let verifyDetail = "HeadObject OK";

      try {
        const head = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: spec.key }));
        verified = (head.ContentLength ?? 0) === spec.body.byteLength;

        if (spec.expectedSnippet) {
          const getResult = await client.send(new GetObjectCommand({ Bucket: bucket, Key: spec.key }));
          const text = await getResult.Body?.transformToString("utf8");
          verified = verified && !!text?.includes(spec.expectedSnippet);
          verifyDetail = verified
            ? "HeadObject + conteúdo lidos com sucesso"
            : "HeadObject OK, mas conteúdo não confere";
        } else {
          verifyDetail = verified ? "HeadObject confirma tamanho da imagem" : "Tamanho divergente no HeadObject";
        }
      } catch (verifyError) {
        verifyDetail =
          verifyError instanceof Error ? verifyError.message : "Falha ao verificar objeto após upload";
      }

      report.uploads.push({
        kind: spec.kind,
        key: spec.key,
        bucket,
        size: spec.body.byteLength,
        contentType: spec.contentType,
        etag: putResult.ETag?.replace(/"/g, "") ?? null,
        lastModified: new Date().toISOString(),
        objectUrl: buildObjectUrl(config as MinioOnlyConfig & { configured: true }, spec.key),
        verified,
        verifyDetail,
      });
    }

    try {
      const listResult = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: `${TEST_PREFIX}/${testRunId}/`,
          MaxKeys: 20,
        }),
      );

      report.listedObjects = (listResult.Contents ?? []).map((item) => ({
        key: item.Key ?? "",
        size: item.Size ?? 0,
        lastModified: item.LastModified?.toISOString() ?? null,
        etag: item.ETag?.replace(/"/g, "") ?? null,
      }));
    } catch (listError) {
      report.listError = listError instanceof Error ? listError.message : String(listError);
    }

    report.ok =
      report.bucketReachable &&
      report.uploads.length === uploadSpecs.length &&
      report.uploads.every((item) => item.verified);
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - startedAt.getTime();
  return report;
}
