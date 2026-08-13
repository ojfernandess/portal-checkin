import { useMemo, type ReactNode } from "react";
import {
  AlertTriangle,
  BedDouble,
  CalendarDays,
  Check,
  Copy,
  DoorOpen,
  Download,
  ExternalLink,
  Heart,
  Info,
  KeyRound,
  Lock,
  MapPin,
  Moon,
  Phone,
  ScanFace,
  Share2,
  ShieldCheck,
  Sparkles,
  Users,
  Wifi,
  Car,
  Clock,
  CircleHelp,
} from "lucide-react";
import { toast } from "sonner";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { PhoneDisplay } from "@/components/checkin/PhoneDisplay";
import { isReservationPaid, paymentBadgeClass } from "@/components/checkin/ReservationCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatDateWithTime, isCheckoutPast } from "@/lib/format-dates";
import { getGoogleMapsUrl } from "@/lib/establishment-address";
import { formatDocumentLine } from "@/lib/guest-display";
import { useI18n } from "@/lib/i18n/context";
import { localeToDateLocale, type Locale } from "@/lib/i18n/types";
import { buildWhatsAppUrl } from "@/lib/phone-display";
import { cn } from "@/lib/utils";
import type { Dependent, GuestLookup, Reservation } from "@/lib/api/types";
import type { UsefulInfoItem, UsefulInfoItemKind } from "@/lib/establishment-settings";
import { parseUsefulInfoSteps, shouldRenderUsefulInfoAsFormattedBlock, shouldRenderUsefulInfoAsSteps } from "@/lib/useful-info-format";
import {
  buildUsefulInfoVariableContext,
  resolveUsefulInfoItemText,
} from "@/lib/useful-info-variables";

