import { cn } from "@/lib/utils";

export function PortalHeroBackground({
  className,
  imageSrc = "/bg_portal.png",
}: {
  className?: string;
  imageSrc?: string;
}) {
  return (
    <div className={cn("hero-bg-layer absolute inset-0 overflow-hidden", className)} aria-hidden>
      <img
        src={imageSrc}
        alt=""
        className="absolute inset-0 size-full object-cover animate-hero-bg-pan"
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-linear-to-r from-slate-950/75 via-slate-900/45 to-slate-900/25" />
      <div className="absolute inset-0 bg-linear-to-t from-slate-950/60 via-transparent to-slate-950/20" />
    </div>
  );
}
