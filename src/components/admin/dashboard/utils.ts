import type { CheckoutFeedRow, CreatedFeedRow } from "@/lib/api/admin.functions";
import type { Locale } from "@/lib/i18n/types";
import { localeToDateLocale } from "@/lib/i18n/types";
import type { AttentionItem, PortalStats, TimelineEvent } from "./types";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function formatMoney(value: number | undefined, locale: Locale): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(localeToDateLocale(locale), { style: "currency", currency: "BRL" });
}

export function getGreetingKey(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

function parseHourFromIso(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getHours();
}

function parseHourFromTime(value: string | undefined): number | null {
  if (!value?.trim()) return null;
  const match = value.match(/^(\d{1,2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}h`;
}

export function buildTimelineEvents(
  portal: PortalStats | null,
  checkouts: CheckoutFeedRow[],
  created: CreatedFeedRow[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const row of portal?.recent ?? []) {
    const hour = parseHourFromIso(row.checkedInAt);
    if (hour == null) continue;
    events.push({
      id: `checkin-${row.id}`,
      type: "checkin",
      hour,
      timeLabel: formatHourLabel(hour),
      title: row.guestName,
      subtitle: row.establishmentName ?? row.localizer,
      detail: row.localizer,
    });
  }

  for (const row of checkouts) {
    const hour = parseHourFromTime(row.checkoutTime) ?? 12;
    events.push({
      id: `checkout-${row.localizer ?? row.reservationId ?? events.length}`,
      type: "checkout",
      hour,
      timeLabel: row.checkoutTime?.trim() || formatHourLabel(hour),
      title: row.guestName ?? "—",
      subtitle: [row.establishmentName, row.roomName].filter(Boolean).join(" · ") || "—",
      detail: row.localizer,
    });
  }

  for (const row of created) {
    const hour = parseHourFromIso(row.reservationDate) ?? 10;
    events.push({
      id: `created-${row.localizer ?? row.reservationId ?? events.length}`,
      type: "reservation",
      hour,
      timeLabel: formatHourLabel(hour),
      title: row.guestName ?? "—",
      subtitle: row.establishmentName ?? "—",
      detail: row.localizer,
    });
  }

  return events.sort((a, b) => a.hour - b.hour || a.title.localeCompare(b.title));
}

export function buildAttentionItems(checkouts: CheckoutFeedRow[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  const pending = checkouts.filter((row) => !row.checkoutDone && !row.isCancelled);
  const cancelled = checkouts.filter((row) => row.isCancelled);

  if (pending.length > 0) {
    items.push({
      id: "pending-checkouts",
      labelKey: "admin.dashboardPage.attentionPendingCheckouts",
      count: pending.length,
      tone: "critical",
    });
  }

  if (cancelled.length > 0) {
    items.push({
      id: "cancelled-checkouts",
      labelKey: "admin.dashboardPage.attentionCancelledCheckouts",
      count: cancelled.length,
      tone: "warning",
    });
  }

  return items;
}

export function hasHourChartData(byHour: Record<string, number> | undefined): boolean {
  if (!byHour) return false;
  return Object.values(byHour).some((count) => count > 0);
}

export function hourChartSeries(byHour: Record<string, number>) {
  return Object.entries(byHour)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([hour, count]) => ({ hour: `${hour}h`, count }));
}
