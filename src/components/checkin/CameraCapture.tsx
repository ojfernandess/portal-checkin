import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Props = {
  facingMode: "user" | "environment";
  value: string | null;
  onCapture: (dataUrl: string) => void;
  label: string;
  /** Layout reduzido para exibir duas fotos lado a lado */
  compact?: boolean;
  title?: string;
};

export function CameraCapture({
  facingMode,
  value,
  onCapture,
  label,
  compact = false,
  title,
}: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [live, setLive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setLive(false);
  }, []);

  useEffect(() => stop, [stop]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode },
        audio: false,
      });
      streamRef.current = stream;
      setLive(true);
      queueMicrotask(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });
    } catch {
      setError(t("checkin.camera.accessError"));
    }
  }

  function shoot() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 960;
    canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
    onCapture(canvas.toDataURL("image/jpeg", 0.82));
    stop();
  }

  function pickFile(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onCapture(String(reader.result));
    reader.readAsDataURL(file);
  }

  function replaceFromCamera() {
    onCapture("");
    queueMicrotask(() => void start());
  }

  function openFilePicker() {
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
          "relative overflow-hidden rounded-xl border bg-muted",
          compact ? "aspect-square border-border" : "aspect-[3/4] border-border",
          value && compact && "ring-2 ring-success/40 ring-offset-2 ring-offset-background",
        )}
      >
        {value ? (
          <>
            <img src={value} alt={label} className="size-full object-cover" />
            {!compact ? (
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-4 pb-4 pt-10">
                <p className="text-center text-xs font-medium text-white">{t("checkin.camera.selected")}</p>
              </div>
            ) : null}
          </>
        ) : live ? (
          <video ref={videoRef} playsInline muted className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-3 text-muted-foreground">
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
        accept="image/*"
        capture={facingMode === "user" ? "user" : "environment"}
        className="sr-only"
        onChange={(event) => {
          pickFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </div>
  );
}
