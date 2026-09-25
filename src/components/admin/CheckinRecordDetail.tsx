import { CheckinRecordFnrhSection } from "@/components/admin/CheckinRecordFnrhSection";
import { CheckinRecordStatusBadges } from "@/components/admin/CheckinRecordStatusBadges";
import { PhoneDisplay } from "@/components/checkin/PhoneDisplay";
import { formatDateTime, formatDateWithTime } from "@/lib/format-dates";
import {
  formatBirthDate,
  formatDocumentLine,
  formatGender,
  formatGuestAddress,
} from "@/lib/guest-display";
import { useI18n } from "@/lib/i18n/context";
import type { Locale } from "@/lib/i18n/types";
import type { Dependent } from "@/lib/api/types";
import type { CheckinRecordRow } from "@/lib/checkin-records";
import {
  filterNamedCheckinDependents,
} from "@/lib/checkin-records";

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

function CompanionGuestFields({
  dependent,
  locale,
  documentDisplayOptions,
}: {
  dependent: Dependent;
  locale: Locale;
  documentDisplayOptions?: { pmsProvider: "vb" | "vivakey" };
}) {
  const { t } = useI18n();
  const showRg = dependent.documentType?.trim().toUpperCase() !== "PASSPORT";

  return (
    <dl className="grid grid-cols-2 gap-3">
      <Field label={t("common.email")} value={dependent.email} />
      <Field
        label={t("common.phone")}
        value={
          dependent.mobilePhoneNumber ? (
            <PhoneDisplay phone={String(dependent.mobilePhoneNumber)} />
          ) : undefined
        }
      />
      <Field
        label={t("common.document")}
        value={formatDocumentLine(
          {
            documentNumber: dependent.documentNumber,
            documentType: dependent.documentType,
          },
          locale,
          documentDisplayOptions,
        )}
      />
      {showRg ? (
        <>
          <Field label={t("guest.rg")} value={dependent.rg} />
          <Field label={t("guest.issuingAgency")} value={dependent.expeditor} />
        </>
      ) : null}
      <Field label={t("common.birthDate")} value={formatBirthDate(dependent.birthDate, locale)} />
      <Field label={t("common.gender")} value={formatGender(dependent.gender, locale)} />
      <Field label={t("common.profession")} value={dependent.profession} />
      <Field label={t("common.nationality")} value={dependent.citizenship} />
      <div className="col-span-2">
        <Field label={t("common.address")} value={formatGuestAddress(dependent)} />
      </div>
    </dl>
  );
}

export function CheckinRecordDetail({ record }: { record: CheckinRecordRow }) {
  const { locale, t } = useI18n();
  const guest = record.main_guest;
  const snapshot = record.reservation_snapshot;
  const stay = snapshot?.stay ?? snapshot;
  const companions = filterNamedCheckinDependents(record.dependents);
  const documentDisplayOptions = snapshot?.pmsProvider
    ? { pmsProvider: snapshot.pmsProvider }
    : undefined;

  const unitName = snapshot?.unitName ?? snapshot?.roomName ?? snapshot?.room?.unitName;
  const categoryName = snapshot?.categoryName ?? snapshot?.room?.categoryName;

  return (
    <div className="space-y-5 text-sm">
      <section className="space-y-2">
        <CheckinRecordStatusBadges record={record} layout="detail" />
        {record.terms_version ? (
          <span className="text-xs text-muted-foreground">
            {t("common.version")} {record.terms_version}
          </span>
        ) : null}
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
          <Field
            label={t("common.document")}
            value={formatDocumentLine(guest, locale, documentDisplayOptions)}
          />
          <Field label={t("common.birthDate")} value={formatBirthDate(guest.birthDate, locale)} />
          <Field label={t("common.gender")} value={formatGender(guest.gender, locale)} />
          <Field label={t("common.profession")} value={guest.profession} />
          <Field label={t("common.nationality")} value={guest.citizenship} />
          <div className="col-span-2">
            <Field label={t("common.address")} value={formatGuestAddress(guest)} />
          </div>
        </dl>
      </section>

      {companions.length > 0 ? (
        <section className="space-y-3">
          <h3 className="font-semibold">{t("common.companions")}</h3>
          <div className="space-y-3">
            {companions.map((dependent, index) => (
              <article
                key={`${dependent.documentNumber || dependent.name}-${index}`}
                className="space-y-3 rounded-lg border border-border p-3"
              >
                <h4 className="font-medium">{dependent.name}</h4>
                <CompanionGuestFields
                  dependent={dependent}
                  locale={locale}
                  documentDisplayOptions={documentDisplayOptions}
                />
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <CheckinRecordFnrhSection form={record.embratur} />

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
