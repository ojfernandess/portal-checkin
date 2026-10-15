import { createFileRoute, notFound } from "@tanstack/react-router";

import { CompanionStayAccessPage } from "@/components/checkin/CompanionStayAccessPage";
import { isValidLocalizerCode } from "@/lib/establishment-address";

export const Route = createFileRoute("/$localizer_/guest_/acesso")({
  validateSearch: (search: Record<string, unknown>) => ({
    c: typeof search.c === "string" ? search.c.trim() : "",
  }),
  beforeLoad: ({ params }) => {
    if (!isValidLocalizerCode(params.localizer) || params.localizer.toLowerCase() === "guest") {
      throw notFound();
    }
  },
  head: ({ params }) => ({
    meta: [
      { title: `Acesso do acompanhante ${params.localizer.toUpperCase()} | TecHospitality` },
      {
        name: "description",
        content: `Informações do check-in concluído do acompanhante da reserva ${params.localizer.toUpperCase()}.`,
      },
    ],
  }),
  component: CompanionStayAccessRoute,
});

function CompanionStayAccessRoute() {
  const { localizer } = Route.useParams();
  const { c } = Route.useSearch();
  return <CompanionStayAccessPage localizer={localizer} companionKey={c} />;
}
