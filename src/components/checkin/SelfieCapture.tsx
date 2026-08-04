import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera, Loader2, Upload, X } from "lucide-react";
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

export type SelfieCaptureResult = {
  photoBase64: string;
};

type Phase = "idle" | "live" | "preview";

type Props = {
  value: string | null;
  onCapture: (dataUrl: string) => void;
  onConfirm?: (result: SelfieCaptureResult) => void;
  title?: string;
  /** Versão reduzida para tile de foto cadastrada */
  compact?: boolean;
} & Partial<ExclusiveCameraProps>;

const JPEG_QUALITY = 0.85;

export function SelfieCapture({
  value,
  onCapture,
  onConfirm,
  title,
  compact = false,
  captureId,
  activeCaptureId,
  onRequestCapture,
  onReleaseCapture,
}: Props) {
  const { t } = useI18n();
  const maskId = useId().replace(/:/g, "");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [videoReady, setVideoReady] = useState(false);

  const assignVideoRef = useCallback((node: HTMLVideoElement | null) => {
    videoRef.current = node;
    setVideoReady(Boolean(node));
  }, []);

  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openingCamera, setOpeningCamera] = useState(false);

  const stopCamera = useCallback(() => {
    unregisterActiveDeviceStream(streamRef.current);
    stopMediaStream(streamRef.current);
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  const closeLiveCamera = useCallback(() => {
    stopCamera();
    setOpeningCamera(false);
    setVideoReady(false);
    setPhase("idle");
    if (captureId && onReleaseCapture) {
      onReleaseCapture(captureId);
    }
  }, [captureId, onReleaseCapture, stopCamera]);

  const { requestCapture } = useExclusiveCamera({
    captureId,
    activeCaptureId,
    onRequestCapture,
    onReleaseCapture,
    isLive: phase === "live" || openingCamera,
    stopLive: closeLiveCamera,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (phase !== "live" && !openingCamera) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [openingCamera, phase]);

  const beginCamera = useCallback(() => {
    setError(null);
    setPreviewUrl(null);
    stopCamera();
    requestCapture();
    setOpeningCamera(true);
  }, [requestCapture, stopCamera]);

  useEffect(() => {
    if (!openingCamera || !videoReady) return;

    let cancelled = false;

    void (async () => {
      await yieldForCameraHandoff();
      if (cancelled) return;

      if (!navigator.mediaDevices?.getUserMedia) {
        setError(t("checkin.camera.accessError"));
        setOpeningCamera(false);
        return;
      }

      const video = videoRef.current;
      if (!video) return;

      try {
        const stream = await acquireCameraStream("user");
        if (cancelled) {
          stopMediaStream(stream);
          return;
        }
        streamRef.current = stream;
        await attachStreamToVideo(video, stream);
        if (cancelled) return;
        setPhase("live");
        setOpeningCamera(false);
      } catch {
        if (cancelled) return;
        stopCamera();
        if (captureId && onReleaseCapture) {
          onReleaseCapture(captureId);
        }
        setError(t("checkin.camera.accessError"));
        setOpeningCamera(false);
        setPhase("idle");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [captureId, onReleaseCapture, openingCamera, stopCamera, t, videoReady]);

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 720;
    const height = video.videoHeight || 960;
    if (width <= 0 || height <= 0) return;

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.save();
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();

    const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
    setPreviewUrl(dataUrl);
    setPhase("preview");
    stopCamera();
    setOpeningCamera(false);
    if (captureId && onReleaseCapture) {
      onReleaseCapture(captureId);
    }
  }

  function confirmPhoto() {
    const photo = previewUrl ?? value;
    if (!photo) return;
    onCapture(photo);
    onConfirm?.({ photoBase64: photo });
    setPreviewUrl(null);
    setPhase("idle");
  }

  function retake() {
    setPreviewUrl(null);
    onCapture("");
    beginCamera();
  }

  function replaceConfirmed() {
    onCapture("");
    beginCamera();
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    closeLiveCamera();
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      setPreviewUrl(result);
      setPhase("preview");
    };
    reader.readAsDataURL(file);
  }

  const showingPreview = phase === "preview" && previewUrl;
  const showingConfirmed = phase === "idle" && value && !previewUrl;
  const showingLive = phase === "live" || openingCamera;
  const showLivePortal = showingLive && mounted;

  const viewportClass = cn(
    "relative overflow-hidden bg-black",
    compact
      ? "aspect-square w-full rounded-xl border border-border"
      : showingConfirmed || showingPreview
        ? "h-[min(72vh,520px)] w-full rounded-2xl"
        : "h-[min(56vh,420px)] w-full rounded-2xl",
  );

  const liveFullscreen = showLivePortal
    ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex h-dvh max-h-dvh flex-col touch-none bg-black"
          role="dialog"
          aria-modal="true"
          aria-label={t("checkin.selfieCapture.takePhoto")}
        >
          <div className="flex shrink-0 items-center justify-between px-4 pb-2 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <p className="text-sm font-medium text-white/90">
              {title ?? t("checkin.photos.selfie")}
            </p>
            <button
              type="button"
              className="flex size-10 items-center justify-center rounded-full bg-black/50 text-white"
              aria-label={t("common.back")}
              onClick={closeLiveCamera}
            >
              <X className="size-5" aria-hidden />
            </button>
          </div>

          <div className="relative min-h-0 flex-1">
            <video
              ref={assignVideoRef}
              playsInline
              muted
              autoPlay
              className={cn(
                "absolute inset-0 h-full w-full object-cover -scale-x-100",
                openingCamera && !streamRef.current && "opacity-0",
              )}
            />
            {openingCamera && !streamRef.current ? (
              <div className="absolute inset-0 flex items-center justify-center bg-black">
                <Loader2 className="size-10 animate-spin text-white/80" aria-hidden />
              </div>
            ) : null}
            <SelfieOverlay maskId={maskId} fullscreen />
          </div>

          {error ? <p className="shrink-0 px-4 pb-2 text-sm text-red-400">{error}</p> : null}

          <div className="shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <Button
              type="button"
              className="tap-safe w-full"
              disabled={openingCamera}
              onClick={captureFrame}
            >
              {openingCamera ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  {t("common.loading")}
                </>
              ) : (
                t("checkin.selfieCapture.takePhoto")
              )}
            </Button>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      {liveFullscreen}

      <div className={cn("flex flex-col", compact ? "space-y-2" : "space-y-3")}>
        {title ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        ) : null}

        <div className={viewportClass}>
          <canvas ref={canvasRef} className="hidden" aria-hidden />

          {showingConfirmed ? (
            <img src={value} alt="" className="relative z-10 size-full object-cover" />
          ) : showingPreview ? (
            <img src={previewUrl} alt="" className="relative z-10 size-full object-cover" />
          ) : showingLive ? (
            <div className="relative z-10 flex size-full min-h-48 items-center justify-center bg-muted p-6 text-muted-foreground">
              <p className="max-w-xs text-center text-sm">{t("checkin.selfieCapture.openHint")}</p>
            </div>
          ) : (
            <div className="relative z-10 flex size-full min-h-48 flex-col items-center justify-center gap-3 bg-muted p-6 text-muted-foreground">
              <Camera className={cn(compact ? "size-8" : "size-12")} aria-hidden />
              <p className="max-w-xs text-center text-sm">{t("checkin.selfieCapture.openHint")}</p>
            </div>
          )}
        </div>

        {error && !showingLive ? (
          <p className={cn("text-destructive", compact ? "text-xs" : "text-sm")}>{error}</p>
        ) : null}

        {!showingLive ? (
          <div className="flex flex-col gap-2">
            {showingConfirmed ? (
              <>
                <Button type="button" variant="outline" className="tap-safe w-full" onClick={replaceConfirmed}>
                  <Camera className="size-4 shrink-0" aria-hidden />
                  {t("checkin.selfieCapture.retake")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="tap-safe w-full"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-4 shrink-0" aria-hidden />
                  {t("checkin.camera.uploadPhoto")}
                </Button>
              </>
            ) : showingPreview ? (
              <>
                <Button type="button" className="tap-safe w-full" onClick={confirmPhoto}>
                  {t("checkin.selfieCapture.usePhoto")}
                </Button>
                <Button type="button" variant="outline" className="tap-safe w-full" onClick={retake}>
                  {t("checkin.selfieCapture.retake")}
                </Button>
              </>
            ) : (
              <>
                <Button type="button" className="tap-safe w-full" onClick={beginCamera}>
                  <Camera className="size-4 shrink-0" aria-hidden />
                  {t("checkin.camera.openCamera")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="tap-safe w-full"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="size-4 shrink-0" aria-hidden />
                  {t("checkin.camera.uploadPhoto")}
                </Button>
              </>
            )}
          </div>
        ) : null}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="user"
          className="sr-only"
          onChange={(event) => {
            pickFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
      </div>
    </>
  );
}

function SelfieOverlay({
  maskId,
  fullscreen = false,
  compact = false,
}: {
  maskId: string;
  fullscreen?: boolean;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const cutoutId = `${maskId}-cutout`;
  const ovalCy = fullscreen ? "38" : compact ? "44" : "40";
  const ovalRx = fullscreen ? "28" : compact ? "32" : "30";
  const ovalRy = fullscreen ? "34" : compact ? "36" : "38";

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <mask id={cutoutId}>
            <rect width="100" height="100" fill="white" />
            <ellipse cx="50" cy={ovalCy} rx={ovalRx} ry={ovalRy} fill="black" />
          </mask>
        </defs>
        <rect width="100" height="100" fill="rgba(0,0,0,0.65)" mask={`url(#${cutoutId})`} />
        <ellipse
          cx="50"
          cy={ovalCy}
          rx={ovalRx}
          ry={ovalRy}
          fill="none"
          stroke="#22C55E"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          className="selfie-oval-pulse"
        />
      </svg>
      <p
        className={cn(
          "absolute inset-x-0 text-center font-medium text-white drop-shadow-md",
          fullscreen ? "bottom-[22%] px-4 text-sm" : compact ? "bottom-[12%] px-2 text-xs" : "bottom-[16%] px-4 text-sm",
        )}
      >
        {t("checkin.selfieCapture.positionFace")}
      </p>
    </div>
  );
}
