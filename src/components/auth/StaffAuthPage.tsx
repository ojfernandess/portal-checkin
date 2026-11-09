import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  BadgeCheck,
  ClipboardList,
  LayoutDashboard,
  Loader2,
  Lock,
  ShieldCheck,
  Users,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { TenantPanelBrand } from "@/components/admin/TenantPanelBrand";
import { PortalFeatureGrid } from "@/components/PortalFeatureGrid";
import { PortalHeroBackground } from "@/components/PortalHeroBackground";
import { PortalSplitLayout } from "@/components/PortalSplitLayout";
import { TurnstileWidget, type TurnstileWidgetRef } from "@/components/TurnstileWidget";
import type { TenantLoginBranding } from "@/lib/api/auth.functions";
import { adminBootstrapStatus, adminMyTenants } from "@/lib/api/admin.functions";
import { authBootstrap, authLogin } from "@/lib/api/auth-session.functions";
import { getTurnstileConfig, verifyAuthTurnstile } from "@/lib/api/turnstile.functions";
import { appAuth, setAuthSession } from "@/lib/auth-client";
import { formatAuthError, redirectAfterLogin } from "@/lib/auth-login";
import {
  sanitizeAuthEmailInput,
  sanitizeAuthFullNameInput,
  sanitizeAuthPasswordInput,
  validateAuthForm,
} from "@/lib/auth-input";
import { useI18n } from "@/lib/i18n/context";
import { clearStoredActiveTenantId } from "@/lib/tenant-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const AUTH_FEATURES = [
  {
    icon: LayoutDashboard,
    titleKey: "auth.featureDashboardTitle",
    descKey: "auth.featureDashboardDesc",
  },
  {
    icon: ClipboardList,
    titleKey: "auth.featureGuestsTitle",
    descKey: "auth.featureGuestsDesc",
  },
  {
    icon: ShieldCheck,
    titleKey: "auth.featureSecureTitle",
    descKey: "auth.featureSecureDesc",
  },
  {
    icon: Users,
    titleKey: "auth.featureTeamTitle",
    descKey: "auth.featureTeamDesc",
  },
] as const;

const TRUST_BADGES = [
  { icon: Lock, labelKey: "checkin.landing.trustSecureProcess" },
  { icon: ShieldCheck, labelKey: "checkin.landing.trustDataProtected" },
  { icon: BadgeCheck, labelKey: "checkin.landing.trustLgpdCompliant" },
] as const;

const AUTH_BACKGROUND = "/bg_login.png";
const INPUT_CLASS =
  "tap-safe h-12 rounded-xl border-slate-200 bg-white shadow-sm focus-visible:border-[#1B3A57] focus-visible:ring-[#1B3A57]/20";
const LABEL_CLASS = "text-sm font-semibold text-slate-800";
const BUTTON_CLASS =
  "tap-safe h-12 w-full rounded-xl bg-[#1B3A57] text-base font-semibold text-white shadow-md shadow-[#1B3A57]/25 hover:bg-[#142E47]";

type Props = {
  mode: "generic" | "tenant";
  tenant?: TenantLoginBranding | null;
  tenantLoading?: boolean;
  tenantError?: string | null;
  reason?: string;
};

