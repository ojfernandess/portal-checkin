import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

type TurnstileRenderOptions = {
  sitekey: string;
  callback?: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  theme?: "light" | "dark" | "auto";
  size?: "normal" | "compact";
};

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: TurnstileRenderOptions) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
    onTurnstileLoad?: () => void;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    window.onTurnstileLoad = () => resolve();
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad";
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error("Turnstile script failed to load"));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

export type TurnstileWidgetRef = {
  reset: () => void;
};

type TurnstileWidgetProps = {
  siteKey: string;
  onToken: (token: string | null) => void;
  theme?: "light" | "dark" | "auto";
  className?: string;
};

export const TurnstileWidget = forwardRef<TurnstileWidgetRef, TurnstileWidgetProps>(
  function TurnstileWidget({ siteKey, onToken, theme = "auto", className }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const widgetIdRef = useRef<string | null>(null);
    const onTokenRef = useRef(onToken);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
      onTokenRef.current = onToken;
    }, [onToken]);

    useImperativeHandle(ref, () => ({
      reset() {
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.reset(widgetIdRef.current);
        }
        onTokenRef.current(null);
      },
    }));

    useEffect(() => {
      let active = true;
      const container = containerRef.current;
      if (!container) return;

      void loadTurnstileScript()
        .then(() => {
          if (!active || !containerRef.current || !window.turnstile) return;

          if (widgetIdRef.current) {
            window.turnstile.remove(widgetIdRef.current);
            widgetIdRef.current = null;
          }

          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme,
            callback: (token) => {
              setLoadError(null);
              onTokenRef.current(token);
            },
            "expired-callback": () => onTokenRef.current(null),
            "error-callback": () => {
              onTokenRef.current(null);
              setLoadError(
                "Falha no widget Turnstile. Confira a site key e se o domínio está autorizado no Cloudflare.",
              );
            },
          });
        })
        .catch(() => {
          if (active) setLoadError("Não foi possível carregar a verificação de segurança.");
        });

      return () => {
        active = false;
        if (widgetIdRef.current && window.turnstile) {
          window.turnstile.remove(widgetIdRef.current);
          widgetIdRef.current = null;
        }
      };
    }, [siteKey, theme]);

    if (loadError) {
      return <p className="text-sm text-destructive">{loadError}</p>;
    }

    return <div ref={containerRef} className={className} />;
  },
);