type Props = {
  reservation: Reservation;
  mainGuest?: GuestLookup | null;
  dependents: Dependent[];
  /** Reserva já tinha check-in antes de abrir o fluxo */
  alreadyCompleted?: boolean;
  /** Foto do estabelecimento configurada no painel admin */
  establishmentPhotoUrl?: string | null;
  /** Integração Inbox (portaria) ativa no estabelecimento */
  inboxPortariaEnabled?: boolean;
  /** Comodidades, Wi-Fi e informações de acesso configuradas no painel */
  usefulInfoItems?: UsefulInfoItem[];
  /** Permite cadastrar acompanhantes após o check-in */
  canAddCompanions?: boolean;
  addingCompanions?: boolean;
  companionsSaving?: boolean;
  onStartAddCompanions?: () => void;
  companionsEditor?: ReactNode;
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
  const normalized = status.toLowerCase();
  const isPaid = isReservationPaid(reservation, status);
  const isPending =
    !isPaid &&
    (normalized.includes("pendente") ||
      normalized.includes("pending") ||
      normalized.includes("não pago") ||
      normalized.includes("nao pago") ||
      normalized.includes("unpaid") ||
      ((reservation.financial?.isPaid === false || reservation.isPaid === false) &&
        !/\bpago\b/.test(normalized)));

  if (isPaid && !reservation.isCancelled) {
    return "border-0 bg-emerald-600 text-white hover:bg-emerald-600";
  }
  if (isPending && !reservation.isCancelled) {
    return "border-0 bg-amber-100 text-amber-900 hover:bg-amber-100";
  }
  return paymentBadgeClass(reservation, status);
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

function usefulInfoIcon(kind: UsefulInfoItemKind) {
  switch (kind) {
    case "wifi":
      return Wifi;
    case "access":
      return KeyRound;
    case "parking":
      return Car;
    case "hours":
      return Clock;
    case "amenity":
      return Sparkles;
    case "info":
      return Info;
    default:
      return CircleHelp;
  }
}

function UsefulInfoValue({
  item,
  networkLabel,
}: {
  item: UsefulInfoItem;
  networkLabel: string;
}) {
  if (!item.value) return null;

  if (item.kind === "wifi") {
    return (
      <div>
        <p className="text-xs text-muted-foreground">{networkLabel}</p>
        <p className="wrap-anywhere text-sm font-medium text-foreground">{item.value}</p>
      </div>
    );
  }

  if (item.kind === "parking") {
    return (
      <p className="whitespace-pre-line text-sm leading-relaxed text-foreground wrap-anywhere">
        {item.value}
      </p>
    );
  }

  if (shouldRenderUsefulInfoAsSteps(item.kind, item.value)) {
    const steps = parseUsefulInfoSteps(item.value);
    return (
      <ol className="list-decimal space-y-2.5 pl-5 text-sm leading-relaxed text-foreground marker:font-semibold marker:text-primary">
        {steps.map((step, index) => (
          <li key={index} className="pl-1 wrap-anywhere">
            {step}
          </li>
        ))}
      </ol>
    );
  }

  return <p className="wrap-anywhere text-sm font-medium text-foreground">{item.value}</p>;
}

function UsefulInfoCard({
  item,
  onCopySecret,
  copyLabel,
  secretLabel,
  parkingPriceLabel,
  networkLabel,
}: {
  item: UsefulInfoItem;
  onCopySecret: (value: string) => void;
  copyLabel: string;
  secretLabel: string;
  parkingPriceLabel: string;
  networkLabel: string;
}) {
  const Icon = usefulInfoIcon(item.kind);
  const isAccessSteps = item.kind === "access" && shouldRenderUsefulInfoAsSteps(item.kind, item.value);
  const isParkingWide =
    item.kind === "parking" &&
    Boolean(item.value) &&
    (shouldRenderUsefulInfoAsFormattedBlock(item.kind, item.value) || item.value.length > 80);

  return (
    <li
      className={cn(
        "rounded-xl border border-border/80 bg-muted/20 p-3.5 sm:p-4",
        (isAccessSteps || isParkingWide) && "sm:col-span-2",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-background text-primary shadow-sm"
          aria-hidden
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
          <UsefulInfoValue item={item} networkLabel={networkLabel} />
          {item.secret ? (
            <div>
              <p className="text-xs text-muted-foreground">
                {item.kind === "parking" ? parkingPriceLabel : secretLabel}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-2">
                <p className="font-code text-sm font-semibold tracking-wide wrap-anywhere">{item.secret}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-xs print:hidden"
                  onClick={() => onCopySecret(item.secret!)}
                >
                  <Copy className="size-3" aria-hidden />
                  {copyLabel}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export function SuccessScreen({
  reservation,
  mainGuest,
  dependents,
  alreadyCompleted,
  establishmentPhotoUrl,
  inboxPortariaEnabled = false,
  usefulInfoItems = [],
  canAddCompanions = false,
  addingCompanions = false,
  companionsSaving = false,
  onStartAddCompanions,
  companionsEditor,
}: Props) {
  const { locale, t } = useI18n();
  const guest = mainGuest ?? reservation.mainGuest ?? reservation.responsible;
  const guestName = guest?.name ?? "";
  const registeredCompanions = useMemo(
    () =>
      (dependents.length > 0 ? dependents : reservation.dependents ?? []).filter((dependent) =>
        dependent.name?.trim(),
      ),
    [dependents, reservation.dependents],
  );
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
  const remainingCompanionSlots = Math.max(
    0,
    Number(guestsQuantity ?? 1) - 1 - registeredCompanions.length,
  );
  const showAddCompanionsOption =
    !isCancelled &&
    !reservation.isPendingCancellation &&
    remainingCompanionSlots > 0;
  const showRoomPassword = !isCancelled && !checkoutPast && roomPassword != null && roomPassword !== "";
  const checkinTimeLabel = checkinTime?.trim() || "15:00";
  const showInboxFacialNotice =
    inboxPortariaEnabled && !isCancelled && !checkoutPast && !hideGuestDetails;
  const showAccessBlock =
    isCancelled || showRoomPassword || (!checkoutPast && !!accessUnit) || showInboxFacialNotice;

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
  const whatsappMessage = t("checkin.success.whatsappPrefill", {
    establishment: establishmentName,
    localizer: reservation.localizer?.trim() || "—",
  });
  const whatsappUrl = whatsapp ? buildWhatsAppUrl(String(whatsapp), whatsappMessage) : null;

  const showCheckoutFarewell = checkoutPast && !isCancelled;
  const showUsefulInfo =
    !showCheckoutFarewell && Boolean(reservation.localizer || usefulInfoItems.length > 0);
  const variableContext = useMemo(
    () => buildUsefulInfoVariableContext(reservation, guest, locale),
    [reservation, guest, locale],
  );
  const resolvedUsefulInfoItems = useMemo(
    () =>
      usefulInfoItems
        .map((item) => ({
          ...item,
          value: resolveUsefulInfoItemText(item.value, variableContext),
          secret: item.secret
            ? resolveUsefulInfoItemText(item.secret, variableContext) || null
            : null,
        }))
        .filter((item) => item.value || item.secret),
    [usefulInfoItems, variableContext],
  );
  const heroImageUrl = establishmentPhotoUrl?.trim() || "/bg_portal.png";

  const checkoutWhenLabel = formatTimelineDate(checkoutDate, checkoutTime, locale);

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

  async function copyUsefulSecret(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(t("checkin.success.secretCopied"));
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <div className="content-stack app-container">
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
                {showCheckoutFarewell
                  ? t("checkin.success.checkoutCompleteTitle")
                  : alreadyCompleted && !isCancelled
                    ? t("checkin.success.titleDone")
                    : isCancelled
                      ? t("checkin.success.titleCancelled")
                      : t("checkin.success.titleSuccess")}
              </h2>
              {showCheckoutFarewell ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("checkin.success.checkoutCompleteFarewell")}
                </p>
              ) : alreadyCompleted && checkinWhen ? (
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
            <div className="p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:gap-x-5 sm:gap-y-3 lg:gap-x-8">
                {accessUnit ? (
                  <div className="min-w-0 sm:max-w-[12rem] sm:flex-none lg:max-w-[14rem]">
                    <p className="text-xs text-muted-foreground">{t("common.unit")}</p>
                    <p className="mt-0.5 font-display text-base leading-snug wrap-anywhere sm:text-lg">
                      {accessUnit}
                    </p>
                  </div>
                ) : null}
                {showRoomPassword ? (
                  <div className="min-w-0 sm:flex-none sm:max-w-[14rem] lg:max-w-[16rem]">
                    <p className="text-xs text-muted-foreground">{t("checkin.success.accessPassword")}</p>
                    <p className="mt-0.5 font-code text-xl font-semibold tracking-wide wrap-anywhere sm:text-2xl">
                      {roomPassword}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 gap-2 print:hidden"
                      onClick={() => void copyPassword()}
                    >
                      <Copy className="size-4" aria-hidden />
                      {t("checkin.success.copyPassword")}
                    </Button>
                  </div>
                ) : null}
                {showInboxFacialNotice ? (
                  <div
                    className={cn(
                      "min-w-0 rounded-lg border border-primary/15 bg-gradient-to-br from-primary/[0.04] to-primary/[0.07] p-3 sm:p-3.5",
                      accessUnit || showRoomPassword
                        ? "sm:flex-1 sm:basis-[220px] lg:basis-[280px]"
                        : "w-full",
                    )}
                  >
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-9"
                        aria-hidden
                      >
                        <ScanFace className="size-4 sm:size-[1.125rem]" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 space-y-0.5">
                        <p className="font-display text-sm font-semibold leading-snug text-foreground">
                          {t("checkin.success.inboxFacialAccessTitle")}
                        </p>
                        <p className="text-xs leading-relaxed text-muted-foreground sm:text-sm">
                          {t("checkin.success.inboxFacialAccessBody", { time: checkinTimeLabel })}
                        </p>
                        <p className="text-[11px] leading-relaxed text-muted-foreground/90 sm:text-xs">
                          {t("checkin.success.inboxFacialAccessHint")}
                        </p>
                      </div>
                    </div>
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

          {registeredCompanions.length > 0 ||
          showAddCompanionsOption ||
          addingCompanions ||
          remainingCompanionSlots > 0 ? (
            <CardShell className="p-5">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                {!addingCompanions ? (
                  <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("common.companions")}
                  </h4>
                ) : (
                  <span className="sr-only">{t("common.companions")}</span>
                )}
                {showAddCompanionsOption && !addingCompanions && !hideGuestDetails ? (
                  <Button
                    type="button"
                    size="sm"
                    className="gap-1.5 border-transparent bg-accent font-semibold text-accent-foreground shadow-sm shadow-accent/30 hover:bg-accent/90"
                    disabled={companionsSaving}
                    onClick={onStartAddCompanions}
                  >
                    <Users className="size-3.5" aria-hidden />
                    {t("checkin.companions.postCta")}
                  </Button>
                ) : null}
              </div>

              {addingCompanions && companionsEditor ? (
                <div>{companionsEditor}</div>
              ) : registeredCompanions.length > 0 ? (
                <ul className="space-y-4">
                  {registeredCompanions.map((companion, index) => (
                    <li
                      key={`${companion.documentNumber}-${index}`}
                      className={cn(index > 0 && "border-t border-border pt-4")}
                    >
                      <div className="space-y-3">
                        <div>
                          <p className="text-xs text-muted-foreground">{t("common.name")}</p>
                          <p className="font-medium wrap-anywhere">{companion.name}</p>
                        </div>
                        {!hideGuestDetails && companion.mobilePhoneNumber ? (
                          <div>
                            <p className="text-xs text-muted-foreground">{t("common.phone")}</p>
                            <PhoneDisplay phone={companion.mobilePhoneNumber} className="font-medium" />
                          </div>
                        ) : null}
                        {!hideGuestDetails ? (
                          <div>
                            <p className="text-xs text-muted-foreground">{t("common.document")}</p>
                            <p className="font-medium wrap-anywhere">
                              {formatDocumentLine(
                                {
                                  documentNumber: companion.documentNumber,
                                  documentType: companion.documentType,
                                },
                                locale,
                              ) || "—"}
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("checkin.companions.postEmpty")}</p>
              )}
            </CardShell>
          ) : null}

          {showCheckoutFarewell ? (
            <CardShell className="overflow-hidden border-primary/15">
              <div className="bg-gradient-to-br from-primary/[0.06] via-primary/[0.04] to-emerald-50/80 px-5 py-6 sm:p-7">
                <div className="flex items-start gap-4">
                  <span
                    className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary sm:size-14"
                    aria-hidden
                  >
                    <Heart className="size-6 sm:size-7" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 space-y-3">
                    <h4 className="font-display text-xl leading-snug text-primary sm:text-2xl">
                      {t("checkin.success.checkoutCompleteTitle")}
                    </h4>
                    {checkoutWhenLabel ? (
                      <p className="text-sm text-muted-foreground">
                        {t("checkin.success.checkoutCompleteDate", { date: checkoutWhenLabel })}
                      </p>
                    ) : null}
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t("checkin.success.checkoutCompleteSubtitle", {
                        establishment: establishmentName,
                      })}
                    </p>
                    <p className="text-sm leading-relaxed text-foreground">
                      {t("checkin.success.checkoutCompleteBody")}
                    </p>
                    <p className="font-display text-base text-primary">
                      {t("checkin.success.checkoutCompleteFarewell")}
                    </p>
                  </div>
                </div>
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
              <div className="space-y-4">
                {resolvedUsefulInfoItems.length > 0 ? (
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {resolvedUsefulInfoItems.map((item) => (
                      <UsefulInfoCard
                        key={item.id}
                        item={item}
                        onCopySecret={(value) => void copyUsefulSecret(value)}
                        copyLabel={t("checkin.success.copySecret")}
                        secretLabel={t("checkin.success.secretLabel")}
                        parkingPriceLabel={t("checkin.success.parkingPriceLabel")}
                        networkLabel={t("checkin.success.networkLabel")}
                      />
                    ))}
                  </ul>
                ) : null}
                {reservation.localizer ? (
                  <ul className="space-y-3 border-t border-border/60 pt-4 text-sm">
                    <li>
                      <p className="text-xs text-muted-foreground">{t("checkin.success.localizerInfo")}</p>
                      <p className="font-code font-medium">{reservation.localizer}</p>
                    </li>
                  </ul>
                ) : null}
              </div>
            </CardShell>
          ) : null}

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
      {!isCancelled && !checkoutPast ? (
        <div className="rounded-2xl border border-border bg-primary px-5 py-4 text-primary-foreground">
          <p className="font-display text-lg">{t("checkin.success.bannerTitle")}</p>
          <p className="mt-2 text-sm text-primary-foreground/80">{t("checkin.success.bannerBody")}</p>
        </div>
      ) : null}

      {/* Ajuda durante a estadia */}
      {!checkoutPast && (whatsapp || phone || mapsUrl) ? (
        <CardShell className="p-5">
          <p className="text-sm font-medium">{t("checkin.success.helpDuringStay")}</p>
          <div className="mt-4 flex flex-wrap gap-2 print:hidden">
            {whatsappUrl ? (
              <Button variant="outline" size="sm" className="gap-2" asChild>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
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
