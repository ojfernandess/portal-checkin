import { useNavigate } from "@tanstack/react-router";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import { useEffect, useState } from "react";
import { useAdminAccountActions } from "@/components/admin/AdminAccountProvider";
import {
  getStoredActiveTenantId,
  setStoredActiveTenantId,
  setStoredActiveTenantSlug,
} from "@/lib/tenant-context";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  compact?: boolean;
};

export function TenantSelector({ className, compact = false }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { tenants, tenantsLoading, switchTenant } = useAdminAccountActions();
  const [activeTenantId, setActiveTenantId] = useState<string | null>(() => getStoredActiveTenantId());

  useEffect(() => {
    const stored = getStoredActiveTenantId();
    const validStored =
      stored && tenants.some((tenant) => tenant.id === stored) ? stored : null;
    const resolved = validStored ?? tenants[0]?.id ?? null;

    if (resolved && resolved !== stored) {
      setStoredActiveTenantId(resolved);
    }

    setActiveTenantId(resolved);
  }, [tenants]);

  if (tenantsLoading || tenants.length <= 1) {
    if (tenantsLoading || tenants.length === 0) return null;

    const onlyTenant = tenants[0]!;
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/80",
          className,
        )}
      >
        <Building2 className="size-4 shrink-0" aria-hidden />
        {!compact ? <span className="truncate">{onlyTenant.name}</span> : null}
      </div>
    );
  }

  const activeTenant = tenants.find((tenant) => tenant.id === activeTenantId) ?? tenants[0]!;

  function handleSelect(tenantId: string) {
    if (tenantId === activeTenantId) return;
    const selected = tenants.find((tenant) => tenant.id === tenantId);
    if (!selected) return;

    setActiveTenantId(tenantId);
    setStoredActiveTenantId(tenantId);
    if (selected.slug) {
      setStoredActiveTenantSlug(selected.slug);
    }

    switchTenant(tenantId);
    navigate({ to: "/admin/dashboard", replace: true });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "sm"}
          className={cn(
            "border-white/15 bg-white/10 text-white hover:bg-white/15 hover:text-white",
            compact ? "size-9" : "w-full justify-between gap-2",
            className,
          )}
          aria-label={t("admin.tenantSelector.label")}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2 className="size-4 shrink-0" aria-hidden />
            {!compact ? <span className="truncate">{activeTenant.name}</span> : null}
          </span>
          {!compact ? <ChevronsUpDown className="size-4 shrink-0 opacity-70" aria-hidden /> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("admin.tenantSelector.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {tenants.map((tenant) => (
          <DropdownMenuItem key={tenant.id} onClick={() => handleSelect(tenant.id)}>
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <Building2 className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <span className="truncate">{tenant.name}</span>
            </span>
            {tenant.id === activeTenant.id ? (
              <Check className="size-4 shrink-0 text-primary" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
