import { createFileRoute, notFound } from "@tanstack/react-router";

import { CompanionSelfRegisterPage } from "@/components/checkin/CompanionSelfRegisterPage";
import { isValidLocalizerCode } from "@/lib/establishment-address";

export const Route = createFileRoute("/$localizer_/guest")({
  beforeLoad: ({ params }) => {
    if (!isValidLocalizerCode(params.localizer) || params.localizer.toLowerCase() === "guest") {
      throw notFound();
    }
  },
  head: ({ params }) => ({
    meta: [
      { title: `Cadastro de acompanhante ${params.localizer.toUpperCase()} | TecHospitality` },
      {
        name: "description",
        content: `Cadastro do hóspede acompanhante da reserva ${params.localizer.toUpperCase()}.`,
      },
    ],
  }),
  component: CompanionGuestRoute,
});

function CompanionGuestRoute() {
  const { localizer } = Route.useParams();
  return <CompanionSelfRegisterPage localizer={localizer} />;
}
