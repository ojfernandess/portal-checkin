import { useEffect, useState } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  CircleCheck,
  ExternalLink,
  Headset,
  Loader2,
  Lock,
  Mail,
  Phone,
  Search,
  ShieldCheck,
  Tag,
  Users,
  Zap,
} from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { PhoneDisplay } from "@/components/checkin/PhoneDisplay";
import { WhatsAppIcon } from "@/components/icons/WhatsAppIcon";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type CheckinLandingProps = {
  localizer: string;
  loading: boolean;
  onLocalizerChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  children?: React.ReactNode;
};

const STEPS = [
  "checkin.landing.stepLocalizer",
  "checkin.landing.stepData",
  "checkin.landing.stepDocuments",
  "checkin.landing.stepFinished",
] as const;

const FEATURES = [
  {
    icon: Zap,
    titleKey: "checkin.landing.featureOnlineTitle",
    descKey: "checkin.landing.featureOnlineDesc",
  },
  {
    icon: Users,
    titleKey: "checkin.landing.featureNoQueueTitle",
    descKey: "checkin.landing.featureNoQueueDesc",
  },
  {
    icon: ShieldCheck,
    titleKey: "checkin.landing.featureProtectedTitle",
    descKey: "checkin.landing.featureProtectedDesc",
  },
  {
    icon: Headset,
    titleKey: "checkin.landing.featureSupport24hTitle",
    descKey: "checkin.landing.featureSupport24hDesc",
  },
] as const;

const TRUST_BADGES = [
  { icon: Lock, labelKey: "checkin.landing.trustSecureProcess" },
  { icon: ShieldCheck, labelKey: "checkin.landing.trustDataProtected" },
  { icon: BadgeCheck, labelKey: "checkin.landing.trustLgpdCompliant" },
] as const;

const AUDAR_WEBSITE = "https://audaar.com.br/";
const SUPPORT_PHONE = "+55 11 2388-0408";
const SUPPORT_PHONE_TEL = "tel:+551123880408";
const SUPPORT_WHATSAPP = "+55 11 96747-0800";
const SUPPORT_WHATSAPP_LINK = "https://wa.me/5511967470800";
const SUPPORT_EMAIL = "central@audaar.com.br";
const SUPPORT_EMAIL_LINK = "mailto:central@audaar.com.br";

function HeroBackground({ className }: { className?: string }) {
  return (
    <div className={cn("hero-bg-layer absolute inset-0 overflow-hidden", className)} aria-hidden>
      <img
        src="/bg_portal.png"
        alt=""
        className="absolute inset-0 size-full object-cover animate-hero-bg-pan"
        loading="eager"
        decoding="async"
        fetchPriority="high"
      />
      <div className="absolute inset-0 bg-linear-to-r from-slate-950/75 via-slate-900/45 to-slate-900/25" />
      <div className="absolute inset-0 bg-linear-to-t from-slate-950/60 via-transparent to-slate-950/20" />
    </div>
  );
}

const STEP_INTERVAL_MS = 2800;

