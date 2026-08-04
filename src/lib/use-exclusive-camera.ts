import { useCallback, useEffect } from "react";
import type { ExclusiveCameraProps } from "@/lib/camera-utils";

type Options = {
  captureId?: string | undefined;
  activeCaptureId?: string | null | undefined;
  onRequestCapture?: ((id: string) => void) | undefined;
  onReleaseCapture?: ((id: string) => void) | undefined;
  isLive: boolean;
  stopLive: () => void;
};

export function useExclusiveCamera({
  captureId,
  activeCaptureId,
  onRequestCapture,
  onReleaseCapture,
  isLive,
  stopLive,
}: Options) {
  const requestCapture = useCallback(() => {
    if (captureId && onRequestCapture) {
      onRequestCapture(captureId);
    }
  }, [captureId, onRequestCapture]);

  const releaseCapture = useCallback(() => {
    if (captureId && onReleaseCapture) {
      onReleaseCapture(captureId);
    }
  }, [captureId, onReleaseCapture]);

  useEffect(() => {
    if (!captureId || activeCaptureId === undefined || onRequestCapture === undefined) return;
    if (activeCaptureId !== null && activeCaptureId !== captureId && isLive) {
      stopLive();
    }
  }, [activeCaptureId, captureId, isLive, onRequestCapture, stopLive]);

  return { requestCapture, releaseCapture };
}
