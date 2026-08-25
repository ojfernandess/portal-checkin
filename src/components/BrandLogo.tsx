import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  variant?: "default" | "white";
  src?: string | null;
  alt?: string;
};

export function BrandLogo({
  className,
  imageClassName,
  variant = "default",
  src,
  alt = "Audaar",
}: BrandLogoProps) {
  const defaultSrc = variant === "white" ? "/logo-branco.png" : "/logo-DRuOXAi_.svg";
  const resolvedSrc = src?.trim() || defaultSrc;

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      className={cn("h-auto w-auto max-w-[320px] object-contain", className, imageClassName)}
      decoding="async"
    />
  );
}
