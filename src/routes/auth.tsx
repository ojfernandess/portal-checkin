import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { adminBootstrapStatus } from "@/lib/api/admin.functions";
import { useI18n } from "@/lib/i18n/context";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
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

function AuthPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const checkBootstrap = useServerFn(adminBootstrapStatus);
  const [needsBootstrap, setNeedsBootstrap] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: "/admin/dashboard", replace: true });
        return;
      }
      try {
        const status = await checkBootstrap();
        if (active) setNeedsBootstrap(status.needsBootstrap);
      } catch {
        if (active) setNeedsBootstrap(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [checkBootstrap, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (needsBootstrap) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: fullName },
          },
        });
        if (signUpError) throw signUpError;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
      }
      navigate({ to: "/admin/dashboard", replace: true });
    } catch (err) {
      setError(formatAuthError(err, t));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-8 shadow-sm"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <BrandLogo className="mb-4 max-h-20 sm:max-h-24" />
          <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
            {needsBootstrap ? <ShieldCheck className="size-4" /> : <Lock className="size-4" />}
          </span>
          <h1 className="font-display text-2xl text-foreground">
            {needsBootstrap ? t("auth.bootstrapTitle") : t("auth.loginTitle")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsBootstrap ? t("auth.bootstrapBody") : t("auth.loginBody")}
          </p>
        </div>

        <div className="space-y-4">
          {needsBootstrap ? (
            <div className="space-y-2">
              <Label htmlFor="full-name">{t("auth.fullName")}</Label>
              <Input
                id="full-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder={t("auth.fullNamePlaceholder")}
                autoComplete="name"
              />
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.emailPlaceholder")}
              autoComplete="email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">{t("auth.password")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.passwordPlaceholder")}
              autoComplete={needsBootstrap ? "new-password" : "current-password"}
            />
          </div>
        </div>

        {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}

        <Button
          type="submit"
          className="mt-6 w-full"
          disabled={loading || !email || password.length < 8 || (needsBootstrap === true && !fullName)}
        >
          {loading ? t("common.wait") : needsBootstrap ? t("auth.createAdmin") : t("auth.signIn")}
        </Button>
      </form>
    </main>
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
