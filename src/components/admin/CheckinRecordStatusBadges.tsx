import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  checkinRecordShowsCompanionsBadge,
  countNamedCheckinDependents,
  type CheckinRecordRow,
} from "@/lib/checkin-records";
import { hasEmbraturData } from "@/lib/embratur-display";
import { useI18n } from "@/lib/i18n/context";

type Props = {
  record: CheckinRecordRow;
  layout?: "table" | "detail";
};

export function CheckinRecordStatusBadges({ record, layout = "table" }: Props) {
  const { t } = useI18n();
  const showCompanionsBadge = checkinRecordShowsCompanionsBadge(record);

  if (layout === "detail") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {showCompanionsBadge ? (
          <Badge className="gap-1 border-transparent bg-blue-500/10 text-blue-700 hover:bg-blue-500/10 dark:text-blue-400">
            <UserPlus className="size-3.5 shrink-0" aria-hidden />
            {t("admin.checkinsPage.companionsBadge", {
              count: countNamedCheckinDependents(record.dependents),
            })}
          </Badge>
        ) : null}
        <Badge variant={record.terms_accepted ? "default" : "secondary"}>
          {record.terms_accepted
            ? t("admin.checkinsPage.termsAcceptedBadge")
            : t("admin.checkinsPage.termsMissingBadge")}
        </Badge>
        <Badge variant={hasEmbraturData(record.embratur) ? "default" : "secondary"}>
          {hasEmbraturData(record.embratur)
            ? t("admin.checkinsPage.fnrhFilled")
            : t("admin.checkinsPage.fnrhMissing")}
        </Badge>
      </div>
    );
  }

  if (showCompanionsBadge) {
    const count = countNamedCheckinDependents(record.dependents);
    return (
      <Badge className="gap-1 border-transparent bg-blue-500/10 text-blue-700 hover:bg-blue-500/10 dark:text-blue-400">
        <UserPlus className="size-3.5 shrink-0" aria-hidden />
        {t("admin.checkinsPage.companionsBadge", { count })}
      </Badge>
    );
  }

  return null;
}

export function CheckinRecordCompanionsBadge({ record }: { record: CheckinRecordRow }) {
  const { t } = useI18n();

  if (!checkinRecordShowsCompanionsBadge(record)) {
    return <span className="text-muted-foreground">—</span>;
  }

  const count = countNamedCheckinDependents(record.dependents);
  return (
    <span
      className="inline-flex items-center justify-center text-blue-700 dark:text-blue-400"
      title={t("admin.checkinsPage.companionsBadge", { count })}
    >
      <UserPlus className="size-4 shrink-0" aria-hidden />
      <span className="sr-only">{t("admin.checkinsPage.companionsBadge", { count })}</span>
    </span>
  );
}

export function CheckinRecordTermsBadge({ record }: { record: CheckinRecordRow }) {
  const { t } = useI18n();

  return (
    <Badge variant={record.terms_accepted ? "default" : "secondary"}>
      {record.terms_accepted ? t("common.termsAccepted") : t("common.termsNotAccepted")}
    </Badge>
  );
}

export function CheckinRecordFnrhBadge({ record }: { record: CheckinRecordRow }) {
  const { t } = useI18n();

  return (
    <Badge variant={hasEmbraturData(record.embratur) ? "default" : "secondary"}>
      {hasEmbraturData(record.embratur)
        ? t("admin.checkinsPage.fnrhFilled")
        : t("admin.checkinsPage.fnrhMissing")}
    </Badge>
  );
}