function ProcessStepper() {
  const { t } = useI18n();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tick = () => {
      if (document.hidden) return;
      setActiveStep((prev) => (prev + 1) % STEPS.length);
    };

    const id = window.setInterval(tick, STEP_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, []);

  return (
    <ol
      className="flex items-start gap-0"
      aria-label={t("checkin.landing.stepperAriaLabel")}
      aria-live="polite"
    >
      {STEPS.map((stepKey, index) => {
        const completed = index < activeStep;
        const active = index === activeStep;
        const isLast = index === STEPS.length - 1;

        return (
          <li key={stepKey} className="flex min-w-0 flex-1 items-start">
            <div className="flex min-w-0 flex-col items-center gap-2">
              <div
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-all duration-500",
                  completed && "bg-[#2B6BF3] text-white",
                  active &&
                    "animate-step-pulse bg-[#2B6BF3] text-white shadow-[0_0_0_4px_rgba(43,107,243,0.25)]",
                  !completed &&
                    !active &&
                    "border-2 border-white/35 bg-transparent text-white/70",
                )}
                aria-current={active ? "step" : undefined}
              >
                {completed ? (
                  <Check className="size-4 animate-step-check" strokeWidth={2.5} aria-hidden />
                ) : (
                  index + 1
                )}
              </div>
              <span
                className={cn(
                  "max-w-[4.5rem] text-center text-[11px] leading-tight transition-colors duration-500 lg:max-w-none lg:text-xs",
                  (active || completed) && "font-medium text-white",
                  !active && !completed && "text-white/55",
                )}
              >
                {t(stepKey)}
              </span>
            </div>
            {!isLast ? (
              <div
                className="relative mx-1 mt-4 h-0.5 min-w-4 flex-1 overflow-hidden rounded-full bg-white/20 xl:mx-2"
                aria-hidden
              >
                <div
                  className={cn(
                    "absolute inset-y-0 left-0 rounded-full bg-[#6CA0FF] transition-[width] duration-700 ease-out",
                    completed ? "w-full" : "w-0",
                  )}
                />
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function CheckinLanding({
  localizer,
  loading,
  onLocalizerChange,
  onSubmit,
  children,
}: CheckinLandingProps) {
  const { t } = useI18n();

  useEffect(() => {
    const syncMotion = () => {
      document.documentElement.classList.toggle("hero-motion-paused", document.hidden);
    };
    syncMotion();
    document.addEventListener("visibilitychange", syncMotion);
    return () => {
      document.removeEventListener("visibilitychange", syncMotion);
      document.documentElement.classList.remove("hero-motion-paused");
    };
  }, []);

  const formCard = children ?? (
    <>
      <div className="mb-6 flex justify-center">
        <BrandLogo className="max-h-12" />
      </div>

      <header className="space-y-2 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          {t("checkin.landing.formTitle")}
        </h2>
        <p className="text-sm text-slate-500">{t("checkin.landing.formSubtitle")}</p>
      </header>

      <form onSubmit={onSubmit} className="mt-6 space-y-5">
        <div className="space-y-2">
          <Label htmlFor="localizer" className="text-sm font-semibold text-slate-800">
            {t("checkin.landing.localizerLabel")}
          </Label>
          <div className="relative">
            <Tag
              className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-slate-400"
              aria-hidden
            />
            <Input
              id="localizer"
              value={localizer}
              onChange={(event) => onLocalizerChange(event.target.value.toUpperCase())}
              placeholder={t("checkin.search.placeholder")}
              autoCapitalize="characters"
              className="tap-safe h-12 rounded-xl border-slate-200 bg-white pl-12 font-code text-base tracking-[0.12em] shadow-sm focus-visible:border-[#2B6BF3] focus-visible:ring-[#2B6BF3]/20"
            />
          </div>
          <p className="text-xs text-slate-500">{t("checkin.landing.localizerHint")}</p>
        </div>

        <Button
          type="submit"
          className="tap-safe h-12 w-full rounded-xl bg-[#2B6BF3] text-base font-semibold shadow-md shadow-[#2B6BF3]/25 hover:bg-[#2563eb]"
          disabled={loading}
        >
          {loading ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <>
              {t("checkin.landing.continueButton")}
              <ArrowRight className="size-5" aria-hidden />
            </>
          )}
        </Button>
      </form>

      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-100 px-4 py-3 text-sm text-slate-600 transition-colors hover:bg-slate-200/80 hover:text-slate-800"
          >
            <Search className="size-4 shrink-0 text-[#2B6BF3]" aria-hidden />
            {t("checkin.landing.localizerHelpLink")}
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("checkin.search.helpTitle")}</DialogTitle>
            <DialogDescription>{t("checkin.search.helpBody")}</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <div className="mt-5 rounded-2xl bg-slate-50 px-4 py-4">
        <p className="text-sm font-semibold text-slate-800">{t("checkin.landing.needHelp")}</p>
        <ul className="mt-3 space-y-2.5">
          <li>
            <a
              href={AUDAR_WEBSITE}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 text-sm text-slate-600 transition-colors hover:text-[#2B6BF3]"
            >
              <ExternalLink className="size-4 shrink-0 text-[#2B6BF3]" aria-hidden />
              audaar.com.br
            </a>
          </li>
          <li>
            <a
              href={SUPPORT_WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2.5 text-sm text-slate-600 transition-colors hover:text-[#2B6BF3]"
              aria-label={t("common.whatsapp")}
            >
              <WhatsAppIcon className="size-4 shrink-0 text-[#25D366]" />
              <PhoneDisplay phone={SUPPORT_WHATSAPP} />
            </a>
          </li>
          <li>
            <a
              href={SUPPORT_PHONE_TEL}
              className="inline-flex items-center gap-2.5 text-sm text-slate-600 transition-colors hover:text-[#2B6BF3]"
            >
              <Phone className="size-4 shrink-0 text-[#2B6BF3]" aria-hidden />
              <PhoneDisplay phone={SUPPORT_PHONE} />
            </a>
          </li>
          <li>
            <a
              href={SUPPORT_EMAIL_LINK}
              className="inline-flex items-center gap-2.5 text-sm text-slate-600 transition-colors hover:text-[#2B6BF3]"
            >
              <Mail className="size-4 shrink-0 text-[#2B6BF3]" aria-hidden />
              {SUPPORT_EMAIL}
            </a>
          </li>
        </ul>
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-slate-100 pt-5">
        {TRUST_BADGES.map(({ icon: Icon, labelKey }) => (
          <span
            key={labelKey}
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-500"
          >
            <Icon className="size-3.5 shrink-0 text-[#2B6BF3]" aria-hidden />
            {t(labelKey)}
          </span>
        ))}
      </div>

      <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-xs font-medium text-[#2B6BF3]">
        <CircleCheck className="size-4 shrink-0" aria-hidden />
        {t("checkin.landing.trustTwoMinutes")}
      </p>
    </>
  );

  return (
    <div className="relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(380px,1fr)] xl:grid-cols-2">
      <HeroBackground className="fixed inset-0 -z-10" />

      <aside className="relative hidden flex-col justify-between px-10 py-10 text-white xl:px-14 xl:py-12 lg:flex lg:min-h-screen">
        <div className="space-y-10">
          <BrandLogo variant="white" className="max-h-10 xl:max-h-11" />

          <div className="max-w-lg space-y-5">
            <h1 className="font-display text-4xl font-semibold leading-[1.15] tracking-tight xl:text-[2.75rem]">
              {t("checkin.landing.heroTitlePrefix")}{" "}
              <span className="text-[#6CA0FF]">{t("checkin.landing.heroTitleHighlight")}</span>
            </h1>
            <p className="max-w-md text-base leading-relaxed text-white/85 xl:text-lg">
              {t("checkin.landing.heroSubtitle")}
            </p>
          </div>

          <ProcessStepper />
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 bg-black/35 px-3 py-4 backdrop-blur-md xl:px-4">
          <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-2">
            {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
              <li key={titleKey} className="flex min-w-0 items-start gap-2.5 px-1 py-1">
                <Icon className="mt-0.5 size-5 shrink-0 text-[#6CA0FF]" strokeWidth={1.75} aria-hidden />
                <div className="min-w-0">
                  <p className="text-xs font-semibold leading-snug text-white xl:text-sm">
                    {t(titleKey)}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-snug text-white/65 xl:text-xs">
                    {t(descKey)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="relative flex min-h-screen flex-col">
        <div className="relative overflow-hidden px-6 py-8 text-white lg:hidden">
          <HeroBackground />
          <div className="relative space-y-4">
            <BrandLogo variant="white" className="max-h-9" />
            <h1 className="font-display text-2xl font-semibold leading-tight">
              {t("checkin.landing.heroTitlePrefix")}{" "}
              <span className="text-[#6CA0FF]">{t("checkin.landing.heroTitleHighlight")}</span>
            </h1>
            <p className="text-sm text-white/85">{t("checkin.landing.heroSubtitle")}</p>
            <ProcessStepper />
          </div>
        </div>

        <div className="absolute right-4 top-4 z-10 lg:right-8 lg:top-8">
          <LanguageSwitcher
            variant="outline"
            size="sm"
            showLabelOnMobile
            className="border-white/20 bg-white/90 text-slate-700 backdrop-blur-sm hover:bg-white lg:border-slate-200"
          />
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-10 lg:py-12 xl:px-12">
          <div className="w-full max-w-[440px] lg:max-w-[480px] xl:max-w-[520px] rounded-3xl bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.18)] sm:p-8">
            {formCard}
          </div>

          <p className="mt-6 text-center text-[10px] text-white/70 lg:text-slate-500">
            {t("checkin.landing.developedBy")}{" "}
            <a
              href="https://www.agentslabs.cloud/"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:underline lg:text-slate-400 lg:hover:text-slate-600"
            >
              AgentsLabs
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
