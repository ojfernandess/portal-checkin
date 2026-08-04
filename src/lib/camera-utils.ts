export async function attachStreamToVideo(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.setAttribute("webkit-playsinline", "true");
  video.muted = true;

  await new Promise<void>((resolve) => {
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

export function stopMediaStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Stream ativo no dispositivo — mobile só permite uma câmera por vez. */
let activeDeviceStream: MediaStream | null = null;

export function releaseActiveDeviceStream(except?: MediaStream | null): void {
  if (activeDeviceStream && activeDeviceStream !== except) {
    stopMediaStream(activeDeviceStream);
    activeDeviceStream = null;
  }
}

export function registerActiveDeviceStream(stream: MediaStream): void {
  releaseActiveDeviceStream(stream);
  activeDeviceStream = stream;
}

export function unregisterActiveDeviceStream(stream: MediaStream | null | undefined): void {
  if (stream && activeDeviceStream === stream) {
    activeDeviceStream = null;
  }
}

export async function requestCameraStream(facingMode: "user" | "environment"): Promise<MediaStream> {
  releaseActiveDeviceStream();
  const constraints: MediaStreamConstraints[] = [
    { video: { facingMode: { ideal: facingMode } }, audio: false },
    { video: { facingMode }, audio: false },
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

export async function acquireCameraStream(facingMode: "user" | "environment"): Promise<MediaStream> {
  const stream = await requestCameraStream(facingMode);
  registerActiveDeviceStream(stream);
  return stream;
}

export type ExclusiveCameraProps = {
  captureId: string;
  activeCaptureId: string | null;
  onRequestCapture: (id: string) => void;
  onReleaseCapture: (id: string) => void;
};

/** Aguarda um frame para outros componentes liberarem a UI da câmera. */
export function yieldForCameraHandoff(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}
