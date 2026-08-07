import { AlertTriangle, Clock3 } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import type { AttentionItem, TimelineEvent } from "./types";

type Props = {
  events: TimelineEvent[];
  attentionItems: AttentionItem[];
  loading?: boolean;
};

const EVENT_STYLES = {
  checkin: "border-blue-500/30 bg-blue-500/5",
  checkout: "border-violet-500/30 bg-violet-500/5",
  reservation: "border-emerald-500/30 bg-emerald-500/5",
} as const;

const ATTENTION_STYLES = {
  critical: "border-red-500/20 bg-red-500/5 text-red-700",
  warning: "border-amber-500/20 bg-amber-500/5 text-amber-800",
  info: "border-blue-500/20 bg-blue-500/5 text-blue-800",
} as const;

export function DashboardOperationSection({ events, attentionItems, loading }: Props) {
  const { t } = useI18n();
  const hours = Array.from(new Set(events.map((event) => event.hour))).sort((a, b) => a - b);

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,1fr)]">
      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Clock3 className="size-4 text-[#1B3A57]" aria-hidden />
          <h2 className="text-base font-semibold">{t("admin.dashboardPage.operationToday")}</h2>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-16 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.dashboardPage.operationEmpty")}</p>
        ) : (
          <div className="space-y-4">
            {hours.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-b border-border/60 pb-4">
                {hours.map((hour) => (
                  <span
                    key={hour}
                    className="rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"
                  >
                    {String(hour).padStart(2, "0")}h
                  </span>
                ))}
              </div>
            ) : null}

            <ul className="space-y-2">
              {events.slice(0, 8).map((event) => (
                <li
                  key={event.id}
                  className={cn(
                    "rounded-lg border px-3 py-3 transition-colors hover:bg-muted/30",
                    EVENT_STYLES[event.type],
                  )}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{event.title}</p>
                      <p className="truncate text-xs text-muted-foreground">{event.subtitle}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold text-[#1B3A57]">{event.timeLabel}</p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t(`admin.dashboardPage.eventType.${event.type}`)}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="size-4 text-amber-600" aria-hidden />
          <h2 className="text-base font-semibold">{t("admin.dashboardPage.attentionTitle")}</h2>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-muted/60" />
            ))}
          </div>
        ) : attentionItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.dashboardPage.attentionEmpty")}</p>
        ) : (
          <ul className="space-y-2">
            {attentionItems.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "rounded-lg border px-3 py-3 text-sm font-medium",
                  ATTENTION_STYLES[item.tone],
                )}
              >
                {t(item.labelKey, { count: item.count })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
