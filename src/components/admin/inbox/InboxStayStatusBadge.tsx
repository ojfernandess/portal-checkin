import { LogIn, LogOut } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/context";

function normalizeStayStatus(status?: string | null): string {
  return String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/-/g, "_");
}

function formatFallbackStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

type Props = {
  status?: string | null;
  className?: string;
};

export function InboxStayStatusBadge({ status, className }: Props) {
  const { t } = useI18n();
  const normalized = normalizeStayStatus(status);

  if (!normalized) {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }

  if (normalized === "checked_in") {
    return (
      <Badge
        className={cn(
          "gap-1 border-transparent bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-400",
          className,
        )}
      >
        <LogIn className="size-3.5 shrink-0" aria-hidden />
        {t("admin.inbox.stayStatusCheckedIn")}
      </Badge>
    );
  }

  if (normalized === "checked_out" || normalized === "checkout") {
    return (
      <Badge
        className={cn(
          "gap-1 border-transparent bg-muted text-muted-foreground hover:bg-muted",
          className,
        )}
      >
        <LogOut className="size-3.5 shrink-0" aria-hidden />
        {t("admin.inbox.stayStatusCheckedOut")}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={cn("font-normal", className)}>
      {formatFallbackStatus(normalized)}
    </Badge>
  );
}
