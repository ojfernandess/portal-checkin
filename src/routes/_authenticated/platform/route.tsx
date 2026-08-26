import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { platformMe } from "@/lib/api/platform.functions";

export const Route = createFileRoute("/_authenticated/platform")({
  ssr: false,
  component: PlatformRouteGate,
});

function PlatformRouteGate() {
  const navigate = useNavigate();
  const loadMe = useServerFn(platformMe);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void loadMe()
      .then((platform) => {
        if (cancelled) return;
        if (!platform.isPlatformAdmin) {
          navigate({ to: "/admin/dashboard", replace: true });
          return;
        }
        setAllowed(true);
      })
      .catch(() => {
        if (cancelled) return;
        navigate({ to: "/auth", replace: true });
      });

    return () => {
      cancelled = true;
    };
  }, [loadMe, navigate]);

  if (!allowed) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
        <Loader2 className="size-6 animate-spin" aria-hidden />
      </div>
    );
  }

  return <Outlet />;
}
