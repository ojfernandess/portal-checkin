import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  Check,
  Copy,
  DoorOpen,
  Download,
  ExternalLink,
  Info,
  KeyRound,
  Lock,
  MapPin,
  Moon,
  Phone,
  Share2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { PhoneDisplay } from "@/components/checkin/PhoneDisplay";
import { paymentBadgeClass } from "@/components/checkin/ReservationCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatDateWithTime, isCheckoutPast } from "@/lib/format-dates";
import { getGoogleMapsUrl } from "@/lib/establishment-address";
import { formatDocumentLine } from "@/lib/guest-display";
import { useI18n } from "@/lib/i18n/context";
import { localeToDateLocale, type Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import type { Dependent, GuestLookup, Reservation } from "@/lib/api/types";

type Props = {
  reservation: Reservation;
  mainGuest?: GuestLookup | null;
  dependents: Dependent[];
  /** Reserva já tinha check-in antes de abrir o fluxo */
  alreadyCompleted?: boolean;
  /** Foto do estabelecimento configurada no painel admin */
  establishmentPhotoUrl?: string | null;
};

function formatMoney(value: number | string | undefined, locale: Locale): string | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(amount)) return String(value);
  return amount.toLocaleString(localeToDateLocale(locale), { style: "currency", currency: "BRL" });
}

function parseIsoDate(value?: string | null): Date | null {
  if (!value) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!iso) return null;
  return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
}

function formatShortDayMonth(date?: string | null, locale: Locale = "pt-BR"): string {
  const parsed = parseIsoDate(date);
  if (!parsed) return formatDate(date ?? undefined, locale);
  return parsed
    .toLocaleDateString(localeToDateLocale(locale), { day: "2-digit", month: "short" })
    .replace(/\./g, "");
}

function formatTimelineDate(
  date?: string | null,
  time?: string | null,
  locale: Locale = "pt-BR",
): string {
  const parsed = parseIsoDate(date);
  if (!parsed) return formatDateWithTime(date, time, locale);
  const datePart = parsed.toLocaleDateString(localeToDateLocale(locale), {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  return time ? `${datePart.replace(/\./g, "")}, ${time}` : datePart.replace(/\./g, "");
}

function formatStayRangeLabel(
  checkinDate: string | undefined,
  checkoutDate: string | undefined,
  nights: number | undefined,
  locale: Locale,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const nightLabel =
    nights === 1
      ? t("checkin.success.oneNight")
      : nights != null
        ? t("checkin.success.nightsCount", { n: nights })
        : "";
  const range = [formatShortDayMonth(checkinDate, locale), formatShortDayMonth(checkoutDate, locale)]
    .filter(Boolean)
    .join(" - ");
  if (nightLabel && range) return `${nightLabel} | ${range}`;
  return nightLabel || range;
}

function successPaymentBadgeClass(reservation: Reservation, status: string): string {
  const base = paymentBadgeClass(reservation, status);
  const normalized = status.toLowerCase();
  const isPending =
    normalized.includes("pendente") ||
    normalized.includes("pending") ||
    normalized.includes("não pago") ||
    normalized.includes("nao pago") ||
    reservation.financial?.isPaid === false ||
    reservation.isPaid === false;

  if (isPending && !reservation.isCancelled) {
    return "border-0 bg-amber-100 text-amber-900";
  }
  return base;
}

function InfoTile({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: React.ReactNode;
}) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0 space-y-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
        <p className="text-xs">{label}</p>
      </div>
      <p className="text-sm font-semibold text-foreground wrap-anywhere">{value}</p>
    </div>
  );
}

function CardShell({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={cn("overflow-hidden rounded-2xl border border-border bg-card shadow-card", className)}>
      {children}
    </article>
  );
}