export function StaffAuthPage({ mode, tenant, tenantLoading = false, tenantError, reason }: Props) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const checkBootstrap = useServerFn(adminBootstrapStatus);
  const loadMyTenants = useServerFn(adminMyTenants);
  const loginFn = useServerFn(authLogin);
  const bootstrapFn = useServerFn(authBootstrap);
  const fetchTurnstileConfig = useServerFn(getTurnstileConfig);
  const verifyTurnstile = useServerFn(verifyAuthTurnstile);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const isTenantMode = mode === "tenant";
  const showBootstrap = !isTenantMode && needsBootstrap === true;
  const companyName = tenant?.name ?? "";

  const handleTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  useEffect(() => {
    if (reason === "no_tenant") {
      setError(t("auth.noTenantAccess"));
    } else if (reason === "access_denied") {
      setError(t("auth.accessDenied"));
    } else if (reason === "wrong_tenant") {
      setError(t("auth.wrongTenant"));
    }
  }, [reason, t]);

  useEffect(() => {
    if (tenantError) {
      setError(tenantError);
    }
  }, [tenantError]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await appAuth.getSession();
      if (!data.session) {
        try {
          const [status, turnstile] = await Promise.all([
            checkBootstrap(),
            fetchTurnstileConfig(),
          ]);
          if (active) {
            setNeedsBootstrap(status.needsBootstrap);
            setTurnstileEnabled(turnstile.enabled);
            setTurnstileSiteKey(turnstile.siteKey ?? null);
          }
        } catch {
          if (active) setNeedsBootstrap(false);
        }
        return;
      }

      try {
        await redirectAfterLogin(navigate, loadMyTenants, {
          tenantSlug: tenant?.slug,
          tenantId: tenant?.id,
        });
      } catch (err) {
        if (!active) return;
        await appAuth.signOut();
        clearStoredActiveTenantId();
        setError(formatAuthError(err, t));
      }
    })();
    return () => {
      active = false;
    };
  }, [checkBootstrap, fetchTurnstileConfig, loadMyTenants, navigate, t, tenant?.id, tenant?.slug]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (isTenantMode && !tenant) {
        throw new Error("NOT_FOUND");
      }

      const validationIssue = validateAuthForm({
        email,
        password,
        fullName,
        needsBootstrap: showBootstrap,
      });
      if (validationIssue) {
        throw new Error(t(`auth.${validationIssue}`));
      }

      const safeEmail = email.trim();
      const safePassword = password;
      const safeFullName = fullName.trim();

      if (turnstileEnabled && !turnstileToken) {
        throw new Error(t("auth.turnstileRequired"));
      }
      if (turnstileEnabled) {
        await verifyTurnstile({ data: { token: turnstileToken ?? undefined } });
      }

      const session = showBootstrap
        ? await bootstrapFn({
            data: { email: safeEmail, password: safePassword, fullName: safeFullName },
          })
        : await loginFn({
            data: { email: safeEmail, password: safePassword },
          });

      setAuthSession({
        accessToken: session.accessToken,
        user: {
          id: session.user.id,
          email: session.user.email,
          fullName: session.user.fullName,
        },
      });

      await redirectAfterLogin(navigate, loadMyTenants, {
        tenantSlug: tenant?.slug,
        tenantId: tenant?.id,
      });
    } catch (err) {
      turnstileRef.current?.reset();
      if (err instanceof Error && ["NO_TENANT", "WRONG_TENANT"].includes(err.message)) {
        await appAuth.signOut();
        clearStoredActiveTenantId();
      }
      setError(formatAuthError(err, t));
    } finally {
      setLoading(false);
    }
  }

  const heroTitle = isTenantMode ? (
    <>
      {t("auth.tenantHeroPrefix")}{" "}
      <span className="text-[#6CA0FF]">{companyName}</span>
    </>
  ) : (
    <>
      {t("auth.heroTitlePrefix")}{" "}
      <span className="text-[#6CA0FF]">{t("auth.heroTitleHighlight")}</span>
    </>
  );

  const formTitle = showBootstrap
    ? t("auth.bootstrapTitle")
    : isTenantMode
      ? t("auth.tenantLoginTitle", { company: companyName })
      : t("auth.loginTitle");

  const formBody = showBootstrap
    ? t("auth.bootstrapBody")
    : isTenantMode
      ? t("auth.tenantLoginBody", { company: companyName })
      : t("auth.loginBody");

  const heroSubtitle = formBody;

  function renderBrand(className?: string) {
    if (isTenantMode && tenant) {
      return (
        <TenantPanelBrand
          tenantName={tenant.name}
          logoUrl={tenant.panelLogoUrl}
          className={className}
        />
      );
    }
    return <BrandLogo variant="white" className={className ?? "max-h-10 xl:max-h-11"} />;
  }

  const heroAside = (
    <>
      {renderBrand("max-h-10 xl:max-h-11")}
      <div className="max-w-lg space-y-5">
        <h1 className="font-display text-4xl font-semibold leading-[1.15] tracking-tight xl:text-[2.75rem]">
          {heroTitle}
        </h1>
        <p className="max-w-md text-base leading-relaxed text-white/85 xl:text-lg">{heroSubtitle}</p>
      </div>
    </>
  );

  if (isTenantMode && tenantLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6f9]">
        <Loader2 className="size-8 animate-spin text-[#1B3A57]" aria-hidden />
      </div>
    );
  }

  if (isTenantMode && !tenant) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6f9] px-4">
        <div className="max-w-md space-y-3 text-center">
          <h1 className="font-display text-2xl font-semibold text-slate-900">{t("auth.tenantNotFoundTitle")}</h1>
          <p className="text-sm text-slate-500">{error ?? t("auth.tenantNotFoundBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <PortalSplitLayout
      backgroundImageSrc={AUTH_BACKGROUND}
      topAside={heroAside}
      bottomAside={<PortalFeatureGrid features={AUTH_FEATURES} />}
      mobileHero={
        <>
          <PortalHeroBackground imageSrc={AUTH_BACKGROUND} />
          <div className="relative space-y-4">
            {renderBrand("max-h-9")}
            <h1 className="font-display text-2xl font-semibold leading-tight">{heroTitle}</h1>
            <p className="text-sm text-white/85">{heroSubtitle}</p>
          </div>
        </>
      }
    >
      <div className="mb-6 flex justify-center">
        {isTenantMode && tenant ? (
          <div className="rounded-xl bg-[#1B3A57] px-6 py-4">
            <TenantPanelBrand tenantName={tenant.name} logoUrl={tenant.panelLogoUrl} />
          </div>
        ) : (
          <BrandLogo className="max-h-12" />
        )}
      </div>

      <header className="space-y-2 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900">{formTitle}</h2>
        <p className="text-sm text-slate-500">{formBody}</p>
      </header>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {showBootstrap ? (
          <div className="space-y-2">
            <Label htmlFor="full-name" className={LABEL_CLASS}>
              {t("auth.fullName")}
            </Label>
            <Input
              id="full-name"
              value={fullName}
              onChange={(e) => setFullName(sanitizeAuthFullNameInput(e.target.value))}
              placeholder={t("auth.fullNamePlaceholder")}
              autoComplete="name"
              maxLength={120}
              className={INPUT_CLASS}
            />
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="email" className={LABEL_CLASS}>
            {t("auth.email")}
          </Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(sanitizeAuthEmailInput(e.target.value))}
            placeholder={t("auth.emailPlaceholder")}
            autoComplete="email"
            maxLength={254}
            spellCheck={false}
            className={INPUT_CLASS}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password" className={LABEL_CLASS}>
            {t("auth.password")}
          </Label>
          <Input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(sanitizeAuthPasswordInput(e.target.value))}
            placeholder={t("auth.passwordPlaceholder")}
            autoComplete={showBootstrap ? "new-password" : "current-password"}
            maxLength={128}
            className={INPUT_CLASS}
          />
        </div>

        {turnstileEnabled && turnstileSiteKey ? (
          <div className="flex justify-center">
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              onToken={handleTurnstileToken}
            />
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button
          type="submit"
          className={BUTTON_CLASS}
          disabled={
            loading ||
            !email ||
            password.length < 8 ||
            (showBootstrap && !fullName) ||
            (turnstileEnabled && !turnstileToken)
          }
        >
          {loading ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : showBootstrap ? (
            t("auth.createAdmin")
          ) : (
            t("auth.signIn")
          )}
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-100 pt-5">
        {TRUST_BADGES.map(({ icon: Icon, labelKey }) => (
          <span
            key={labelKey}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"
          >
            <Icon className="size-3.5 shrink-0 text-[#1B3A57]" aria-hidden />
            {t(labelKey)}
          </span>
        ))}
      </div>
    </PortalSplitLayout>
  );
}
