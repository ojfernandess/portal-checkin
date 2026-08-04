import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

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
};

const JPEG_QUALITY = 0.85;

async function requestFrontCameraStream(): Promise<MediaStream> {
  const constraints: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: "user" } }, audio: false },
    { video: { facingMode: "user" }, audio: false },
    { video: true, audio: false },
  ];

  let lastError: unknown;
  for (const constraint of constraints) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraint);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

async function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;

  await new Promise<void>((resolve, reject) => {
    const onReady = () => {
      video.removeEventListener("loadedmetadata", onReady);
      resolve();
    };
    video.addEventListener("loadedmetadata", onReady);
    if (video.readyState >= 1) {
      video.removeEventListener("loadedmetadata", onReady);
      resolve();
    }
    setTimeout(() => {
      video.removeEventListener("loadedmetadata", onReady);
      resolve();
    }, 1500);
  });

  await video.play();
}

export function SelfieCapture({ value, onCapture, onConfirm, title, compact = false }: Props) {
  const { t } = useI18n();
  const maskId = useId().replace(/:/g, "");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [phase, setPhase] = useState<Phase>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  useEffect(() => {
    if (phase !== "live" || compact) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [phase, compact]);

  const startCamera = useCallback(async () => {
    setError(null);
    setPreviewUrl(null);
    stopCamera();

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
      const stream = await requestFrontCameraStream();
      streamRef.current = stream;
      await attachStreamToVideo(video, stream);
      setPhase("live");
    } catch {
      stopCamera();
      setError(t("checkin.camera.accessError"));
      setPhase("idle");
    }
  }, [stopCamera, t]);

  function closeLiveCamera() {
    stopCamera();
    setPhase("idle");
  }

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
    void startCamera();
  }

  function replaceConfirmed() {
    onCapture("");
    void startCamera();
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      setPreviewUrl(result);
      setPhase("preview");
      stopCamera();
    };
    reader.readAsDataURL(file);
  }

  const showingPreview = phase === "preview" && previewUrl;
  const showingConfirmed = phase === "idle" && value && !previewUrl;
  const showingLive = phase === "live";
  const fullscreenLive = showingLive && !compact;

  const viewportClass = cn(
    "relative overflow-hidden bg-black",
    compact
      ? "aspect-square w-full rounded-xl border border-border"
      : showingConfirmed || showingPreview
        ? "h-[min(72vh,520px)] w-full rounded-2xl"
        : "h-[min(56vh,420px)] w-full rounded-2xl",
    fullscreenLive && "flex-1 rounded-none border-0",
  );

  return (
    <div
      className={cn(
        "flex flex-col",
        compact ? "space-y-2" : "space-y-3",
        fullscreenLive && "fixed inset-0 z-50 bg-black",
      )}
    >
        {title && !fullscreenLive ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        ) : null}

        <div className={viewportClass}>
          <canvas ref={canvasRef} className="hidden" aria-hidden />

          {/* Vídeo sempre montado para o ref existir antes de getUserMedia resolver */}
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            aria-hidden={!showingLive}
            className={cn(
              "absolute inset-0 h-full w-full object-cover -scale-x-100",
              showingLive ? "z-0 opacity-100" : "pointer-events-none z-0 opacity-0",
            )}
          />

          {showingLive ? <SelfieOverlay maskId={maskId} compact={compact || fullscreenLive} /> : null}

          {showingConfirmed ? (
            <img src={value} alt="" className="relative z-10 size-full object-cover" />
          ) : showingPreview ? (
            <img src={previewUrl} alt="" className="relative z-10 size-full object-cover" />
          ) : showingLive ? null : (
            <div className="relative z-10 flex size-full min-h-48 flex-col items-center justify-center gap-3 bg-muted p-6 text-muted-foreground">
              <Camera className={cn(compact ? "size-8" : "size-12")} aria-hidden />
              <p className="max-w-xs text-center text-sm">{t("checkin.selfieCapture.openHint")}</p>
            </div>
          )}

          {fullscreenLive ? (
            <button
              type="button"
              className="absolute right-3 top-3 z-20 flex size-10 items-center justify-center rounded-full bg-black/50 text-white"
              aria-label={t("common.back")}
              onClick={closeLiveCamera}
            >
              <X className="size-5" aria-hidden />
            </button>
          ) : null}
        </div>

        {error ? (
          <p className={cn("text-destructive", compact ? "text-xs" : "text-sm", fullscreenLive && "px-4")}>
            {error}
          </p>
        ) : null}

        <div
          className={cn(
            "flex flex-col gap-2",
            fullscreenLive && "absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/90 via-black/70 to-transparent px-4 pb-6 pt-10",
            !compact && showingLive && !fullscreenLive && "sticky bottom-0 z-10 bg-background/95 pb-1 pt-2 backdrop-blur-sm",
          )}
        >
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
          ) : showingLive ? (
            <Button type="button" className="tap-safe w-full" onClick={captureFrame}>
              {t("checkin.selfieCapture.takePhoto")}
            </Button>
          ) : (
            <>
              <Button type="button" className="tap-safe w-full" onClick={() => void startCamera()}>
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
  );
}

function SelfieOverlay({ maskId, compact }: { maskId: string; compact: boolean }) {
  const { t } = useI18n();
  const cutoutId = `${maskId}-cutout`;

  return (
    <div className="pointer-events-none absolute inset-0 z-10" aria-hidden>
      <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
        <defs>
          <mask id={cutoutId}>
            <rect width="100" height="100" fill="white" />
            <ellipse cx="50" cy={compact ? "44" : "40"} rx={compact ? "32" : "30"} ry={compact ? "36" : "38"} fill="black" />
          </mask>
        </defs>
        <rect width="100" height="100" fill="rgba(0,0,0,0.65)" mask={`url(#${cutoutId})`} />
        <ellipse
          cx="50"
          cy={compact ? "44" : "40"}
          rx={compact ? "32" : "30"}
          ry={compact ? "36" : "38"}
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
          compact ? "bottom-[12%] px-2 text-xs" : "bottom-[16%] px-4 text-sm",
        )}
      >
        {t("checkin.selfieCapture.positionFace")}
      </p>
    </div>
  );
}
