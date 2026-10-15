import { useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Copy,
  DoorOpen,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
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
import { CompanionInboxPhotoTile } from "@/components/checkin/CompanionInboxPhotoTile";
import { reservationStatusBadgeClass } from "@/components/checkin/ReservationCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatDateTime, formatDateWithTime, isCheckoutPast } from "@/lib/format-dates";
import { getGoogleMapsUrl } from "@/lib/establishment-address";
import { formatDocumentLine, resolveGuestPhone } from "@/lib/guest-display";
import { useI18n } from "@/lib/i18n/context";
import { localeToDateLocale, type Locale } from "@/lib/i18n/types";
import { buildWhatsAppUrl } from "@/lib/phone-display";
import { cn } from "@/lib/utils";
import { mergeGuests, resolveReservationUnitDisplay } from "@/lib/api/reservation-normalizer";
import type { Dependent, GuestLookup, Reservation } from "@/lib/api/types";
import { companionNeedsInboxPhoto } from "@/lib/companion-inbox-photos";
import { CompanionInviteLink } from "@/components/checkin/CompanionInviteLink";
import type { ExclusiveCameraProps } from "@/lib/camera-utils";
import type { SelfieValidationOutcome } from "@/components/checkin/SelfieCapture";
import type { UsefulInfoItem, UsefulInfoItemKind } from "@/lib/establishment-settings";
import {
  parseUsefulInfoSteps,
  shouldRenderUsefulInfoAsFormattedBlock,
  shouldRenderUsefulInfoAsSteps,
} from "@/lib/useful-info-format";
import {
  buildUsefulInfoVariableContext,
  resolveUsefulInfoItemText,
} from "@/lib/useful-info-variables";

type Props = {
  reservation: Reservation;
  mainGuest?: GuestLookup | null;
  dependents: Dependent[];
  alreadyCompleted?: boolean;
  establishmentPhotoUrl?: string | null;
  inboxPortariaEnabled?: boolean;
  usefulInfoItems?: UsefulInfoItem[];
  canAddCompanions?: boolean;
  addingCompanions?: boolean;
  companionsSaving?: boolean;
  onStartAddCompanions?: () => void;
  companionsEditor?: ReactNode;
  faceValidationEnabled?: boolean;
  onValidateCompanionSelfie?: (photoBase64: string, guestId?: string) => Promise<SelfieValidationOutcome>;
  onSaveCompanionInboxPhoto?: (
    companion: Dependent,
    photoBase64: string,
    companionKey?: string,
  ) => Promise<void>;
  companionInboxPhotoSavingKey?: string | null;
} & Partial<ExclusiveCameraProps>;

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
    .join(" – ");
  if (nightLabel && range) return `${nightLabel} · ${range}`;
  return nightLabel || range;
}

function HubCard({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <article
      id={id}
      className={cn(
        "overflow-hidden rounded-2xl border border-[#E7E9EE] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]",
        className,
      )}
    >
      {children}
    </article>
  );
}

function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <h2 className={cn("text-base font-semibold tracking-tight text-foreground sm:text-lg", className)}>
      {children}
    </h2>
  );
}

function FieldRow({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm font-medium text-foreground wrap-anywhere">{value}</div>
    </div>
  );
}

