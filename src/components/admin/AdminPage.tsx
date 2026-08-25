import { createContext, useContext, useLayoutEffect, useMemo, useState } from "react";

export type AdminPageConfig = {
  title?: string;
  subtitle?: string;
  breadcrumbs?: { label: string; to?: string }[];
  hidePageHeader?: boolean;
  mobileTitle?: string;
  mobileActions?: React.ReactNode;
};

type AdminPageContextValue = {
  config: AdminPageConfig;
  setConfig: (config: AdminPageConfig) => void;
};

const AdminPageContext = createContext<AdminPageContextValue | null>(null);

export function AdminPageProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AdminPageConfig>({});
  const value = useMemo(() => ({ config, setConfig }), [config]);
  return <AdminPageContext.Provider value={value}>{children}</AdminPageContext.Provider>;
}

export function useAdminPageConfig(): AdminPageConfig {
  const context = useContext(AdminPageContext);
  if (!context) {
    throw new Error("useAdminPageConfig must be used within AdminPageProvider");
  }
  return context.config;
}

export function AdminPage({
  children,
  title,
  subtitle,
  breadcrumbs,
  hidePageHeader,
  mobileTitle,
  mobileActions,
}: AdminPageConfig & { children: React.ReactNode }) {
  const context = useContext(AdminPageContext);
  if (!context) {
    throw new Error("AdminPage must be used within AdminPageProvider");
  }

  const { setConfig } = context;

  useLayoutEffect(() => {
    setConfig({
      title,
      subtitle,
      breadcrumbs,
      hidePageHeader,
      mobileTitle,
      mobileActions,
    });
    return () => setConfig({});
  }, [title, subtitle, breadcrumbs, hidePageHeader, mobileTitle, mobileActions, setConfig]);

  return <>{children}</>;
}
