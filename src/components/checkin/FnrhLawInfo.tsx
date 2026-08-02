import { CircleHelp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n } from "@/lib/i18n/context";

const LAW_SECTIONS = [
  { titleKey: "checkin.embratur.law.whatTitle", bodyKey: "checkin.embratur.law.whatBody" },
  { titleKey: "checkin.embratur.law.legalTitle", bodyKey: "checkin.embratur.law.legalBody" },
  { titleKey: "checkin.embratur.law.purposeTitle", bodyKey: "checkin.embratur.law.purposeBody" },
  { titleKey: "checkin.embratur.law.dataTitle", bodyKey: "checkin.embratur.law.dataBody" },
  { titleKey: "checkin.embratur.law.sharingTitle", bodyKey: "checkin.embratur.law.sharingBody" },
  { titleKey: "checkin.embratur.law.rightsTitle", bodyKey: "checkin.embratur.law.rightsBody" },
] as const;

type Props = {
  variant?: "icon" | "inline";
};

export function FnrhLawInfo({ variant = "icon" }: Props) {
  const { t } = useI18n();

  return (
    <Dialog>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 rounded-full text-muted-foreground hover:text-foreground"
            aria-label={t("checkin.embratur.lawHelpAria")}
          >
            <CircleHelp className="size-4" strokeWidth={1.75} aria-hidden />
          </Button>
        ) : (
          <Button
            type="button"
            variant="link"
            className="h-auto gap-1.5 p-0 text-xs text-muted-foreground"
          >
            <CircleHelp className="size-3.5" strokeWidth={1.75} aria-hidden />
            {t("checkin.embratur.lawHelpLink")}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogHeader className="space-y-2 border-b border-border px-5 py-4 text-left">
          <DialogTitle className="font-display text-xl">{t("checkin.embratur.lawDialogTitle")}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {t("checkin.embratur.lawDialogIntro")}
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[min(60vh,32rem)] space-y-4 overflow-y-auto px-5 py-4 text-sm leading-relaxed text-muted-foreground">
          {LAW_SECTIONS.map((section) => (
            <section key={section.titleKey} className="space-y-1.5">
              <h3 className="font-medium text-foreground">{t(section.titleKey)}</h3>
              <p>{t(section.bodyKey)}</p>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
