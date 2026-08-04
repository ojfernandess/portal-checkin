import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  acquireCameraStream,
  attachStreamToVideo,
  stopMediaStream,
  unregisterActiveDeviceStream,
  yieldForCameraHandoff,
  type ExclusiveCameraProps,
} from "@/lib/camera-utils";
import { useExclusiveCamera } from "@/lib/use-exclusive-camera";

type Props = {
  facingMode: "user" | "environment";
  value: string | null;
  onCapture: (dataUrl: string) => void;
  label: string;
  /** Layout reduzido para exibir duas fotos lado a lado */
  compact?: boolean;
  title?: string;
} & Partial<ExclusiveCameraProps>;

export function CameraCapture({
  facingMode,
  value,
  onCapture,
  label,
  compact = false,
  title,
  captureId,
  activeCaptureId,
  onRequestCapture,
  onReleaseCapture,
}: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    unregisterActiveDeviceStream(streamRef.current);
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setLive(false);
  }, []);

  const closeLiveCamera = useCallback(() => {
    stopCamera();
    if (captureId && onReleaseCapture) {
      onReleaseCapture(captureId);
    }
  }, [captureId, onReleaseCapture, stopCamera]);

  const { requestCapture } = useExclusiveCamera({
    captureId,
    activeCaptureId,
    onRequestCapture,
    onReleaseCapture,
    isLive: live,
    stopLive: closeLiveCamera,
  });

  useEffect(() => () => stopCamera(), [stopCamera]);

  const start = useCallback(async () => {
    setError(null);
    stopCamera();
    requestCapture();
    await yieldForCameraHandoff();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("checkin.camera.accessError"));
      return;
    }

    const video = videoRef.current;
    if (!video) {
      setError(t("checkin.camera.accessError"));
      return;
    }

    try {
      const stream = await acquireCameraStream(facingMode);
      streamRef.current = stream;
      await attachStreamToVideo(video, stream);
      setLive(true);
    } catch {
      stopCamera();
      if (captureId && onReleaseCapture) {
        onReleaseCapture(captureId);
      }
      setError(t("checkin.camera.accessError"));
    }
  }, [captureId, facingMode, onReleaseCapture, requestCapture, stopCamera, t]);

  function shoot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.82));
    closeLiveCamera();
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    closeLiveCamera();
    const reader = new FileReader();
    reader.onload = () => onCapture(String(reader.result));
    reader.readAsDataURL(file);
  }

  function replaceFromCamera() {
    onCapture("");
    void start();
  }

  function openFilePicker() {
    closeLiveCamera();
    fileRef.current?.click();
  }

  const displayTitle = title ?? (compact ? t("checkin.camera.photo") : undefined);

  return (
    <div className={cn(compact ? "space-y-2" : "space-y-3")}>
      {displayTitle ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {displayTitle}
        </p>
      ) : null}

      <div
        className={cn(
          "relative overflow-hidden rounded-xl border bg-black",
          compact ? "aspect-square border-border" : "aspect-[3/4] border-border",
          value && compact && "ring-2 ring-success/40 ring-offset-2 ring-offset-background",
        )}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          aria-hidden={!live}
          className={cn(
            "absolute inset-0 size-full object-cover",
            live ? "z-0 opacity-100" : "pointer-events-none z-0 opacity-0",
          )}
        />

        {value ? (
          <>
            <img src={value} alt={label} className="relative z-10 size-full object-cover" />
            {!compact ? (
              <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10">
                <p className="text-center text-xs font-medium text-white">{t("checkin.camera.selected")}</p>
              </div>
            ) : null}
          </>
        ) : live ? null : (
          <div className="relative z-10 flex size-full flex-col items-center justify-center gap-2 bg-muted p-3 text-muted-foreground">
            <Camera className={cn(compact ? "size-5" : "size-8")} aria-hidden />
            {!compact ? <p className="px-4 text-center text-sm">{label}</p> : null}
          </div>
        )}
      </div>

      {error && <p className={cn("text-destructive", compact ? "text-xs" : "text-sm")}>{error}</p>}

      <div className={cn("flex gap-2", compact ? "flex-col" : "flex-col sm:flex-row")}>
        {value ? (
          <>
            <Button
              type="button"
              variant="outline"
              size={compact ? "sm" : "default"}
              className="tap-safe flex-1"
              onClick={replaceFromCamera}
            >
              <Camera className="size-4 shrink-0" aria-hidden />
              {compact ? t("checkin.camera.change") : t("checkin.camera.retake")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size={compact ? "sm" : "default"}
              className="tap-safe flex-1"
              onClick={openFilePicker}
            >
              <Upload className="size-4 shrink-0" aria-hidden />
              {compact ? t("checkin.camera.uploadPhoto") : t("checkin.camera.uploadAnother")}
            </Button>
          </>
        ) : live ? (
          <Button
            type="button"
            size={compact ? "sm" : "default"}
            className="tap-safe flex-1"
            onClick={shoot}
          >
            {t("checkin.camera.capture")}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              size={compact ? "sm" : "default"}
              className="tap-safe flex-1"
              onClick={() => void start()}
            >
              <Camera className="size-4 shrink-0" aria-hidden />
              {t("checkin.camera.openCamera")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size={compact ? "sm" : "default"}
              className="tap-safe flex-1"
              onClick={openFilePicker}
            >
              <Upload className="size-4 shrink-0" aria-hidden />
              {t("checkin.camera.uploadPhoto")}
            </Button>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/*"
        className="sr-only"
        onChange={(event) => {
          pickFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
