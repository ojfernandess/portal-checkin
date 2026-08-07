import { createFileRoute } from "@tanstack/react-router";
import { AdminDashboardView } from "@/components/admin/dashboard/AdminDashboardView";

export const Route = createFileRoute("/_authenticated/admin/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Painel administrativo" }] }),
  component: AdminDashboardView,
});
