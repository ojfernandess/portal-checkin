import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
  variant?: "default" | "white";
};

export function BrandLogo({ className, imageClassName, variant = "default" }: BrandLogoProps) {
  const src = variant === "white" ? "/logo-branco.png" : "/logo-DRuOXAi_.svg";

  return (
    <img
      src={src}
      alt="Audaar"
      className={cn("h-auto w-auto max-w-[320px] object-contain", className, imageClassName)}
      decoding="async"
    />
  );
}
