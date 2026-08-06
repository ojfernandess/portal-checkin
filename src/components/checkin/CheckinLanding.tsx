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
import { PortalFeatureGrid } from "@/components/PortalFeatureGrid";
import { PortalHeroBackground } from "@/components/PortalHeroBackground";
import { PortalSplitLayout } from "@/components/PortalSplitLayout";
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

  const heroTitle = (
    <>
      {t("checkin.landing.heroTitlePrefix")}{" "}
      <span className="text-[#6CA0FF]">{t("checkin.landing.heroTitleHighlight")}</span>
    </>
  );

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
    <PortalSplitLayout
      topAside={
        <>
          <BrandLogo variant="white" className="max-h-10 xl:max-h-11" />
          <div className="max-w-lg space-y-5">
            <h1 className="font-display text-4xl font-semibold leading-[1.15] tracking-tight xl:text-[2.75rem]">
              {heroTitle}
            </h1>
            <p className="max-w-md text-base leading-relaxed text-white/85 xl:text-lg">
              {t("checkin.landing.heroSubtitle")}
            </p>
          </div>
          <ProcessStepper />
        </>
      }
      bottomAside={<PortalFeatureGrid features={FEATURES} />}
      mobileHero={
        <>
          <PortalHeroBackground />
          <div className="relative space-y-4">
            <BrandLogo variant="white" className="max-h-9" />
            <h1 className="font-display text-2xl font-semibold leading-tight">{heroTitle}</h1>
            <p className="text-sm text-white/85">{t("checkin.landing.heroSubtitle")}</p>
            <ProcessStepper />
          </div>
        </>
      }
    >
      {formCard}
    </PortalSplitLayout>
  );
}
