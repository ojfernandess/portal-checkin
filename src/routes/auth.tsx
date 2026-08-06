import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { PortalFeatureGrid } from "@/components/PortalFeatureGrid";
import { PortalHeroBackground } from "@/components/PortalHeroBackground";
import { PortalSplitLayout } from "@/components/PortalSplitLayout";
import { TurnstileWidget, type TurnstileWidgetRef } from "@/components/TurnstileWidget";
import { supabase } from "@/integrations/supabase/client";
import { adminBootstrapStatus } from "@/lib/api/admin.functions";
import { getTurnstileConfig, verifyAuthTurnstile } from "@/lib/api/turnstile.functions";
import {
  sanitizeAuthEmailInput,
  sanitizeAuthFullNameInput,
  sanitizeAuthPasswordInput,
  validateAuthForm,
} from "@/lib/auth-input";
import { useI18n } from "@/lib/i18n/context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Acesso da recepção | Check-in Hoteleiro" },
      {
        name: "description",
        content: "Entre com sua conta da equipe para acompanhar os check-ins digitais do hotel.",
      },
      { property: "og:title", content: "Acesso da recepção | Check-in Hoteleiro" },
      {
        property: "og:description",
        content: "Entre com sua conta da equipe para acompanhar os check-ins digitais do hotel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

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

function AuthPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const checkBootstrap = useServerFn(adminBootstrapStatus);
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

  const handleTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: "/admin/dashboard", replace: true });
        return;
      }
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
    })();
    return () => {
      active = false;
    };
  }, [checkBootstrap, fetchTurnstileConfig, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const validationIssue = validateAuthForm({
        email,
        password,
        fullName,
        needsBootstrap: needsBootstrap ?? false,
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

      if (needsBootstrap) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: safeEmail,
          password: safePassword,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: safeFullName },
          },
        });
        if (signUpError) throw signUpError;
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: safeEmail,
          password: safePassword,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: safeEmail,
          password: safePassword,
        });
        if (signInError) throw signInError;
      }
      navigate({ to: "/admin/dashboard", replace: true });
    } catch (err) {
      turnstileRef.current?.reset();
      setError(formatAuthError(err, t));
    } finally {
      setLoading(false);
    }
  }

  const heroTitle = (
    <>
      {t("auth.heroTitlePrefix")}{" "}
      <span className="text-[#6CA0FF]">{t("auth.heroTitleHighlight")}</span>
    </>
  );

  const heroAside = (
    <>
      <BrandLogo variant="white" className="max-h-10 xl:max-h-11" />
      <div className="max-w-lg space-y-5">
        <h1 className="font-display text-4xl font-semibold leading-[1.15] tracking-tight xl:text-[2.75rem]">
          {heroTitle}
        </h1>
        <p className="max-w-md text-base leading-relaxed text-white/85 xl:text-lg">
          {needsBootstrap ? t("auth.bootstrapBody") : t("auth.heroSubtitle")}
        </p>
      </div>
    </>
  );

  return (
    <PortalSplitLayout
      backgroundImageSrc={AUTH_BACKGROUND}
      topAside={heroAside}
      bottomAside={<PortalFeatureGrid features={AUTH_FEATURES} />}
      mobileHero={
        <>
          <PortalHeroBackground imageSrc={AUTH_BACKGROUND} />
          <div className="relative space-y-4">
            <BrandLogo variant="white" className="max-h-9" />
            <h1 className="font-display text-2xl font-semibold leading-tight">{heroTitle}</h1>
            <p className="text-sm text-white/85">
              {needsBootstrap ? t("auth.bootstrapBody") : t("auth.heroSubtitle")}
            </p>
          </div>
        </>
      }
    >
      <div className="mb-6 flex justify-center">
        <BrandLogo className="max-h-12" />
      </div>

      <header className="space-y-2 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          {needsBootstrap ? t("auth.bootstrapTitle") : t("auth.loginTitle")}
        </h2>
        <p className="text-sm text-slate-500">
          {needsBootstrap ? t("auth.bootstrapBody") : t("auth.loginBody")}
        </p>
      </header>

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        {needsBootstrap ? (
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
            autoComplete={needsBootstrap ? "new-password" : "current-password"}
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
            (needsBootstrap === true && !fullName) ||
            (turnstileEnabled && !turnstileToken)
          }
        >
          {loading ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : needsBootstrap ? (
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

function formatAuthError(
  err: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (!err || typeof err !== "object") return t("auth.loginFailed");
  const message = "message" in err ? String((err as { message: string }).message) : "";
  const code = "code" in err ? String((err as { code: string }).code) : "";

  if (
    code === "invalid_credentials" ||
    message.toLowerCase().includes("invalid login credentials")
  ) {
    return t("auth.wrongCredentials");
  }
  if (code === "email_not_confirmed" || message.toLowerCase().includes("email not confirmed")) {
    return t("auth.emailNotConfirmed");
  }
  if (message) return message;
  return t("auth.loginFailed");
}
