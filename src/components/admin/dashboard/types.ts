import type { CheckoutFeedRow, CreatedFeedRow } from "@/lib/api/admin.functions";

export type PortalDurationEntry = {
  id: string;
  localizer: string;
  guestName: string;
  establishmentName: string | null;
  durationSeconds: number;
  checkedInAt: string;
};

export type PortalDurationStats = {
  measured: number;
  totalToday: number;
  averageSeconds: number | null;
  medianSeconds: number | null;
  fastest: PortalDurationEntry[];
  slowest: PortalDurationEntry[];
};

export type PortalStats = {
  date: string;
  total: number;
  today: number;
  week: number;
  byHour: Record<string, number>;
  duration: PortalDurationStats;
  recent: Array<{
    id: string;
    localizer: string;
    guestName: string;
    establishmentName: string | null;
    checkedInAt: string;
  }>;
};

export type CheckoutsState = {
  rows: CheckoutFeedRow[];
  count: number;
  totalPrice: number;
  error: string | null;
};

export type CreatedState = {
  rows: CreatedFeedRow[];
  count: number;
  totalPrice: number;
  error: string | null;
};

export type TimelineEvent = {
  id: string;
  type: "checkin" | "checkout" | "reservation";
  hour: number;
  timeLabel: string;
  title: string;
  subtitle: string;
  detail?: string;
};

export type AttentionItem = {
  id: string;
  labelKey: string;
  count: number;
  tone: "critical" | "warning" | "info";
};
