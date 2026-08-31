export const INBOX_STAY_STATUS_OPTIONS = [
  "confirmed",
  "pending",
  "checked_in",
  "checked_out",
  "cancelled",
  "no_show",
] as const;

export type InboxStayStatusOption = (typeof INBOX_STAY_STATUS_OPTIONS)[number];

export function inboxStayStatusLabelKey(status: string): string {
  const normalized = status.trim().toLowerCase().replace(/-/g, "_");
  switch (normalized) {
    case "confirmed":
      return "admin.inbox.stayStatusConfirmed";
    case "pending":
      return "admin.inbox.stayStatusPending";
    case "checked_in":
      return "admin.inbox.stayStatusCheckedIn";
    case "checked_out":
    case "checkout":
      return "admin.inbox.stayStatusCheckedOut";
    case "cancelled":
    case "canceled":
      return "admin.inbox.stayStatusCancelled";
    case "no_show":
      return "admin.inbox.stayStatusNoShow";
    default:
      return "";
  }
}
