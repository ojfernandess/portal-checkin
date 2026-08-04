import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
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
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  useEffect(() => () => stopCamera(), [stopCamera]);

  const startCamera = useCallback(async () => {
    setError(null);
    setPreviewUrl(null);
    stopCamera();

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t("checkin.camera.accessError"));
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });
      streamRef.current = stream;
      setPhase("live");
      queueMicrotask(() => {
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        void video.play().catch(() => {
          setError(t("checkin.camera.accessError"));
          stopCamera();
          setPhase("idle");
        });
      });
    } catch {
      setError(t("checkin.camera.accessError"));
      setPhase("idle");
    }
  }, [stopCamera, t]);

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth || 720;
    const height = video.videoHeight || 960;
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

  return (
    <div className={cn("flex flex-col", compact ? "space-y-2" : "space-y-3")}>
      {title ? (
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      ) : null}

      <div
        className={cn(
          "relative overflow-hidden bg-black",
          compact ? "aspect-square rounded-xl border border-border" : "min-h-[min(72vh,520px)] rounded-2xl",
        )}
      >
        <canvas ref={canvasRef} className="hidden" aria-hidden />

        {showingConfirmed ? (
          <img src={value} alt="" className="size-full object-cover" />
        ) : showingPreview ? (
          <img src={previewUrl} alt="" className="size-full object-cover" />
        ) : showingLive ? (
          <>
            <video
              ref={videoRef}
              playsInline
              muted
              autoPlay
              className="size-full object-cover -scale-x-100"
            />
            <SelfieOverlay maskId={maskId} compact={compact} />
          </>
        ) : (
          <div className="flex size-full min-h-48 flex-col items-center justify-center gap-3 bg-muted p-6 text-muted-foreground">
            <Camera className={cn(compact ? "size-8" : "size-12")} aria-hidden />
            <p className="max-w-xs text-center text-sm">{t("checkin.selfieCapture.openHint")}</p>
          </div>
        )}
      </div>

      {error ? (
        <p className={cn("text-destructive", compact ? "text-xs" : "text-sm")}>{error}</p>
      ) : null}

      <div
        className={cn(
          "flex flex-col gap-2",
          !compact && showingLive && "sticky bottom-0 z-10 -mx-1 bg-background/95 pb-1 pt-2 backdrop-blur-sm",
        )}
      >
        {showingConfirmed ? (
          <>
            <Button type="button" variant="outline" className="tap-safe w-full" onClick={replaceConfirmed}>
              <Camera className="size-4 shrink-0" aria-hidden />
              {t("checkin.selfieCapture.retake")}
            </Button>
            <Button type="button" variant="outline" className="tap-safe w-full" onClick={() => fileRef.current?.click()}>
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
  const ovalId = `${maskId}-oval`;
  const cutoutId = `${maskId}-cutout`;

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <svg className="size-full" viewBox="0 0 100 100" preserveAspectRatio="none">
        <defs>
          <mask id={cutoutId}>
            <rect width="100" height="100" fill="white" />
            <ellipse cx="50" cy={compact ? "44" : "42"} rx={compact ? "30" : "28"} ry={compact ? "34" : "36"} fill="black" />
          </mask>
        </defs>
        <rect width="100" height="100" fill="rgba(0,0,0,0.62)" mask={`url(#${cutoutId})`} />
        <ellipse
          id={ovalId}
          cx="50"
          cy={compact ? "44" : "42"}
          rx={compact ? "30" : "28"}
          ry={compact ? "34" : "36"}
          fill="none"
          stroke="#22C55E"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
          className="selfie-oval-pulse"
        />
      </svg>
      <p
        className={cn(
          "absolute inset-x-0 text-center font-medium text-white",
          compact ? "bottom-[14%] px-2 text-[10px]" : "bottom-[18%] px-4 text-sm",
        )}
      >
        {t("checkin.selfieCapture.positionFace")}
      </p>
    </div>
  );
}
