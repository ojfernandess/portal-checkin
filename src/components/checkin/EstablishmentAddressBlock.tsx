import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/context";
import {
  formatEstablishmentAddressLines,
  getGoogleMapsUrl,
} from "@/lib/establishment-address";
import type { Reservation } from "@/lib/api/types";

type Props = {
  reservation: Reservation;
  className?: string;
};

export function EstablishmentAddressBlock({ reservation, className }: Props) {
  const { t } = useI18n();
  const lines = formatEstablishmentAddressLines(reservation);
  const mapsUrl = getGoogleMapsUrl(reservation);
  const displayLines = lines.length > 0 ? lines : [t("common.addressNotProvided")];

  return (
    <div className={className}>
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("common.address")}</p>
      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
        {displayLines.join("\n")}
      </p>
      {mapsUrl ? (
        <Button variant="outline" size="sm" className="mt-3 tap-safe" asChild>
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <MapPin className="size-4" aria-hidden />
            {t("common.openInMaps")}
            <ExternalLink className="size-3.5 opacity-60" aria-hidden />
          </a>
        </Button>
      ) : null}
    </div>
  );
}
