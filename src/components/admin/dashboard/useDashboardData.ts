import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  adminDashboardCheckouts,
  adminDashboardCreatedReservations,
  adminDashboardPortalStats,
} from "@/lib/api/admin.functions";
import { useI18n } from "@/lib/i18n/context";
import type { CheckoutsState, CreatedState, PortalStats } from "./types";
import { todayIso } from "./utils";

export function useDashboardData(date: string) {
  const { t } = useI18n();
  const portalFn = useServerFn(adminDashboardPortalStats);
  const checkoutsFn = useServerFn(adminDashboardCheckouts);
  const createdFn = useServerFn(adminDashboardCreatedReservations);

  const [portal, setPortal] = useState<PortalStats | null>(null);
  const [checkouts, setCheckouts] = useState<CheckoutsState>({
    rows: [],
    count: 0,
    totalPrice: 0,
    error: null,
  });
  const [created, setCreated] = useState<CreatedState>({
    rows: [],
    count: 0,
    totalPrice: 0,
    error: null,
  });
  const [loading, setLoading] = useState(true);
  const [portalError, setPortalError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setPortalError(null);
    setCheckouts((prev) => ({ ...prev, error: null }));
    setCreated((prev) => ({ ...prev, error: null }));

    const selectedDate = date || todayIso();

    const portalPromise = portalFn({ data: { date: selectedDate } })
      .then((result) => setPortal(result))
      .catch((err) => {
        setPortal(null);
        setPortalError(err instanceof Error ? err.message : t("admin.dashboardPage.portalError"));
      });

    const checkoutsPromise = checkoutsFn({ data: {} })
      .then((result) => {
        setCheckouts({
          rows: result.data,
          count: result.count,
          totalPrice: result.totalPrice,
          error: null,
        });
      })
      .catch((err) => {
        setCheckouts({
          rows: [],
          count: 0,
          totalPrice: 0,
          error: err instanceof Error ? err.message : t("admin.dashboardPage.checkoutsError"),
        });
      });

    const createdPromise = createdFn({ data: { limit: 100 } })
      .then((result) => {
        setCreated({
          rows: result.data,
          count: result.count,
          totalPrice: result.totalPrice,
          error: null,
        });
      })
      .catch((err) => {
        setCreated({
          rows: [],
          count: 0,
          totalPrice: 0,
          error: err instanceof Error ? err.message : t("admin.dashboardPage.createdError"),
        });
      });

    await Promise.all([portalPromise, checkoutsPromise, createdPromise]);
    setLoading(false);
  }, [checkoutsFn, createdFn, date, portalFn, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return { portal, portalError, checkouts, created, loading, refresh: load };
}
