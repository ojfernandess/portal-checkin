import { CheckCircle2, Download, KeyRound, MessageCircle, Phone, Share2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EstablishmentAddressBlock } from "@/components/checkin/EstablishmentAddressBlock";
import { PhoneDisplay } from "@/components/checkin/PhoneDisplay";
import { paymentBadgeClass } from "@/components/checkin/ReservationCard";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime, formatDateWithTime, isCheckoutPast } from "@/lib/format-dates";
import {
  formatBirthDate,
  formatDocumentLine,
  formatGender,
  formatGuestAddress,
} from "@/lib/guest-display";
import { useI18n } from "@/lib/i18n/context";
import { localeToDateLocale, type Locale } from "@/lib/i18n/types";
import type { Dependent, GuestLookup, Reservation } from "@/lib/api/types";

type Props = {
  reservation: Reservation;
  mainGuest?: GuestLookup | null;
  dependents: Dependent[];
  /** Reserva já tinha check-in antes de abrir o fluxo */
  alreadyCompleted?: boolean;
};

function formatMoney(value: number | string | undefined, locale: Locale): string | null {
  if (value == null || value === "") return null;
  const amount = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(amount)) return String(value);
  return amount.toLocaleString(localeToDateLocale(locale), { style: "currency", currency: "BRL" });
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="font-medium wrap-anywhere">{value}</dd>
    </div>
  );
}

