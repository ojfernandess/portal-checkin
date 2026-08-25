import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";

/** Limite da API Inbox para foto de hóspede (multipart). */
export const MAX_INBOX_GUEST_PHOTO_BYTES = 8 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);

export type ImageFileBase64 = {
  base64: string;
  mimeType: string;
  previewUrl: string;
  fileName: string;
};

function readImageFileAsBase64(file: File): Promise<ImageFileBase64> {
  return new Promise((resolve, reject) => {
    if (!ALLOWED_MIME_TYPES.has(file.type.toLowerCase())) {
      reject(new Error("INVALID_TYPE"));
      return;
    }
    if (file.size > MAX_INBOX_GUEST_PHOTO_BYTES) {
      reject(new Error("TOO_LARGE"));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const match = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl);
      if (!match?.[2]) {
        reject(new Error("READ_FAILED"));
        return;
      }
      resolve({
        base64: match[2],
        mimeType: match[1] ?? file.type,
        previewUrl: dataUrl,
        fileName: file.name,
      });
    };
    reader.onerror = () => reject(new Error("READ_FAILED"));
    reader.readAsDataURL(file);
  });
}

type Props = {
  id: string;
  value: ImageFileBase64 | null;
  onChange: (value: ImageFileBase64 | null) => void;
  optional?: boolean;
};

export function InboxGuestPhotoUpload({ id, value, onChange, optional = true }: Props) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      onChange(await readImageFileAsBase64(file));
    } catch (err) {
      const code = err instanceof Error ? err.message : "READ_FAILED";
      if (code === "INVALID_TYPE") setError(t("admin.inbox.photoInvalidType"));
      else if (code === "TOO_LARGE") setError(t("admin.inbox.photoTooLarge"));
      else setError(t("admin.inbox.photoReadFailed"));
      onChange(null);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>
          {t("admin.inbox.guestPhoto")}
          {optional ? ` (${t("common.optional")})` : ""}
        </Label>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
            <X className="size-4" aria-hidden />
            {t("admin.inbox.photoRemove")}
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted-foreground">{t("admin.inbox.guestPhotoHint")}</p>

      <input
        ref={inputRef}
        id={id}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(event) => {
          void handleFileChange(event.target.files?.[0]);
          event.target.value = "";
        }}
      />

      {!value ? (
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          <ImagePlus className="size-4" aria-hidden />
          {t("admin.inbox.photoChoose")}
        </Button>
      ) : (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
          <img
            src={value.previewUrl}
            alt={t("admin.inbox.guestPhotoPreview")}
            className="size-16 rounded-md object-cover ring-1 ring-border"
          />
          <div className="min-w-0 text-xs text-muted-foreground">
            <p className="truncate font-medium text-foreground">{value.fileName}</p>
            <p>{t("admin.inbox.photoSelectedHint")}</p>
          </div>
        </div>
      )}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}

      <p className="text-[11px] text-muted-foreground">
        {t("admin.inbox.photoMaxSize", { maxMb: Math.round(MAX_INBOX_GUEST_PHOTO_BYTES / 1024 / 1024) })}
      </p>
    </div>
  );
}
