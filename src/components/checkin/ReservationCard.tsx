import { BedDouble, CalendarDays, Hotel, Moon, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EstablishmentAddressBlock } from "@/components/checkin/EstablishmentAddressBlock";
import { formatDateWithTime } from "@/lib/format-dates";
import { useI18n } from "@/lib/i18n/context";
import { isAlreadyCheckedIn, type Reservation } from "@/lib/api/types";
import { VB_RESERVATION_STATUS } from "@/lib/reservation-status";

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value?: React.ReactNode }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="mt-0.5 text-accent" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
}

function normalizePaymentStatus(status: string): string {
  return status.trim().toLowerCase();
}

function labelIndicatesPaid(status: string): boolean {
  const normalized = normalizePaymentStatus(status);
  if (normalized.includes("não pago") || normalized.includes("nao pago")) return false;
  return /\bpago\b/.test(normalized) || normalized.includes("paid");
}

function labelIndicatesUnpaid(status: string): boolean {
  const normalized = normalizePaymentStatus(status);
  return (
    normalized.includes("não pago") ||
    normalized.includes("nao pago") ||
    normalized.includes("unpaid") ||
    normalized.includes("pendente") ||
    normalized.includes("pending")
  );
}

export function isReservationPaid(reservation: Reservation, status: string): boolean {
  if (labelIndicatesUnpaid(status)) return false;
  return (
    reservation.financial?.isPaid === true ||
    reservation.isPaid === true ||
    labelIndicatesPaid(status)
  );
}

function isPaymentStatusLabel(label: string): boolean {
  return labelIndicatesPaid(label) || labelIndicatesUnpaid(label);
}

/** Badge da situação da reserva (confirmada, cancelada, check-in concluído). */
export function reservationStatusBadgeClass(
  reservation: Reservation,
  label = reservation.label ?? "",
): string {
  const statusLabel = label.trim();
  const lower = statusLabel.toLowerCase();

  if (
    reservation.isCancelled ||
    reservation.reservationStatus === VB_RESERVATION_STATUS.CANCELLED ||
    lower.includes("cancelad")
  ) {
    return "border-0 bg-destructive text-destructive-foreground hover:bg-destructive";
  }

  if (reservation.isPendingCancellation || lower.includes("cancelamento pendente")) {
    return "border-0 bg-amber-100 text-amber-900 hover:bg-amber-100";
  }

  if (
    isAlreadyCheckedIn(reservation) ||
    reservation.reservationStatus === VB_RESERVATION_STATUS.CHECKED_IN ||
    reservation.reservationStatus === VB_RESERVATION_STATUS.CONFIRMED ||
    lower.includes("confirmad") ||
    lower.includes("check-in") ||
    lower.includes("checkin")
  ) {
    return "border-0 bg-emerald-600 text-white hover:bg-emerald-600";
  }

  if (isPaymentStatusLabel(statusLabel)) {
    return paymentBadgeClass(reservation, statusLabel);
  }

  if (!reservation.isCancelled) {
    return "border-0 bg-emerald-600 text-white hover:bg-emerald-600";
  }

  return "border-0 bg-muted text-muted-foreground hover:bg-muted";
}

export function paymentBadgeClass(reservation: Reservation, status: string): string {
  if (reservation.isCancelled) {
    return "border-0 bg-destructive text-destructive-foreground hover:bg-destructive";
  }

  if (isReservationPaid(reservation, status)) {
    return "border-0 bg-emerald-600 text-white hover:bg-emerald-600";
  }

  const isUnpaid =
    labelIndicatesUnpaid(status) ||
    ((reservation.financial?.isPaid === false || reservation.isPaid === false) &&
      !labelIndicatesPaid(status));

  if (isUnpaid) {
    return "border-0 bg-destructive text-destructive-foreground hover:bg-destructive";
  }

  return "border-0 bg-muted text-muted-foreground hover:bg-muted";
}

export function ReservationCard({ reservation }: { reservation: Reservation }) {
  const { locale, t } = useI18n();
  const stay = reservation.stay ?? reservation;
  const checkinDate = stay.checkinDate ?? reservation.checkinDate;
  const checkoutDate = stay.checkoutDate ?? reservation.checkoutDate;
  const checkinTime = stay.checkinTime ?? reservation.checkinTime;
  const checkoutTime = stay.checkoutTime ?? reservation.checkoutTime;
  const guestsQuantity = stay.guestsQuantity ?? reservation.guestsQuantity;
  const nights = stay.nights ?? reservation.nights;
  const checkedIn = isAlreadyCheckedIn(reservation);
  const accommodationValue = checkedIn
    ? [reservation.categoryName, reservation.unitName ?? reservation.roomName].filter(Boolean).join(" · ")
    : reservation.categoryName;
  const status =
    reservation.label ?? (reservation.isCancelled ? t("common.cancelled") : t("common.confirmed"));

  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <header className="flex items-center gap-3 bg-primary px-5 py-4 text-primary-foreground">
        <Hotel className="size-5 text-accent" aria-hidden />
        <div className="min-w-0">
          <h2 className="truncate font-display text-lg">
            {reservation.establishmentName ?? t("common.establishment")}
          </h2>
          {reservation.localizer && (
            <p className="font-code text-xs text-primary-foreground/70">{reservation.localizer}</p>
          )}
        </div>
      </header>
      <div className="divide-y divide-border px-5 py-1">
        <EstablishmentAddressBlock reservation={reservation} className="py-3" />
        <Row icon={<BedDouble className="size-4" />} label={t("common.accommodation")} value={accommodationValue} />
        <Row
          icon={<User className="size-4" />}
          label={t("common.responsible")}
          value={reservation.responsible?.name ?? reservation.mainGuest?.name}
        />
        <Row
          icon={<CalendarDays className="size-4" />}
          label={t("common.checkin")}
          value={formatDateWithTime(checkinDate, checkinTime, locale)}
        />
        <Row
          icon={<CalendarDays className="size-4" />}
          label={t("common.checkout")}
          value={formatDateWithTime(checkoutDate, checkoutTime, locale)}
        />
        <Row icon={<User className="size-4" />} label={t("common.guests")} value={guestsQuantity} />
        <Row icon={<Moon className="size-4" />} label={t("common.nights")} value={nights} />
      </div>
      <footer className="flex items-center justify-between border-t border-border px-5 py-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t("common.reservationStatus")}</span>
        <Badge variant="outline" className={reservationStatusBadgeClass(reservation, status)}>
          {status}
        </Badge>
      </footer>
    </article>
  );
}
