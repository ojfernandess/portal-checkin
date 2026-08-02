import { createFileRoute } from "@tanstack/react-router";

import { CheckinPortal } from "@/components/checkin/CheckinPortal";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Web Check-in | TecHospitality" },
      {
        name: "description",
        content:
          "Faça seu check-in online em poucos minutos: informe o localizador da reserva, envie seus documentos e receba a confirmação da hospedagem.",
      },
      { property: "og:title", content: "Web Check-in Hoteleiro | TecHospitality" },
      {
        property: "og:description",
        content: "Check-in digital rápido e seguro para hóspedes: localizador, documentos e ficha FNRH.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: HomeCheckinPage,
});

function HomeCheckinPage() {
  return <CheckinPortal />;
}
