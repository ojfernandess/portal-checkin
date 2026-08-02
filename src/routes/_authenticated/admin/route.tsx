import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { adminMe } from "@/lib/api/admin.functions";

const ADMIN_ONLY_PREFIXES = ["/admin/establishments", "/admin/audit", "/admin/users"];

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    try {
      const staff = await adminMe();
      const path = location.pathname;
      const requiresAdmin = ADMIN_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix));
      if (requiresAdmin && staff.role !== "admin") {
        throw redirect({ to: "/admin/dashboard" });
      }
      return { staff };
    } catch (error) {
      if (isRedirect(error)) throw error;
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
