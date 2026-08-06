import { useEffect } from "react";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { PortalHeroBackground } from "@/components/PortalHeroBackground";
import { useI18n } from "@/lib/i18n/context";

type PortalSplitLayoutProps = {
  topAside: React.ReactNode;
  bottomAside?: React.ReactNode;
  mobileHero: React.ReactNode;
  children: React.ReactNode;
  backgroundImageSrc?: string;
};

export function PortalSplitLayout({
  topAside,
  bottomAside,
  mobileHero,
  children,
  backgroundImageSrc,
}: PortalSplitLayoutProps) {
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

  return (
    <div className="app-container relative min-h-screen lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(min(100%,380px),1fr)] xl:grid-cols-2">
      <PortalHeroBackground className="fixed inset-0 -z-10" imageSrc={backgroundImageSrc} />

      <aside className="relative hidden flex-col justify-between px-10 py-10 text-white lg:flex lg:min-h-screen xl:px-14 xl:py-12">
        <div className="space-y-10">{topAside}</div>
        {bottomAside ? <div className="mt-10">{bottomAside}</div> : null}
      </aside>

      <div className="relative flex min-h-screen flex-col">
        <div className="relative overflow-hidden px-6 py-8 text-white lg:hidden">{mobileHero}</div>

        <div className="absolute right-4 top-4 z-10 lg:right-8 lg:top-8">
          <LanguageSwitcher
            variant="outline"
            size="sm"
            showLabelOnMobile
            className="border-white/20 bg-white/90 text-slate-700 backdrop-blur-sm hover:bg-white lg:border-slate-200"
          />
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-10 lg:py-12 xl:px-12">
          <div className="w-full max-w-[440px] rounded-3xl bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.18)] sm:p-8 lg:max-w-[480px] xl:max-w-[520px]">
            {children}
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
