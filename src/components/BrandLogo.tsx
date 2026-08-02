import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  imageClassName?: string;
};

export function BrandLogo({ className, imageClassName }: BrandLogoProps) {
  return (
    <img
      src="/logo-DRuOXAi_.svg"
      alt="StayOS"
      className={cn("h-auto w-auto max-w-[320px] object-contain", className, imageClassName)}
      decoding="async"
    />
  );
}