export function SuccessScreen({ reservation, mainGuest, dependents, alreadyCompleted }: Props) {
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
  const reservationDate = stay.reservationDate ?? reservation.reservationDate;

  const establishment = reservation.establishment ?? {};
  const phone = establishment.phone;
  const whatsapp = establishment.whatsapp;

  const price = formatMoney(reservation.financial?.price ?? reservation.price, locale);
  const roomPassword =
    reservation.roomPassword ?? reservation.access?.roomPassword ?? null;

  const unitName =
    reservation.unitName ?? reservation.roomName ?? reservation.room?.unitName;
  const accessUnit = unitName?.trim() || null;
  const categoryName = reservation.categoryName ?? reservation.room?.categoryName;
  const capacity = reservation.capacity ?? reservation.room?.capacity;

  const isCancelled = reservation.isCancelled === true;
  const checkoutPast = isCheckoutPast(checkoutDate, checkoutTime);
  const hideGuestDetails = isCancelled || checkoutPast;
  const showRoomPassword = !isCancelled && !checkoutPast && roomPassword != null && roomPassword !== "";
  const showAccessBlock = isCancelled || showRoomPassword || (!checkoutPast && !!accessUnit);

  const checkinWhen = reservation.checkin?.localizedDate
    ? formatDateTime(String(reservation.checkin.localizedDate), locale)
    : null;

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

  return (
    <div className="space-y-5 print:space-y-3">
      <div className="flex flex-col items-center gap-3 text-center">
        <CheckCircle2 className="size-16 animate-seal text-success" aria-hidden />
        <h2 className="font-display text-2xl">
          {alreadyCompleted ? t("checkin.success.titleDone") : t("checkin.success.titleSuccess")}
        </h2>
        {alreadyCompleted && checkinWhen ? (
          <p className="text-sm text-muted-foreground">
            {t("checkin.success.doneAt")} {checkinWhen}
          </p>
        ) : null}
      </div>

      <article className="min-w-0 space-y-5 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div>
          <h3 className="font-display text-lg">
            {reservation.establishmentName ?? establishment.establishmentName ?? t("common.establishment")}
          </h3>
          {reservation.localizer ? (
            <p className="font-code text-xs text-muted-foreground">
              {t("common.localizer")}: {reservation.localizer}
            </p>
          ) : null}
          <EstablishmentAddressBlock reservation={reservation} className="mt-3" />
        </div>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("common.accommodation")}
          </h4>
          <dl className="grid min-w-0 grid-cols-2 gap-3 text-sm">
            <Field label={t("common.category")} value={categoryName} />
            <Field label={t("common.unit")} value={unitName} />
            <Field label={t("common.number")} value={reservation.unitNumber} />
            <Field label={t("common.capacity")} value={capacity} />
          </dl>
        </section>

        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("common.stay")}
          </h4>
          <dl className="grid min-w-0 grid-cols-2 gap-3 text-sm">
            <Field
              label={t("common.checkin")}
              value={formatDateWithTime(checkinDate, checkinTime, locale)}
            />
            <Field
              label={t("common.checkout")}
              value={formatDateWithTime(checkoutDate, checkoutTime, locale)}
            />
            <Field label={t("common.reservationDate")} value={formatDate(reservationDate, locale)} />
            <Field label={t("common.nights")} value={nights} />
            <Field label={t("common.guests")} value={guestsQuantity ?? 1} />
          </dl>
        </section>

        {showAccessBlock ? (
          isCancelled ? (
            <div className="flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
              <p className="text-sm text-destructive">{t("checkin.success.cancelledAccessNotice")}</p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-accent/50 bg-accent/10 px-4 py-3">
              <KeyRound className="mt-0.5 size-5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t("common.access")}
                </p>
                {accessUnit ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t("common.unit")}: </span>
                    <span className="font-medium wrap-anywhere">{accessUnit}</span>
                  </p>
                ) : null}
                {showRoomPassword ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t("common.password")}: </span>
                    <span className="font-code text-lg font-semibold wrap-anywhere">{roomPassword}</span>
                  </p>
                ) : null}
              </div>
            </div>
          )
        ) : null}

        <section className="space-y-3">
          <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t("common.mainGuest")}
          </h4>
          <dl className="grid min-w-0 grid-cols-2 gap-3 text-sm">
            <Field label={t("common.name")} value={guestName} />
            {!hideGuestDetails ? (
              <>
                <Field label={t("common.email")} value={guest?.email} />
                <Field
                  label={t("common.phone")}
                  value={
                    guest?.mobilePhoneNumber ? <PhoneDisplay phone={guest.mobilePhoneNumber} /> : undefined
                  }
                />
                <Field label={t("common.document")} value={formatDocumentLine(guest, locale)} />
                <Field
                  label={t("guest.rg")}
                  value={
                    guest?.rg
                      ? guest.expeditor
                        ? `${guest.rg} (${guest.expeditor})`
                        : guest.rg
                      : undefined
                  }
                />
                <Field label={t("common.birthDate")} value={formatBirthDate(guest?.birthDate, locale)} />
                <Field label={t("common.gender")} value={formatGender(guest?.gender, locale)} />
                <Field label={t("common.profession")} value={guest?.profession} />
                <Field label={t("common.nationality")} value={guest?.citizenship} />
                <div className="col-span-2">
                  <Field label={t("common.address")} value={formatGuestAddress(guest)} />
                </div>
              </>
            ) : null}
          </dl>
          {dependents.length > 0 ? (
            <div className="space-y-2 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t("common.companions")}
              </p>
              <ul className="space-y-2 text-sm">
                {dependents.map((dependent) => (
                  <li key={dependent.documentNumber || dependent.name}>
                    <p className="font-medium">{dependent.name}</p>
                    {!hideGuestDetails ? (
                      <p className="text-muted-foreground">
                        {formatDocumentLine(
                          {
                            documentNumber: dependent.documentNumber,
                            documentType: dependent.documentType,
                          },
                          locale,
                        )}
                        {dependent.gender ? ` · ${formatGender(dependent.gender, locale)}` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        {price ? (
          <section className="space-y-1 text-sm">
            <p>
              <span className="text-muted-foreground">{t("common.reservationValue")}: </span>
              <span className="font-code font-semibold">{price}</span>
            </p>
          </section>
        ) : null}

        {reservation.label ? (
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">{t("common.reservationStatus")}</span>
            <Badge className={paymentBadgeClass(reservation, reservation.label)}>
              {reservation.label}
            </Badge>
          </div>
        ) : null}
      </article>

      <div className="rounded-2xl border border-border bg-primary px-5 py-4 text-primary-foreground">
        <p className="font-display text-lg">{t("checkin.success.bannerTitle")}</p>
        <p className="mt-2 text-sm text-primary-foreground/80">{t("checkin.success.bannerBody")}</p>
      </div>

      {whatsapp || phone ? (
        <div className="rounded-2xl border border-border bg-card px-5 py-4 text-sm">
          <p className="text-muted-foreground">{t("checkin.success.helpTitle")}</p>
          <div className="mt-3 flex flex-col gap-2">
            {whatsapp ? (
              <a
                href={`https://wa.me/${String(whatsapp).replace(/\D/g, "")}`}
                className="inline-flex items-center gap-2 font-medium text-success underline"
              >
                <MessageCircle className="size-4" aria-hidden />
                {t("common.whatsapp")}: <PhoneDisplay phone={whatsapp} />
              </a>
            ) : null}
            {phone ? (
              <a
                href={`tel:${String(phone).replace(/\s/g, "")}`}
                className="inline-flex items-center gap-2 font-medium underline"
              >
                <Phone className="size-4" aria-hidden />
                {t("common.phone")}: <PhoneDisplay phone={phone} />
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex gap-3 print:hidden">
        <Button variant="outline" className="tap-safe flex-1" onClick={() => window.print()}>
          <Download className="size-4" aria-hidden /> {t("common.savePdf")}
        </Button>
        <Button className="tap-safe flex-1" onClick={() => void share()}>
          <Share2 className="size-4" aria-hidden /> {t("common.share")}
        </Button>
      </div>
    </div>
  );
}
