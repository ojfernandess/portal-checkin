import { PhoneDisplay } from "@/components/checkin/PhoneDisplay";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatDateWithTime } from "@/lib/format-dates";
import {
  formatBirthDate,
  formatDocumentLine,
  formatGender,
  formatGuestAddress,
} from "@/lib/guest-display";
import { useI18n } from "@/lib/i18n/context";
import type { CheckinRecordRow } from "@/lib/checkin-records";

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

export function CheckinRecordDetail({ record }: { record: CheckinRecordRow }) {
  const { locale, t } = useI18n();
  const guest = record.main_guest;
  const snapshot = record.reservation_snapshot;
  const stay = snapshot?.stay ?? snapshot;

  const unitName = snapshot?.unitName ?? snapshot?.roomName ?? snapshot?.room?.unitName;
  const categoryName = snapshot?.categoryName ?? snapshot?.room?.categoryName;

  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={record.terms_accepted ? "default" : "secondary"}>
            {record.terms_accepted
              ? t("admin.checkinsPage.termsAcceptedBadge")
              : t("admin.checkinsPage.termsMissingBadge")}
          </Badge>
          {record.terms_version ? (
            <span className="text-xs text-muted-foreground">
              {t("common.version")} {record.terms_version}
            </span>
          ) : null}
        </div>
        <p>
          <span className="text-muted-foreground">{t("admin.checkinsPage.checkinAt")} </span>
          <span className="font-medium">{formatDateTime(record.checked_in_at, locale)}</span>
        </p>
        {record.terms_accepted_at ? (
          <p>
            <span className="text-muted-foreground">{t("admin.checkinsPage.termsAcceptedAt")} </span>
            <span className="font-medium">{formatDateTime(record.terms_accepted_at, locale)}</span>
          </p>
        ) : null}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">{t("admin.checkinsPage.reservation")}</h3>
        <dl className="grid grid-cols-2 gap-3">
          <Field label={t("common.localizer")} value={record.localizer} />
          <Field label={t("common.establishment")} value={record.establishment_name} />
          <Field label={t("common.category")} value={categoryName} />
          <Field label={t("common.unit")} value={unitName} />
          <Field label={t("common.number")} value={snapshot?.unitNumber} />
          <Field
            label={t("common.stay")}
            value={formatDateWithTime(
              stay?.checkinDate ?? snapshot?.checkinDate,
              stay?.checkinTime ?? snapshot?.checkinTime,
              locale,
            )}
          />
        </dl>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">{t("common.mainGuest")}</h3>
        <dl className="grid grid-cols-2 gap-3">
          <Field label={t("common.name")} value={guest.name ?? record.guest_name} />
          <Field label={t("common.email")} value={guest.email ?? record.guest_email} />
          <Field
            label={t("common.phone")}
            value={
              guest.mobilePhoneNumber ?? record.guest_phone ? (
                <PhoneDisplay phone={String(guest.mobilePhoneNumber ?? record.guest_phone)} />
              ) : undefined
            }
          />
          <Field label={t("common.document")} value={formatDocumentLine(guest, locale)} />
          <Field label={t("common.birthDate")} value={formatBirthDate(guest.birthDate, locale)} />
          <Field label={t("common.gender")} value={formatGender(guest.gender, locale)} />
          <Field label={t("common.profession")} value={guest.profession} />
          <Field label={t("common.nationality")} value={guest.citizenship} />
          <div className="col-span-2">
            <Field label={t("common.address")} value={formatGuestAddress(guest)} />
          </div>
        </dl>
      </section>

      {record.dependents.length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-semibold">{t("common.companions")}</h3>
          <ul className="space-y-2">
            {record.dependents.map((dependent) => (
              <li key={dependent.documentNumber || dependent.name} className="rounded-lg border border-border p-3">
                <p className="font-medium">{dependent.name}</p>
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
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {record.extra_fields && Object.keys(record.extra_fields).length > 0 ? (
        <section className="space-y-2">
          <h3 className="font-semibold">{t("admin.checkinsPage.extraFields")}</h3>
          <dl className="grid grid-cols-2 gap-3">
            {Object.entries(record.extra_fields).map(([key, value]) => (
              <Field key={key} label={key} value={String(value)} />
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}