function CopyButton({
  value,
  label,
  copiedLabel,
  className,
  variant = "outline",
  size = "sm",
}: {
  value: string;
  label: string;
  copiedLabel: string;
  className?: string;
  variant?: "outline" | "ghost" | "secondary";
  size?: "sm" | "default";
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(copiedLabel);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn("tap-safe gap-2 print:hidden", className)}
      onClick={() => void handleCopy()}
      aria-live="polite"
    >
      {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {copied ? copiedLabel : label}
    </Button>
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

function OtherUsefulInfoCard({
  item,
  copyLabel,
  secretLabel,
  parkingPriceLabel,
  networkLabel,
  copiedLabel,
}: {
  item: UsefulInfoItem;
  copyLabel: string;
  secretLabel: string;
  parkingPriceLabel: string;
  networkLabel: string;
  copiedLabel: string;
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
        "rounded-xl border border-[#E7E9EE] bg-[#FAFBFC] p-4",
        (isAccessSteps || isParkingWide) && "sm:col-span-2",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-primary shadow-sm"
          aria-hidden
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-semibold text-foreground">{item.title}</p>
          {item.value ? (
            item.kind === "wifi" ? (
              <div>
                <p className="text-xs font-medium text-muted-foreground">{networkLabel}</p>
                <p className="wrap-anywhere text-sm font-semibold">{item.value}</p>
              </div>
            ) : shouldRenderUsefulInfoAsSteps(item.kind, item.value) ? (
              <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed marker:font-semibold">
                {parseUsefulInfoSteps(item.value).map((step, index) => (
                  <li key={index} className="wrap-anywhere">
                    {step}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="whitespace-pre-line text-sm leading-relaxed wrap-anywhere">{item.value}</p>
            )
          ) : null}
          {item.secret ? (
            <div className="flex flex-wrap items-center gap-2">
              <div>
                <p className="text-xs font-medium text-muted-foreground">
                  {item.kind === "parking" ? parkingPriceLabel : secretLabel}
                </p>
                <p className="font-code text-sm font-semibold tracking-wide wrap-anywhere">{item.secret}</p>
              </div>
              <CopyButton
                value={item.secret}
                label={copyLabel}
                copiedLabel={copiedLabel}
                size="sm"
                className="h-9"
              />
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function AccessStepsSection({
  steps,
  expanded,
  onToggle,
  t,
}: {
  steps: string[];
  expanded: boolean;
  onToggle: () => void;
  t: (key: string) => string;
}) {
  if (steps.length === 0) return null;

  const previewCount = 5;
  const hasMore = steps.length > previewCount;
  const visibleSteps = expanded || !hasMore ? steps : steps.slice(0, previewCount);

  return (
    <HubCard className="p-5 sm:p-6">
      <SectionTitle className="mb-5">{t("checkin.success.howToEnter")}</SectionTitle>
      <ol className="space-y-0">
        {visibleSteps.map((step, index) => (
          <li key={index} className="relative flex gap-4 pb-5 last:pb-0">
            <div className="flex flex-col items-center">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {index + 1}
              </span>
              {index < visibleSteps.length - 1 ? (
                <span className="mt-2 h-full min-h-6 w-px flex-1 bg-[#E7E9EE]" aria-hidden />
              ) : null}
            </div>
            <p className="min-w-0 pt-1.5 text-sm leading-relaxed text-foreground wrap-anywhere">{step}</p>
          </li>
        ))}
      </ol>
      {hasMore ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-3 w-full gap-2 text-muted-foreground"
          onClick={onToggle}
        >
          <ChevronDown className={cn("size-4 transition-transform", expanded && "rotate-180")} aria-hidden />
          {expanded ? t("checkin.success.hideExtraSteps") : t("checkin.success.viewAllSteps")}
        </Button>
      ) : null}
    </HubCard>
  );
}

function WifiCard({
  item,
  t,
}: {
  item: UsefulInfoItem;
  t: (key: string) => string;
}) {
  const [showSecret, setShowSecret] = useState(true);

  return (
    <HubCard className="p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700" aria-hidden>
          <Wifi className="size-4" />
        </span>
        <SectionTitle>{item.title || t("checkin.success.wifiCardTitle")}</SectionTitle>
      </div>
      <div className="space-y-4">
        {item.value ? (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <FieldRow label={t("checkin.success.networkLabel")} value={item.value} />
            <CopyButton
              value={item.value}
              label={t("checkin.success.copyNetwork")}
              copiedLabel={t("checkin.success.copied")}
              className="h-10"
            />
          </div>
        ) : null}
        {item.secret ? (
          <div className="rounded-xl border border-[#E7E9EE] bg-[#FAFBFC] p-4">
            <p className="text-xs font-medium text-muted-foreground">{t("checkin.success.secretLabel")}</p>
            <p className="mt-1 font-code text-lg font-semibold tracking-wide wrap-anywhere">
              {showSecret ? item.secret : "••••••••"}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="tap-safe gap-2"
                onClick={() => setShowSecret((prev) => !prev)}
              >
                {showSecret ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                {showSecret ? t("checkin.success.hidePassword") : t("checkin.success.showPassword")}
              </Button>
              <CopyButton
                value={item.secret}
                label={t("checkin.success.copySecret")}
                copiedLabel={t("checkin.success.copied")}
                className="h-10"
              />
            </div>
          </div>
        ) : null}
      </div>
    </HubCard>
  );
}

function AccessEssentialCard({
  icon: Icon,
  label,
  value,
  subtitle,
  tone,
  footer,
}: {
  icon: typeof DoorOpen;
  label: string;
  value: React.ReactNode;
  subtitle?: React.ReactNode;
  tone: "room" | "password" | "wifi";
  footer?: React.ReactNode;
}) {
  const toneClasses = {
    room: "border-sky-100 bg-sky-50/80",
    password: "border-violet-100 bg-violet-50/80",
    wifi: "border-emerald-100 bg-emerald-50/80",
  };
  const iconClasses = {
    room: "bg-sky-100 text-sky-700",
    password: "bg-violet-100 text-violet-700",
    wifi: "bg-emerald-100 text-emerald-700",
  };

  return (
    <div
      className={cn(
        "flex min-h-[9.5rem] min-w-0 flex-col rounded-2xl border p-4 sm:min-h-[10.5rem] sm:p-5",
        toneClasses[tone],
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", iconClasses[tone])}
          aria-hidden
        >
          <Icon className="size-4" strokeWidth={1.75} />
        </span>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="mt-3 min-w-0 flex-1">
        <div
          className={cn(
            "wrap-anywhere font-semibold leading-tight text-foreground",
            tone === "room" ? "text-[1.75rem] sm:text-[2rem]" : "text-xl sm:text-2xl",
            tone === "password" && "font-code tracking-wide",
          )}
        >
          {value}
        </div>
        {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground wrap-anywhere">{subtitle}</p> : null}
      </div>
      {footer ? <div className="mt-3 pt-1">{footer}</div> : null}
    </div>
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
  faceValidationEnabled = false,
  onValidateCompanionSelfie,
  onSaveCompanionInboxPhoto,
  companionInboxPhotoSavingKey = null,
  captureId: _successCaptureId,
  activeCaptureId,
  onRequestCapture,
  onReleaseCapture,
}: Props) {
  const { locale, t } = useI18n();
  const [accessStepsExpanded, setAccessStepsExpanded] = useState(false);

  const documentDisplayOptions = reservation.pmsProvider
    ? { pmsProvider: reservation.pmsProvider }
    : undefined;
  const guest =
    mergeGuests(
      reservation.mainGuest,
      mainGuest ?? undefined,
      reservation.responsible as GuestLookup | undefined,
    ) ??
    mainGuest ??
    reservation.mainGuest ??
    reservation.responsible;
  const guestName = guest?.name ?? "";
  const guestPhone = resolveGuestPhone(guest);
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

  const unitDisplayInfo = useMemo(
    () => resolveReservationUnitDisplay(reservation),
    [reservation],
  );
  const unitDisplay = unitDisplayInfo.suiteLabel;
  const unitNumberDisplay = unitDisplayInfo.unitNumberLabel;
  const accessUnit = unitDisplayInfo.accessLabel;

  const isCancelled = reservation.isCancelled === true;
  const checkoutPast = isCheckoutPast(checkoutDate, checkoutTime);
  const hideGuestDetails = isCancelled || checkoutPast;
  const remainingCompanionSlots = Math.max(
    0,
    Number(guestsQuantity ?? 1) - 1 - registeredCompanions.length,
  );
  const showAddCompanionsOption =
    !isCancelled && !reservation.isPendingCancellation && remainingCompanionSlots > 0;
  const showRoomPassword = !isCancelled && !checkoutPast && roomPassword != null && roomPassword !== "";
  const showRoomNumber = !isCancelled && !checkoutPast && !!unitNumberDisplay;
  const checkinTimeLabel = checkinTime?.trim() || "15:00";
  const showInboxFacialNotice =
    inboxPortariaEnabled && !isCancelled && !checkoutPast && !hideGuestDetails;
  const showAccessBlock =
    isCancelled ||
    showRoomPassword ||
    showRoomNumber ||
    (!checkoutPast && !!unitDisplay) ||
    showInboxFacialNotice;

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

  const wifiItems = useMemo(
    () => resolvedUsefulInfoItems.filter((item) => item.kind === "wifi"),
    [resolvedUsefulInfoItems],
  );
  const accessItems = useMemo(
    () => resolvedUsefulInfoItems.filter((item) => item.kind === "access"),
    [resolvedUsefulInfoItems],
  );
  const parkingItems = useMemo(
    () => resolvedUsefulInfoItems.filter((item) => item.kind === "parking"),
    [resolvedUsefulInfoItems],
  );
  const otherUsefulItems = useMemo(
    () =>
      resolvedUsefulInfoItems.filter(
        (item) => item.kind !== "wifi" && item.kind !== "access" && item.kind !== "parking",
      ),
    [resolvedUsefulInfoItems],
  );
  const accessSteps = useMemo(
    () => accessItems.flatMap((item) => parseUsefulInfoSteps(item.value)),
    [accessItems],
  );
  const primaryWifi = wifiItems[0] ?? null;
  const showWifiInAccessHub =
    !isCancelled && !checkoutPast && Boolean(primaryWifi?.value || primaryWifi?.secret);
  const wifiItemsBelow = showWifiInAccessHub ? wifiItems.slice(1) : wifiItems;
  const propertyAccessLabel = accessUnit ?? unitDisplay;
  const essentialAccessCount = [showRoomNumber, showRoomPassword, showWifiInAccessHub].filter(Boolean).length;

  const heroImageUrl = establishmentPhotoUrl?.trim() || "/bg_portal.png";
  const checkoutWhenLabel = formatTimelineDate(checkoutDate, checkoutTime, locale);

  const confirmationTitle = showCheckoutFarewell
    ? t("checkin.success.checkoutCompleteTitle")
    : alreadyCompleted && !isCancelled
      ? t("checkin.success.titleDone")
      : isCancelled
        ? t("checkin.success.titleCancelled")
        : t("checkin.success.titleSuccess");

  const showMobileBar =
    !isCancelled && !checkoutPast && (showRoomNumber || showRoomPassword || whatsappUrl || mapsUrl || phone);

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

  function scrollToAccess() {
    document.getElementById("stay-access-hub")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToHelp() {
    document.getElementById("stay-help-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="success-stay-hub success-mobile-bar-spacer space-y-5 pb-2 sm:space-y-6">
      {/* Confirmação compacta */}
      <section
        className={cn(
          "flex items-start gap-3 rounded-2xl border px-4 py-4 sm:px-5",
          isCancelled
            ? "border-destructive/20 bg-destructive/5"
            : "border-emerald-200/80 bg-emerald-50/70",
        )}
        aria-live="polite"
      >
        <span
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            isCancelled ? "bg-destructive text-white" : "bg-emerald-600 text-white",
          )}
          aria-hidden
        >
          {isCancelled ? <AlertTriangle className="size-5" /> : <Check className="size-5" strokeWidth={2.5} />}
        </span>
        <div className="min-w-0 space-y-1">
          <h1 className="text-base font-semibold leading-snug text-foreground sm:text-lg">{confirmationTitle}</h1>
          {showCheckoutFarewell ? (
            <p className="text-sm text-muted-foreground">{t("checkin.success.checkoutCompleteFarewell")}</p>
          ) : alreadyCompleted && checkinWhen && !isCancelled ? (
            <p className="text-sm text-muted-foreground">
              {t("checkin.success.doneAt")} {checkinWhen}
            </p>
          ) : !isCancelled ? (
            <p className="text-sm text-muted-foreground">{t("checkin.success.readySubtitle")}</p>
          ) : (
            <p className="text-sm text-destructive">{t("checkin.success.cancelledAccessNotice")}</p>
          )}
        </div>
      </section>

      {/* Acesso à acomodação — prioridade máxima */}
      {showAccessBlock ? (
        isCancelled ? (
          <HubCard className="border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm text-destructive">{t("checkin.success.cancelledAccessNotice")}</p>
            </div>
          </HubCard>
        ) : (
          <HubCard id="stay-access-hub" className="overflow-hidden">
            <div className="border-b border-[#E7E9EE] px-5 py-4 sm:px-6">
              <div className="flex items-start gap-3">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                  aria-hidden
                >
                  <KeyRound className="size-5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <SectionTitle>{t("checkin.success.accessHubTitle")}</SectionTitle>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t("checkin.success.readySubtitle")}</p>
                </div>
              </div>
            </div>
            <div className="space-y-5 p-5 sm:p-6">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_240px]">
                <div
                  className={cn(
                    "grid gap-3",
                    essentialAccessCount >= 3 && "sm:grid-cols-3",
                    essentialAccessCount === 2 && "sm:grid-cols-2",
                  )}
                >
                  {showRoomNumber ? (
                    <AccessEssentialCard
                      icon={DoorOpen}
                      label={t("checkin.success.yourRoom")}
                      value={unitNumberDisplay}
                      subtitle={unitDisplay}
                      tone="room"
                    />
                  ) : null}
                  {showRoomPassword ? (
                    <AccessEssentialCard
                      icon={KeyRound}
                      label={t("checkin.success.accessPassword")}
                      value={roomPassword}
                      tone="password"
                      footer={
                        <CopyButton
                          value={String(roomPassword)}
                          label={t("checkin.success.copyPassword")}
                          copiedLabel={t("checkin.success.copied")}
                          className="h-10 w-full border-white/80 bg-white/90"
                          size="sm"
                        />
                      }
                    />
                  ) : null}
                  {showWifiInAccessHub && primaryWifi ? (
                    <AccessEssentialCard
                      icon={Wifi}
                      label={t("checkin.success.quickWifi")}
                      value={primaryWifi.value || t("checkin.success.wifiCardTitle")}
                      subtitle={
                        primaryWifi.secret ? (
                          <>
                            {t("checkin.success.secretLabel")}: {primaryWifi.secret}
                          </>
                        ) : undefined
                      }
                      tone="wifi"
                      footer={
                        primaryWifi.secret ? (
                          <CopyButton
                            value={primaryWifi.secret}
                            label={t("checkin.success.copySecret")}
                            copiedLabel={t("checkin.success.copied")}
                            className="h-10 w-full border-white/80 bg-white/90"
                            size="sm"
                          />
                        ) : primaryWifi.value ? (
                          <CopyButton
                            value={primaryWifi.value}
                            label={t("checkin.success.copyNetwork")}
                            copiedLabel={t("checkin.success.copied")}
                            className="h-10 w-full border-white/80 bg-white/90"
                            size="sm"
                          />
                        ) : undefined
                      }
                    />
                  ) : null}
                </div>

                <div className="relative min-h-[11rem] overflow-hidden rounded-2xl border border-[#E7E9EE] sm:min-h-[10.5rem] xl:min-h-full">
                  <img src={heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/5"
                    aria-hidden
                  />
                  <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                    <p className="text-base font-semibold leading-snug wrap-anywhere">{establishmentName}</p>
                    {propertyAccessLabel ? (
                      <p className="mt-1 text-sm text-white/85 wrap-anywhere">{propertyAccessLabel}</p>
                    ) : null}
                  </div>
                </div>
              </div>

              {showInboxFacialNotice ? (
                <div className="rounded-2xl border border-primary/10 bg-primary/[0.03] p-4 sm:p-5">
                  <div className="flex min-w-0 items-start gap-3">
                    <span
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                      aria-hidden
                    >
                      <ScanFace className="size-5" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-semibold text-foreground">
                        {t("checkin.success.inboxFacialAccessTitle")}
                      </p>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {t("checkin.success.inboxFacialAccessBody", { time: checkinTimeLabel })}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {t("checkin.success.inboxFacialAccessHint")}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </HubCard>
        )
      ) : null}

      {/* Como entrar */}
      {!isCancelled && !checkoutPast && accessSteps.length > 0 ? (
        <AccessStepsSection
          steps={accessSteps}
          expanded={accessStepsExpanded}
          onToggle={() => setAccessStepsExpanded((prev) => !prev)}
          t={t}
        />
      ) : null}

      {/* Resumo da hospedagem */}
      <HubCard>
        <div className="flex flex-col md:flex-row">
          <div className="relative min-h-44 w-full shrink-0 overflow-hidden md:max-w-[240px]">
            <img src={heroImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent md:hidden" />
            <div className="relative p-4 md:hidden">
              <p className="text-lg font-semibold text-white">{establishmentName}</p>
            </div>
          </div>
          <div className="min-w-0 flex-1 space-y-5 p-5 sm:p-6">
            <div className="space-y-2">
              <h2 className="hidden text-xl font-semibold text-foreground md:block">{establishmentName}</h2>
              {country || mapsUrl ? (
                <div className="flex flex-wrap items-center gap-2">
                  {country ? <p className="text-sm text-muted-foreground">{country}</p> : null}
                  {mapsUrl ? (
                    <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs" asChild>
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                        {t("checkin.success.viewOnMaps")}
                        <ExternalLink className="size-3 opacity-60" aria-hidden />
                      </a>
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldRow label={t("common.category")} value={unitDisplay} />
              <FieldRow label={t("common.unit")} value={accessUnit ?? unitDisplay} />
              <FieldRow label={t("common.guests")} value={guestsLabel} />
              <FieldRow label={t("checkin.success.stayDuration")} value={stayRangeLabel} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[#E7E9EE] bg-[#FAFBFC] p-4">
                <p className="text-xs font-medium text-muted-foreground">{t("common.checkin")}</p>
                <p className="mt-1 text-sm font-semibold">
                  {formatTimelineDate(checkinDate, checkinTime, locale)}
                </p>
              </div>
              <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
                <p className="text-xs font-medium text-primary/80">{t("common.checkout")}</p>
                <p className="mt-1 text-sm font-semibold text-primary">
                  {formatTimelineDate(checkoutDate, checkoutTime, locale)}
                </p>
              </div>
            </div>

            {nights != null ? (
              <div className="flex items-center gap-2 rounded-xl border border-[#E7E9EE] px-4 py-3 text-sm">
                <Moon className="size-4 text-muted-foreground" aria-hidden />
                <span className="font-medium">
                  {nights === 1
                    ? t("checkin.success.oneNight")
                    : t("checkin.success.nightsCount", { n: nights })}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </HubCard>

      {/* Wi-Fi adicional (evita repetir o card já exibido no acesso) */}
      {wifiItemsBelow.map((item) => (
        <WifiCard key={item.id} item={item} t={t} />
      ))}

      {/* Estacionamento */}
      {parkingItems.map((item) => (
        <HubCard key={item.id} className="p-5 sm:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-600" aria-hidden>
              <Car className="size-4" />
            </span>
            <SectionTitle>{item.title || t("checkin.success.parkingTitle")}</SectionTitle>
          </div>
          {item.value ? (
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground wrap-anywhere">{item.value}</p>
          ) : null}
          {item.secret ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <p className="font-code text-sm font-semibold wrap-anywhere">{item.secret}</p>
              <CopyButton
                value={item.secret}
                label={t("checkin.success.copySecret")}
                copiedLabel={t("checkin.success.copied")}
              />
            </div>
          ) : null}
        </HubCard>
      ))}

      {/* Outras informações úteis */}
      {otherUsefulItems.length > 0 ? (
        <HubCard className="p-5 sm:p-6">
          <SectionTitle className="mb-4">{t("checkin.success.usefulInfoTitle")}</SectionTitle>
          <ul className="grid gap-3 sm:grid-cols-2">
            {otherUsefulItems.map((item) => (
              <OtherUsefulInfoCard
                key={item.id}
                item={item}
                copyLabel={t("checkin.success.copySecret")}
                secretLabel={t("checkin.success.secretLabel")}
                parkingPriceLabel={t("checkin.success.parkingPriceLabel")}
                networkLabel={t("checkin.success.networkLabel")}
                copiedLabel={t("checkin.success.copied")}
              />
            ))}
          </ul>
        </HubCard>
      ) : null}

      {/* Banner informativo (sem recepção) */}
      {!isCancelled && !checkoutPast ? (
        <div className="rounded-2xl border border-[#E7E9EE] bg-white px-5 py-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">{t("checkin.success.bannerTitle")}</p>
          <p className="mt-1 leading-relaxed">{t("checkin.success.bannerBody")}</p>
        </div>
      ) : null}

      {/* Hóspede principal */}
      <HubCard className="p-5 sm:p-6">
        <SectionTitle className="mb-4">{t("common.mainGuest")}</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <FieldRow label={t("common.name")} value={guestName || "—"} />
          {!hideGuestDetails ? (
            <FieldRow
              label={t("common.phone")}
              value={
                guestPhone ? <PhoneDisplay phone={guestPhone} className="font-medium" /> : "—"
              }
            />
          ) : null}
          {!hideGuestDetails ? (
            <FieldRow
              label={t("common.document")}
              value={formatDocumentLine(guest, locale, documentDisplayOptions) || "—"}
            />
          ) : null}
        </div>
      </HubCard>

      {/* Acompanhantes */}
      {registeredCompanions.length > 0 ||
      showAddCompanionsOption ||
      addingCompanions ||
      remainingCompanionSlots > 0 ? (
        <HubCard className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {!addingCompanions ? (
              <SectionTitle>{t("common.companions")}</SectionTitle>
            ) : (
              <span className="sr-only">{t("common.companions")}</span>
            )}
            {showAddCompanionsOption && !addingCompanions && !hideGuestDetails ? (
              <Button
                type="button"
                size="sm"
                className="tap-safe gap-1.5"
                disabled={companionsSaving}
                onClick={onStartAddCompanions}
              >
                <Users className="size-3.5" aria-hidden />
                {t("checkin.companions.postCta")}
              </Button>
            ) : null}
          </div>
          {showAddCompanionsOption && !addingCompanions && !hideGuestDetails && reservation.localizer ? (
            <div className="mb-4">
              <CompanionInviteLink localizer={String(reservation.localizer)} />
            </div>
          ) : null}

          {addingCompanions && companionsEditor ? (
            <div>{companionsEditor}</div>
          ) : registeredCompanions.length > 0 ? (
            <ul className="space-y-4">
              {registeredCompanions.map((companion, index) => (
                <li
                  key={`${companion.documentNumber}-${index}`}
                  className={cn(index > 0 && "border-t border-[#E7E9EE] pt-4")}
                >
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FieldRow label={t("common.name")} value={companion.name} />
                    {!hideGuestDetails && companion.mobilePhoneNumber ? (
                      <FieldRow
                        label={t("common.phone")}
                        value={<PhoneDisplay phone={companion.mobilePhoneNumber} className="font-medium" />}
                      />
                    ) : null}
                    {!hideGuestDetails ? (
                      <FieldRow
                        label={t("common.document")}
                        value={
                          formatDocumentLine(
                            {
                              documentNumber: companion.documentNumber,
                              documentType: companion.documentType,
                            },
                            locale,
                            documentDisplayOptions,
                          ) || "—"
                        }
                      />
                    ) : null}
                  </div>
                  {!addingCompanions &&
                  inboxPortariaEnabled &&
                  onSaveCompanionInboxPhoto &&
                  companionNeedsInboxPhoto(companion) ? (
                    <div className="mt-4">
                      <CompanionInboxPhotoTile
                        companion={companion}
                        companionKey={`${companion.documentNumber || companion.name}-${index}`}
                        saving={
                          companionInboxPhotoSavingKey ===
                          `${companion.documentNumber || companion.name}-${index}`
                        }
                        faceValidationEnabled={faceValidationEnabled}
                        onValidateSelfie={onValidateCompanionSelfie}
                        onSave={(photoBase64) =>
                          onSaveCompanionInboxPhoto(
                            companion,
                            photoBase64,
                            `${companion.documentNumber || companion.name}-${index}`,
                          )
                        }
                        captureId={`success-companion-photo-${index}`}
                        activeCaptureId={activeCaptureId}
                        onRequestCapture={onRequestCapture}
                        onReleaseCapture={onReleaseCapture}
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("checkin.companions.postEmpty")}</p>
          )}
        </HubCard>
      ) : null}

      {/* Despedida pós check-out */}
      {showCheckoutFarewell ? (
        <HubCard className="overflow-hidden">
          <div className="bg-gradient-to-br from-primary/[0.05] to-emerald-50/60 px-5 py-6 sm:p-7">
            <div className="flex items-start gap-4">
              <span
                className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
                aria-hidden
              >
                <Heart className="size-6" strokeWidth={1.75} />
              </span>
              <div className="min-w-0 space-y-3">
                <SectionTitle>{t("checkin.success.checkoutCompleteTitle")}</SectionTitle>
                {checkoutWhenLabel ? (
                  <p className="text-sm text-muted-foreground">
                    {t("checkin.success.checkoutCompleteDate", { date: checkoutWhenLabel })}
                  </p>
                ) : null}
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {t("checkin.success.checkoutCompleteSubtitle", { establishment: establishmentName })}
                </p>
                <p className="text-sm leading-relaxed text-foreground">
                  {t("checkin.success.checkoutCompleteBody")}
                </p>
                <p className="text-base font-semibold text-primary">
                  {t("checkin.success.checkoutCompleteFarewell")}
                </p>
              </div>
            </div>
          </div>
        </HubCard>
      ) : null}

      {/* Detalhes da reserva */}
      {showUsefulInfo ? (
        <HubCard className="p-5 sm:p-6">
          <SectionTitle className="mb-4">{t("checkin.success.reservationDetails")}</SectionTitle>
          <div className="grid gap-4 sm:grid-cols-2">
            {reservation.localizer ? (
              <div className="min-w-0 sm:col-span-2">
                <p className="text-xs font-medium text-muted-foreground">{t("checkin.success.localizerInfo")}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <p className="font-code text-base font-semibold">{reservation.localizer}</p>
                  <CopyButton
                    value={reservation.localizer}
                    label={t("checkin.success.copyLocalizer")}
                    copiedLabel={t("checkin.success.copied")}
                    size="sm"
                  />
                </div>
              </div>
            ) : null}
            <FieldRow label={t("common.category")} value={unitDisplay} />
            <FieldRow label={t("common.unit")} value={accessUnit ?? unitDisplay} />
            <FieldRow label={t("common.guests")} value={guestsLabel} />
            <FieldRow label={t("common.checkin")} value={formatTimelineDate(checkinDate, checkinTime, locale)} />
            <FieldRow label={t("common.checkout")} value={formatTimelineDate(checkoutDate, checkoutTime, locale)} />
          </div>
        </HubCard>
      ) : null}

      {/* Pagamento */}
      {price || reservation.label ? (
        <HubCard className="p-5 sm:p-6">
          <SectionTitle className="mb-4">{t("checkin.success.paymentTitle")}</SectionTitle>
          <div className="space-y-4">
            {reservation.label ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{t("checkin.success.paymentStatus")}</span>
                <Badge className={reservationStatusBadgeClass(reservation, reservation.label)}>
                  {reservation.label}
                </Badge>
              </div>
            ) : null}
            {price ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-muted-foreground">{t("common.reservationValue")}</span>
                <span className="font-code text-xl font-semibold">{price}</span>
              </div>
            ) : null}
          </div>
        </HubCard>
      ) : null}

      {/* Ajuda */}
      {!checkoutPast && (whatsappUrl || phone || mapsUrl) ? (
        <HubCard id="stay-help-section" className="p-5 sm:p-6">
          <SectionTitle className="mb-2">{t("checkin.success.helpDuringStay")}</SectionTitle>
          <p className="mb-4 text-sm text-muted-foreground">{t("checkin.success.subtitleSuccess")}</p>
          <div className="grid gap-3 sm:grid-cols-2 print:hidden">
            {whatsappUrl ? (
              <Button className="tap-safe h-12 gap-2 bg-[#25D366] text-white hover:bg-[#20bd5a]" asChild>
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon className="size-5" />
                  {t("common.whatsapp")}
                </a>
              </Button>
            ) : null}
            {mapsUrl ? (
              <Button variant="outline" className="tap-safe h-12 gap-2" asChild>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  <MapPin className="size-4" aria-hidden />
                  {t("checkin.success.location")}
                </a>
              </Button>
            ) : null}
            {phone ? (
              <Button variant="outline" className="tap-safe h-12 gap-2 sm:col-span-2" asChild>
                <a href={`tel:${String(phone).replace(/\s/g, "")}`}>
                  <Phone className="size-4" aria-hidden />
                  {t("checkin.success.call")}
                </a>
              </Button>
            ) : null}
          </div>
        </HubCard>
      ) : null}

      {/* Ações finais */}
      <div className="grid gap-3 sm:grid-cols-2 print:hidden">
        <Button
          variant="outline"
          className="tap-safe h-12 gap-2 border-[#E7E9EE] bg-white"
          onClick={() => window.print()}
        >
          <Download className="size-4" aria-hidden />
          {t("checkin.success.downloadReceipt")}
        </Button>
        <Button className="tap-safe h-12 gap-2" onClick={() => void share()}>
          <Share2 className="size-4" aria-hidden />
          {t("checkin.success.shareReservation")}
        </Button>
      </div>

      {/* LGPD */}
      <div className="flex flex-wrap items-center justify-center gap-5 py-2 text-xs text-muted-foreground print:hidden">
        <span className="inline-flex items-center gap-2">
          <Lock className="size-3.5" aria-hidden />
          {t("checkin.success.dataSecure")}
        </span>
        <span className="inline-flex items-center gap-2">
          <ShieldCheck className="size-3.5" aria-hidden />
          {t("checkin.success.lgpdCompliant")}
        </span>
      </div>

      {/* Barra fixa mobile */}
      {showMobileBar ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40 border-t border-[#E7E9EE] bg-white/95 px-3 py-2 shadow-[0_-4px_20px_rgba(15,23,42,0.06)] backdrop-blur-sm sm:hidden print:hidden"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          <div className="mx-auto flex max-w-lg items-stretch gap-2">
            {showRoomNumber ? (
              <button
                type="button"
                className="tap-safe min-h-11 flex-1 rounded-xl bg-primary/5 px-3 text-left"
                onClick={scrollToAccess}
              >
                <p className="text-[10px] font-medium text-muted-foreground">{t("checkin.success.quickRoom")}</p>
                <p className="text-sm font-bold text-primary">{unitNumberDisplay}</p>
              </button>
            ) : null}
            {showRoomPassword ? (
              <button
                type="button"
                className="tap-safe min-h-11 flex-1 rounded-xl border border-[#E7E9EE] px-3 text-sm font-semibold"
                onClick={scrollToAccess}
              >
                {t("checkin.success.mobileViewPassword")}
              </button>
            ) : null}
            {(whatsappUrl || mapsUrl || phone) ? (
              <button
                type="button"
                className="tap-safe min-h-11 flex-1 rounded-xl bg-primary px-3 text-sm font-semibold text-primary-foreground"
                onClick={scrollToHelp}
              >
                {t("checkin.success.mobileHelp")}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