export function SuccessScreen({
  reservation,
  mainGuest,
  dependents,
  alreadyCompleted,
  establishmentPhotoUrl,
}: Props) {
  const { locale, t } = useI18n();
  const guest = mainGuest ?? reservation.mainGuest ?? reservation.responsible;
  const guestName = guest?.name ?? "";
  const stay = reservation.stay ?? reservation;
  const checkinDate = stay.checkinDate ?? reservation.checkinDate;
  const checkoutDate = stay.checkoutDate ?? reservation.checkoutDate;
  const checkinTime = stay.checkinTime ?? reservation.checkinTime;
  const checkoutTime = stay.checkoutTime ?? reservation.checkoutTime;
  const guestsQuantity = stay.guestsQuantity ?? reservation.guestsQuantity;
  const nights = stay.nights ?? reservation.nights;

  const establishment = reservation.establishment ?? {};
  const phone = establishment.phone;
  const whatsapp = establishment.whatsapp;
  const country =
    establishment.country ?? establishment.address?.country ?? reservation.country ?? null;
  const mapsUrl = getGoogleMapsUrl(reservation);

  const price = formatMoney(reservation.financial?.price ?? reservation.price, locale);
  const roomPassword = reservation.roomPassword ?? reservation.access?.roomPassword ?? null;

  const unitName = reservation.unitName ?? reservation.roomName ?? reservation.room?.unitName;
  const accessUnit = unitName?.trim() || null;
  const categoryName = reservation.categoryName ?? reservation.room?.categoryName;
  const unitDisplay = [categoryName, unitName].filter(Boolean).join(" ") || unitName;

  const isCancelled = reservation.isCancelled === true;
  const checkoutPast = isCheckoutPast(checkoutDate, checkoutTime);
  const hideGuestDetails = isCancelled || checkoutPast;
  const showRoomPassword = !isCancelled && !checkoutPast && roomPassword != null && roomPassword !== "";
  const showAccessBlock = isCancelled || showRoomPassword || (!checkoutPast && !!accessUnit);

  const checkinWhen = reservation.checkin?.localizedDate
    ? formatDateTime(String(reservation.checkin.localizedDate), locale)
    : null;

  const establishmentName =
    reservation.establishmentName ?? establishment.establishmentName ?? t("common.establishment");

  const stayRangeLabel = formatStayRangeLabel(checkinDate, checkoutDate, nights, locale, t);
  const guestsLabel =
    guestsQuantity != null
      ? `${guestsQuantity} ${guestsQuantity === 1 ? t("common.guest") : t("common.guests")}`
      : null;

  const showUsefulInfo = Boolean(reservation.localizer || dependents.length > 0);
  const heroImageUrl = establishmentPhotoUrl?.trim() || "/bg_portal.png";

  async function share() {
    const text = t("checkin.success.shareText", {
      establishment: reservation.establishmentName ?? "",
      date: formatDate(checkinDate, locale),
    });
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: t("checkin.success.shareTitle"), text });
      } catch {
        /* cancelado pelo usuário */
      }
    }
  }

  async function copyPassword() {
    if (!roomPassword) return;
    try {
      await navigator.clipboard.writeText(String(roomPassword));
      toast.success(t("checkin.success.passwordCopied"));
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <div className="space-y-5 print:space-y-3">
      {/* Hero de sucesso */}
      <section className="relative overflow-hidden rounded-2xl border border-emerald-100 bg-[#f3faf6] shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-stretch">
          <div className="flex min-w-0 flex-1 items-center gap-4 p-5 sm:gap-5 sm:p-6">
            <div className="relative shrink-0" aria-hidden>
              <span className="absolute -left-1 top-0 size-2 rounded-full bg-success/40" />
              <span className="absolute -right-0.5 bottom-1 size-1.5 rounded-full bg-success/30" />
              <span className="absolute right-0 top-2 size-1 rounded-full bg-success/50" />
              <div
                className={cn(
                  "relative flex size-16 items-center justify-center rounded-full shadow-sm",
                  isCancelled ? "bg-destructive text-white" : "bg-success text-white",
                )}
              >
                {isCancelled ? (
                  <AlertTriangle className="size-8" strokeWidth={2.5} />
                ) : (
                  <Check className="size-8" strokeWidth={3} />
                )}
              </div>
            </div>
            <div className="min-w-0 space-y-2 text-left">
              <h2 className="font-display text-2xl leading-tight text-primary sm:text-[1.65rem]">
                {alreadyCompleted && !isCancelled
                  ? t("checkin.success.titleDone")
                  : isCancelled
                    ? t("checkin.success.titleCancelled")
                    : t("checkin.success.titleSuccess")}
              </h2>
              {alreadyCompleted && checkinWhen ? (
                <p className="text-sm text-muted-foreground">
                  {t("checkin.success.doneAt")} {checkinWhen}
                </p>
              ) : !isCancelled ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("checkin.success.subtitleSuccess")}
                </p>
              ) : (
                <p className="text-sm text-destructive">{t("checkin.success.cancelledAccessNotice")}</p>
              )}
            </div>
          </div>
          <div className="relative min-h-36 w-full sm:min-h-0 sm:w-[42%] lg:w-[36%]">
            <img
              src={heroImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover object-center"
            />
            <div
              className="absolute inset-0 bg-gradient-to-r from-[#f3faf6] via-[#f3faf6]/70 to-transparent sm:from-[#f3faf6] sm:via-[#f3faf6]/40"
              aria-hidden
            />
          </div>
        </div>
      </section>

      {/* Card da propriedade */}
      <CardShell>
        <div className="flex flex-col sm:flex-row">
          <div className="relative min-h-40 w-full shrink-0 overflow-hidden sm:max-w-[220px]">
            <img
              src={heroImageUrl}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div className="relative w-full bg-gradient-to-t from-black/50 to-transparent p-4 sm:hidden">
              <p className="font-display text-lg text-white">{establishmentName}</p>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-4 p-5">
            <div className="space-y-2">
              <h3 className="hidden font-display text-xl sm:block">{establishmentName}</h3>
              {country ? (
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm text-muted-foreground">{country}</p>
                  {mapsUrl ? (
                    <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                        {t("checkin.success.viewOnMaps")}
                        <ExternalLink className="size-3 opacity-60" aria-hidden />
                      </a>
                    </Button>
                  ) : null}
                </div>
              ) : mapsUrl ? (
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                    {t("checkin.success.viewOnMaps")}
                    <ExternalLink className="size-3 opacity-60" aria-hidden />
                  </a>
                </Button>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <InfoTile
                icon={<BedDouble className="size-3.5" />}
                label={t("common.unit")}
                value={unitDisplay}
              />
              <InfoTile
                icon={<CalendarDays className="size-3.5" />}
                label={t("common.stay")}
                value={stayRangeLabel}
              />
              <InfoTile
                icon={<Users className="size-3.5" />}
                label={t("common.guests")}
                value={guestsLabel}
              />
              <InfoTile
                icon={<DoorOpen className="size-3.5" />}
                label={t("checkin.success.unitNumberLabel")}
                value={reservation.unitNumber}
              />
            </div>
          </div>
        </div>
      </CardShell>

      {/* Acesso à acomodação */}
      {showAccessBlock ? (
        isCancelled ? (
          <CardShell className="border-destructive/40 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm text-destructive">{t("checkin.success.cancelledAccessNotice")}</p>
            </div>
          </CardShell>
        ) : (
          <CardShell>
            <div className="flex items-center gap-2 bg-primary px-5 py-3.5 text-primary-foreground">
              <KeyRound className="size-5 shrink-0" aria-hidden />
              <h4 className="font-display text-base">{t("checkin.success.accessTitle")}</h4>
            </div>
            <div className="p-5">
              <div className="space-y-4">
                {accessUnit ? (
                  <div>
                    <p className="text-xs text-muted-foreground">{t("common.unit")}</p>
                    <p className="mt-1 font-display text-lg wrap-anywhere">{accessUnit}</p>
                  </div>
                ) : null}
                {showRoomPassword ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs text-muted-foreground">{t("checkin.success.accessPassword")}</p>
                      <p className="mt-1 font-code text-2xl font-semibold tracking-wide wrap-anywhere">
                        {roomPassword}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 print:hidden"
                      onClick={() => void copyPassword()}
                    >
                      <Copy className="size-4" aria-hidden />
                      {t("checkin.success.copyPassword")}
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          </CardShell>
        )
      ) : null}

      {/* Hóspede, pagamento e timeline */}
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <CardShell className="p-5">
            <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("common.mainGuest")}
            </h4>
            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">{t("common.name")}</p>
                <p className="font-medium wrap-anywhere">{guestName || "—"}</p>
              </div>
              {!hideGuestDetails && guest?.mobilePhoneNumber ? (
                <div>
                  <p className="text-xs text-muted-foreground">{t("common.phone")}</p>
                  <PhoneDisplay phone={guest.mobilePhoneNumber} className="font-medium" />
                </div>
              ) : null}
              {!hideGuestDetails ? (
                <div>
                  <p className="text-xs text-muted-foreground">{t("common.document")}</p>
                  <p className="font-medium wrap-anywhere">
                    {formatDocumentLine(guest, locale) || "—"}
                  </p>
                </div>
              ) : null}
            </div>
          </CardShell>

          {price || reservation.label ? (
            <CardShell className="p-5">
              <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t("checkin.success.paymentTitle")}
              </h4>
              <div className="space-y-3">
                {reservation.label ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{t("checkin.success.paymentStatus")}</span>
                    <Badge className={successPaymentBadgeClass(reservation, reservation.label)}>
                      {reservation.label}
                    </Badge>
                  </div>
                ) : null}
                {price ? (
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm text-muted-foreground">{t("common.reservationValue")}</span>
                    <span className="font-code text-lg font-semibold">{price}</span>
                  </div>
                ) : null}
              </div>
            </CardShell>
          ) : null}

          {showUsefulInfo ? (
            <CardShell className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <Info className="size-4 text-muted-foreground" aria-hidden />
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("checkin.success.usefulInfoTitle")}
                </h4>
              </div>
              <ul className="space-y-3 text-sm">
                {reservation.localizer ? (
                  <li>
                    <p className="text-xs text-muted-foreground">{t("checkin.success.localizerInfo")}</p>
                    <p className="font-code font-medium">{reservation.localizer}</p>
                  </li>
                ) : null}
                {dependents.length > 0 ? (
                  <li>
                    <p className="text-xs text-muted-foreground">{t("checkin.success.companionsInfo")}</p>
                    <p className="font-medium">
                      {dependents.length} {t("common.companions").toLowerCase()}
                    </p>
                  </li>
                ) : null}
              </ul>
            </CardShell>
          ) : null}
        </div>

        <CardShell className="p-5 lg:self-start">
          <h4 className="mb-5 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("checkin.success.stayTitle")}
          </h4>
          <ol className="relative space-y-0 pl-1">
            <li className="relative flex gap-4 pb-6">
              <div className="flex flex-col items-center">
                <span className="flex size-9 items-center justify-center rounded-full bg-success/15 text-success">
                  <CalendarDays className="size-4" aria-hidden />
                </span>
                <span className="mt-1 h-full w-px flex-1 bg-border" aria-hidden />
              </div>
              <div className="min-w-0 pb-2 pt-1">
                <p className="text-xs text-muted-foreground">{t("common.checkin")}</p>
                <p className="font-medium">{formatTimelineDate(checkinDate, checkinTime, locale)}</p>
              </div>
            </li>
            {nights != null ? (
              <li className="relative flex gap-4 pb-6">
                <div className="flex flex-col items-center">
                  <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <Moon className="size-4" aria-hidden />
                  </span>
                  <span className="mt-1 h-full w-px flex-1 bg-border" aria-hidden />
                </div>
                <div className="min-w-0 pb-2 pt-1">
                  <p className="font-medium">
                    {nights === 1
                      ? t("checkin.success.oneNight")
                      : t("checkin.success.nightsCount", { n: nights })}
                  </p>
                </div>
              </li>
            ) : null}
            <li className="relative flex gap-4">
              <div className="flex flex-col items-center">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <CalendarDays className="size-4" aria-hidden />
                </span>
              </div>
              <div className="min-w-0 pt-1">
                <p className="text-xs text-muted-foreground">{t("common.checkout")}</p>
                <p className="font-medium">{formatTimelineDate(checkoutDate, checkoutTime, locale)}</p>
              </div>
            </li>
          </ol>
        </CardShell>
      </div>

      {/* Banner informativo */}
      {!isCancelled ? (
        <div className="rounded-2xl border border-border bg-primary px-5 py-4 text-primary-foreground">
          <p className="font-display text-lg">{t("checkin.success.bannerTitle")}</p>
          <p className="mt-2 text-sm text-primary-foreground/80">{t("checkin.success.bannerBody")}</p>
        </div>
      ) : null}

      {/* Ajuda durante a estadia */}
      {whatsapp || phone || mapsUrl ? (
        <CardShell className="p-5">
          <p className="text-sm font-medium">{t("checkin.success.helpDuringStay")}</p>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            {whatsapp ? (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a
                  href={`https://wa.me/${String(whatsapp).replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <WhatsAppIcon className="size-4 text-[#25D366]" />
                  {t("common.whatsapp")}
                </a>
              </Button>
            ) : null}
            {phone ? (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={`tel:${String(phone).replace(/\s/g, "")}`}>
                  <Phone className="size-4" aria-hidden />
                  {t("checkin.success.call")}
                </a>
              </Button>
            ) : null}
            {mapsUrl ? (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  <MapPin className="size-4" aria-hidden />
                  {t("checkin.success.location")}
                </a>
              </Button>
            ) : null}
          </div>
        </CardShell>
      ) : null}

      {/* Ações principais */}
      <div className="flex flex-col gap-3 sm:flex-row print:hidden">
        <Button variant="outline" className="tap-safe flex-1 gap-2 border-foreground/20" onClick={() => window.print()}>
          <Download className="size-4" aria-hidden />
          {t("checkin.success.downloadReceipt")}
        </Button>
        <Button className="tap-safe flex-1 gap-2" onClick={() => void share()}>
          <Share2 className="size-4" aria-hidden />
          {t("checkin.success.shareReservation")}
        </Button>
      </div>

      {/* Selos de confiança */}
      <div className="flex flex-wrap items-center justify-center gap-6 py-2 text-xs text-muted-foreground print:hidden">
        <span className="inline-flex items-center gap-2">
          <Lock className="size-3.5" aria-hidden />
          {t("checkin.success.dataSecure")}
        </span>
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t("checkin.success.lgpdCompliant")}
        </span>
      </div>
    </div>
  );
}
