import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { getEmbraturReference } from "@/lib/api/checkin.functions";
import type { EmbraturForm } from "@/lib/api/types";
import { normalizeEmbratur } from "@/lib/embratur";
import { formatEmbraturForDisplay, hasEmbraturData } from "@/lib/embratur-display";
import { useI18n } from "@/lib/i18n/context";

function Field({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs uppercase text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}

export function CheckinRecordFnrhSection({ form }: { form: EmbraturForm | null }) {
  const { t } = useI18n();
  const loadReference = useServerFn(getEmbraturReference);
  const [fields, setFields] = useState<Array<{ label: string; value: string }> | null>(null);

  useEffect(() => {
    if (!form || !hasEmbraturData(form)) {
      setFields(null);
      return;
    }

    let cancelled = false;

    void loadReference()
      .then((raw) => {
        if (cancelled) return;
        const reference = normalizeEmbratur(raw);
        setFields(formatEmbraturForDisplay(form, reference, (key) => t(key)));
      })
      .catch(() => {
        if (cancelled) return;
        setFields(
          formatEmbraturForDisplay(form, { snmotvia: [], sntiptran: [], countries: [], cities: [] }, (key) =>
            t(key),
          ),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [form, loadReference, t]);

  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{t("checkin.embratur.title")}</h3>
      {!form || !hasEmbraturData(form) ? (
        <p className="text-sm text-muted-foreground">{t("admin.checkinsPage.fnrhEmpty")}</p>
      ) : fields ? (
        <dl className="grid grid-cols-2 gap-3">
          {fields.map((field) => (
            <Field key={field.label} label={field.label} value={field.value} />
          ))}
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      )}
    </section>
  );
}
