import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { StaffAuthPage } from "@/components/auth/StaffAuthPage";
import {
  getTenantLoginBranding,
  type TenantLoginBranding,
} from "@/lib/api/auth.functions";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/auth/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    reason: typeof search.reason === "string" ? search.reason : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Login | ${params.slug}` },
      {
        name: "description",
        content: "Entre com sua conta da equipe para acompanhar os check-ins digitais.",
      },
    ],
  }),
  component: TenantAuthPage,
});

function TenantAuthPage() {
  const { slug } = Route.useParams();
  const { reason } = Route.useSearch();
  const { t } = useI18n();
  const loadBranding = useServerFn(getTenantLoginBranding);
  const [tenant, setTenant] = useState<TenantLoginBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    void loadBranding({ data: { slug } })
      .then((result) => {
        if (!active) return;
        setTenant(result);
      })
      .catch(() => {
        if (!active) return;
        setTenant(null);
        setError(t("auth.tenantNotFoundBody"));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadBranding, slug, t]);

  return (
    <StaffAuthPage
      mode="tenant"
      tenant={tenant}
      tenantLoading={loading}
      tenantError={error}
      reason={reason}
    />
  );
}
