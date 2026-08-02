type CountryFlagProps = {
  iso: string;
  className?: string;
  size?: "sm" | "md";
};

export function CountryFlag({ iso, className, size = "sm" }: CountryFlagProps) {
  const code = iso.toLowerCase();
  if (!/^[a-z]{2}$/.test(code)) return null;

  const sizeClass = size === "md" ? "size-6" : "size-4";

  return (
    <span
      className={`inline-flex shrink-0 overflow-hidden rounded-sm border border-black/15 bg-background shadow-sm ${sizeClass} ${className ?? ""}`.trim()}
      aria-hidden
    >
      <img
        src={`https://flagcdn.com/w40/${code}.png`}
        srcSet={`https://flagcdn.com/w80/${code}.png 2x`}
        alt=""
        className="size-full object-cover"
        loading="lazy"
        decoding="async"
      />
    </span>
  );
}
