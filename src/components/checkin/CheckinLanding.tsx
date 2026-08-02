import {
  ArrowRight,
  Clock3,
  ExternalLink,
  Hash,
  Headset,
  Heart,
  HelpCircle,
  Loader2,
  Phone,
  ShieldCheck,
  Smartphone,
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

type CheckinLandingProps = {
  localizer: string;
  loading: boolean;
  onLocalizerChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  children?: React.ReactNode;
};

const FEATURES = [
  { icon: Smartphone, titleKey: "checkin.landing.featureDigitalTitle", descKey: "checkin.landing.featureDigitalDesc" },
  { icon: Clock3, titleKey: "checkin.landing.featureFastTitle", descKey: "checkin.landing.featureFastDesc" },
  { icon: ShieldCheck, titleKey: "checkin.landing.featureSecureTitle", descKey: "checkin.landing.featureSecureDesc" },
  { icon: Headset, titleKey: "checkin.landing.featureSupport24hTitle", descKey: "checkin.landing.featureSupport24hDesc" },
  {
    icon: Heart,
    titleKey: "checkin.landing.featureProtectedEstablishmentsTitle",
    descKey: "checkin.landing.featureProtectedEstablishmentsDesc",
  },
] as const;

const AUDAR_WEBSITE = "https://audaar.com.br/";
const SUPPORT_PHONE = "+55 11 2388-0408";
const SUPPORT_PHONE_TEL = "tel:+551123880408";
const SUPPORT_WHATSAPP = "+55 11 96747-0800";
const SUPPORT_WHATSAPP_LINK = "https://wa.me/5511967470800";

export function CheckinLanding({
  localizer,
  loading,
  onLocalizerChange,
  onSubmit,
  children,
}: CheckinLandingProps) {
  const { t } = useI18n();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-2">
      <aside className="relative hidden min-h-[280px] overflow-hidden lg:block lg:min-h-screen">
        <img
          src="https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1600&q=80"
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="eager"
          decoding="async"
        />
        <div className="absolute inset-0 bg-linear-to-br from-primary/90 via-primary/75 to-primary/55" />
        <div className="relative flex h-full flex-col justify-between p-10 text-primary-foreground xl:p-14">
          <div className="space-y-4">
            <h1 className="font-display text-4xl font-medium leading-tight xl:text-5xl">
              {t("checkin.landing.heroTitle")}
            </h1>
            <p className="max-w-md text-base text-primary-foreground/85 xl:text-lg">
              {t("checkin.landing.heroSubtitle")}
            </p>
          </div>

          <ul className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {FEATURES.map(({ icon: Icon, titleKey, descKey }) => (
              <li key={titleKey} className="space-y-2 rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
                <Icon className="size-5 text-accent" aria-hidden />
                <p className="text-xs font-semibold uppercase tracking-wide">{t(titleKey)}</p>
                <p className="text-sm text-primary-foreground/80">{t(descKey)}</p>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="flex min-h-screen flex-col bg-background">
        <div className="relative overflow-hidden bg-primary px-6 py-8 text-primary-foreground lg:hidden">
          <div className="absolute inset-0 bg-linear-to-br from-primary via-primary/90 to-primary/70" />
          <div className="relative space-y-2">
            <h1 className="font-display text-2xl font-medium">{t("checkin.landing.heroTitle")}</h1>
            <p className="text-sm text-primary-foreground/85">{t("checkin.landing.heroSubtitle")}</p>
          </div>
        </div>

        <div className="flex items-center justify-between px-6 pt-6 lg:px-10">
          <p className="text-xs text-muted-foreground">{t("checkin.landing.chooseLanguage")}</p>
          <LanguageSwitcher variant="outline" size="sm" />
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 lg:px-12">
          <div className="w-full max-w-md space-y-8">
            <div className="flex justify-center lg:justify-start">
              <BrandLogo className="max-h-28 sm:max-h-32" />
            </div>

            {children ? (
              children
            ) : (
              <>
                <header className="space-y-2 text-center lg:text-left">
                  <h2 className="font-display text-3xl text-foreground">{t("checkin.landing.formTitle")}</h2>
                  <p className="text-sm text-muted-foreground">{t("checkin.landing.formSubtitle")}</p>
                </header>

                <form onSubmit={onSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label htmlFor="localizer">{t("checkin.landing.localizerLabel")}</Label>
                    <div className="relative">
                      <Hash
                        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
                        aria-hidden
                      />
                      <Input
                        id="localizer"
                        value={localizer}
                        onChange={(event) => onLocalizerChange(event.target.value.toUpperCase())}
                        placeholder={t("checkin.search.placeholder")}
                        autoCapitalize="characters"
                        className="tap-safe h-14 border-primary/30 pl-12 font-code text-lg tracking-[0.15em] focus-visible:border-primary focus-visible:ring-primary/30"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">{t("checkin.landing.localizerHint")}</p>
                  </div>

                  <Button type="submit" className="tap-safe h-14 w-full text-base" disabled={loading}>
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
                    <Button variant="link" className="h-auto w-full text-muted-foreground">
                      <HelpCircle className="size-4" aria-hidden /> {t("checkin.search.helpLink")}
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{t("checkin.search.helpTitle")}</DialogTitle>
                      <DialogDescription>{t("checkin.search.helpBody")}</DialogDescription>
                    </DialogHeader>
                  </DialogContent>
                </Dialog>

                <div className="rounded-xl border border-border bg-muted/30 px-4 py-4 text-center lg:text-left">
                  <p className="text-sm font-medium text-foreground">{t("checkin.landing.needHelp")}</p>
                  <div className="mt-3 flex flex-col items-center gap-2 lg:items-start">
                    <a
                      href={AUDAR_WEBSITE}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground hover:underline"
                    >
                      <ExternalLink className="size-4 shrink-0" aria-hidden />
                      audaar.com.br
                    </a>
                    <a
                      href={SUPPORT_PHONE_TEL}
                      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      <Phone className="size-4 shrink-0" aria-hidden />
                      <PhoneDisplay phone={SUPPORT_PHONE} />
                    </a>
                    <a
                      href={SUPPORT_WHATSAPP_LINK}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                      aria-label={t("common.whatsapp")}
                    >
                      <WhatsAppIcon className="size-4 shrink-0 text-[#25D366]" />
                      <PhoneDisplay phone={SUPPORT_WHATSAPP} />
                    </a>
                  </div>
                </div>
              </>
            )}

            <p className="text-center text-xs leading-relaxed text-muted-foreground lg:text-left">
              {t("checkin.landing.footer")}
            </p>
            <p className="text-center text-[10px] text-muted-foreground/45 lg:text-left">
              {t("checkin.landing.developedBy")}{" "}
              <a
                href="https://www.agentslabs.cloud/"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-muted-foreground/70 hover:underline"
              >
                AgentsLabs
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
