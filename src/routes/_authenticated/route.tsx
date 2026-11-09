import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { authMe } from "@/lib/api/auth-session.functions";
import { appAuth, clearAuthSession } from "@/lib/auth-client";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  staleTime: Infinity,
  beforeLoad: async () => {
    const { data: sessionData } = await appAuth.getSession();
    if (!sessionData.session) {
      clearAuthSession();
      throw redirect({ to: "/auth", search: { reason: undefined } });
    }

    const me = await authMe();
    if (!me.user) {
      clearAuthSession();
      throw redirect({ to: "/auth", search: { reason: undefined } });
    }

    return {
      user: {
        id: me.user.id,
        email: me.user.email,
        user_metadata: { full_name: me.user.fullName },
      },
    };
  },
  component: () => <Outlet />,
});
