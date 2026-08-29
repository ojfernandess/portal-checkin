import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CameraCapture } from "@/components/checkin/CameraCapture";
import { SelfieCapture, type SelfieValidationOutcome } from "@/components/checkin/SelfieCapture";
import { getCheckinPhotoDisplay } from "@/lib/api/checkin.functions";
import type { ExclusiveCameraProps } from "@/lib/camera-utils";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  photoType: "profile" | "document";
  registeredUrl?: string | null;
  mediaId?: string | number | null;
  label: string;
  facingMode: "user" | "environment";
  editing: boolean;
  editValue: string | null;
  onStartEdit: (resolvedUrl?: string | null) => void;
  onCancelEdit: () => void;
  onCapture: (value: string) => void;
  validationEnabled?: boolean;
  onValidateSelfie?: (photoBase64: string) => Promise<SelfieValidationOutcome>;
} & Partial<ExclusiveCameraProps>;

export function RegisteredPhotoTile({
  title,
  photoType,
  registeredUrl,
  mediaId,
  label,
  facingMode,
  editing,
  editValue,
  onStartEdit,
  onCancelEdit,
  onCapture,
  validationEnabled = false,
  onValidateSelfie,
  captureId,
  activeCaptureId,
  onRequestCapture,
  onReleaseCapture,
}: Props) {
  const { t } = useI18n();
  const loadPhoto = useServerFn(getCheckinPhotoDisplay);
  const [displayUrl, setDisplayUrl] = useState<string | null>(registeredUrl ?? null);
  const [loadingPhoto, setLoadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(false);

  useEffect(() => {
    if (editing) return;
    if (!registeredUrl && mediaId == null) {
      setDisplayUrl(null);
      setPhotoError(false);
      return;
    }

    let active = true;
    setLoadingPhoto(true);
    setPhotoError(false);

    void loadPhoto({
      data: {
        type: photoType,
        url: registeredUrl ?? undefined,
        id: mediaId ?? undefined,
      },
    })
      .then((result) => {
        if (!active) return;
        setDisplayUrl(result.displayUrl ?? registeredUrl ?? null);
        setPhotoError(!result.displayUrl && !registeredUrl);
      })
      .catch(() => {
        if (!active) return;
        setDisplayUrl(registeredUrl ?? null);
        setPhotoError(!registeredUrl);
      })
      .finally(() => {
        if (active) setLoadingPhoto(false);
      });

    return () => {
      active = false;
    };
  }, [editing, loadPhoto, mediaId, photoType, registeredUrl]);

  if (editing) {
    return (
      <div className="space-y-2">
        {photoType === "profile" && facingMode === "user" ? (
          <SelfieCapture
            compact
            title={title}
            value={editValue}
            onCapture={onCapture}
            photoGuidance="registered"
            validationEnabled={validationEnabled}
            onValidate={onValidateSelfie}
            captureId={captureId}
            activeCaptureId={activeCaptureId}
            onRequestCapture={onRequestCapture}
            onReleaseCapture={onReleaseCapture}
          />
        ) : (
          <CameraCapture
            compact
            title={title}
            facingMode={facingMode}
            value={editValue}
            label={label}
            onCapture={onCapture}
            captureId={captureId}
            activeCaptureId={activeCaptureId}
            onRequestCapture={onRequestCapture}
            onReleaseCapture={onReleaseCapture}
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="tap-safe h-8 w-full text-xs"
          onClick={onCancelEdit}
        >
          {t("checkin.photos.keepRegistered")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      {photoType === "profile" && facingMode === "user" ? (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t("checkin.photos.registeredQualityNotice")}
        </p>
      ) : null}
      <div
        className={cn(
          "relative aspect-square overflow-hidden rounded-xl border border-border bg-muted",
          displayUrl && !photoError && "ring-2 ring-success/40 ring-offset-2 ring-offset-background",
        )}
      >
        {loadingPhoto ? (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Loader2 className="size-6 animate-spin" aria-hidden />
          </div>
        ) : displayUrl && !photoError ? (
          <img
            src={displayUrl}
            alt={label}
            className="size-full object-cover"
            onError={() => setPhotoError(true)}
          />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-center text-muted-foreground">
            <Camera className="size-5" aria-hidden />
            <span className="text-xs">{t("checkin.photos.unavailable")}</span>
          </div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" className="tap-safe w-full" onClick={() => onStartEdit(displayUrl)}>
        {t("checkin.photos.changePhoto")}
      </Button>
    </div>
  );
}
