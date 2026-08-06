import type { LucideIcon } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";

type Feature = {
  icon: LucideIcon;
  titleKey: string;
  descKey: string;
};

export function PortalFeatureGrid({ features }: { features: readonly Feature[] }) {
  const { t } = useI18n();

  return (
    <div className="rounded-2xl border border-white/10 bg-black/35 px-3 py-4 backdrop-blur-md xl:px-4">
      <ul className="responsive-grid-sm cq-grid-4">
        {features.map(({ icon: Icon, titleKey, descKey }) => (
          <li key={titleKey} className="flex min-w-0 items-start gap-2.5 px-1 py-1">
            <Icon className="mt-0.5 size-5 shrink-0 text-[#6CA0FF]" strokeWidth={1.75} aria-hidden />
            <div className="min-w-0">
              <p className="text-xs font-semibold leading-snug text-white xl:text-sm">{t(titleKey)}</p>
              <p className="mt-0.5 text-[10px] leading-snug text-white/65 xl:text-xs">{t(descKey)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
