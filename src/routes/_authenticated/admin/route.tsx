import { createFileRoute, redirect, isRedirect } from "@tanstack/react-router";
import { AdminLayout } from "@/components/admin/AdminLayout";
import {
  adminPathRequiresAdmin,
  canAccessAdminPath,
  readAdminRouteStaff,
} from "@/lib/admin-route-guard";

export const Route = createFileRoute("/_authenticated/admin")({
  staleTime: Infinity,
  beforeLoad: ({ location }) => {
    const staff = readAdminRouteStaff();
    const path = location.pathname;

    if (adminPathRequiresAdmin(path) && staff.role && !canAccessAdminPath(path, staff.role, staff.isPlatformAdmin)) {
      throw redirect({ to: "/admin/dashboard" });
    }

    return { staff };
  },
  component: AdminLayout,
});
