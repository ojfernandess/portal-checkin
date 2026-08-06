import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n/context";
import { LOCALE_STORAGE_KEY, type Locale } from "@/lib/i18n/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const OPTIONS: { locale: Locale; labelKey: string }[] = [
  { locale: "pt-BR", labelKey: "language.ptBR" },
  { locale: "en", labelKey: "language.en" },
  { locale: "es", labelKey: "language.es" },
];

type LanguageSwitcherProps = {
  className?: string;
  variant?: "default" | "ghost" | "outline" | "secondary";
  size?: "default" | "sm" | "icon";
  /** Exibe texto ao lado do ícone no mobile (fluxo do hóspede). */
  showLabelOnMobile?: boolean;
};

function localeLabelKey(locale: Locale): string {
  return locale === "pt-BR" ? "language.ptBR" : `language.${locale}`;
}

export function LanguageSwitcher({
  className,
  variant = "ghost",
  size = "sm",
  showLabelOnMobile = false,
}: LanguageSwitcherProps) {
  const { locale, setLocale, t } = useI18n();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant={variant}
          size={size}
          className={cn(showLabelOnMobile && "gap-1.5", className)}
          aria-label={t("language.label")}
        >
          <Languages className="size-4 shrink-0" aria-hidden />
          {showLabelOnMobile ? (
            <>
              <span className="text-xs font-medium sm:hidden">{t("language.label")}</span>
              <span className="hidden text-xs font-medium sm:inline">{t(localeLabelKey(locale))}</span>
            </>
          ) : (
            <>
              <span className="sr-only">{t("language.label")}</span>
              <span className="hidden sm:inline">{t(localeLabelKey(locale))}</span>
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.locale}
            onClick={() => setLocale(option.locale)}
            className={locale === option.locale ? "font-medium" : undefined}
          >
            {t(option.labelKey)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export { LOCALE_STORAGE_KEY };
