import { createFileRoute, notFound } from "@tanstack/react-router";

import { CheckinPortal } from "@/components/checkin/CheckinPortal";
import { isValidLocalizerCode } from "@/lib/establishment-address";

export const Route = createFileRoute("/$localizer")({
  beforeLoad: ({ params }) => {
    if (!isValidLocalizerCode(params.localizer)) {
      throw notFound();
    }
  },
  head: ({ params }) => ({
    meta: [
      { title: `Check-in ${params.localizer.toUpperCase()} | TecHospitality` },
      {
        name: "description",
        content: `Faça ou consulte o check-in da reserva ${params.localizer.toUpperCase()}.`,
      },
    ],
  }),
  component: LocalizerCheckinPage,
});

function LocalizerCheckinPage() {
  const { localizer } = Route.useParams();
  return <CheckinPortal initialLocalizer={localizer} autoSearch />;
}
