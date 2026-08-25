import { cn } from "@/lib/utils";

type Props = {
  tenantName: string;
  logoUrl?: string | null;
  className?: string;
};

/** Marca exibida no painel admin da empresa: logo customizada ou nome tipográfico. */
export function TenantPanelBrand({ tenantName, logoUrl, className }: Props) {
  const name = tenantName.trim() || "Empresa";
  const resolvedLogo = logoUrl?.trim();

  if (resolvedLogo) {
    return (
      <img
        src={resolvedLogo}
        alt={name}
        className={cn("max-h-9 w-auto max-w-full object-contain", className)}
        decoding="async"
      />
    );
  }

  return (
    <p
      className={cn(
        "font-display text-center text-xl font-semibold leading-snug tracking-[0.02em] text-white",
        "line-clamp-2 text-balance",
        className,
      )}
      title={name}
    >
      {name}
    </p>
  );
}
