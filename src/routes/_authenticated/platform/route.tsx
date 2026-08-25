import { createFileRoute, Outlet, redirect, isRedirect } from "@tanstack/react-router";
import { platformMe } from "@/lib/api/platform.functions";

export const Route = createFileRoute("/_authenticated/platform")({
  beforeLoad: async () => {
    try {
      const platform = await platformMe();
      if (!platform.isPlatformAdmin) {
        throw redirect({ to: "/admin/dashboard" });
      }
      return { platform };
    } catch (error) {
      if (isRedirect(error)) throw error;
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
