import { createFileRoute } from "@tanstack/react-router";
import { StaffAuthPage } from "@/components/auth/StaffAuthPage";

export const Route = createFileRoute("/auth")({
  validateSearch: (search: Record<string, unknown>) => ({
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Acesso da recepção | Check-in Hoteleiro" },
      {
        name: "description",
        content: "Entre com sua conta da equipe para acompanhar os check-ins digitais do hotel.",
      },
    ],
  }),
  component: GenericAuthPage,
});

function GenericAuthPage() {
  const { reason } = Route.useSearch();
  return <StaffAuthPage mode="generic" reason={reason} />;
}
