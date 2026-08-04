import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { termsSectionsToDisplayBlocks, type TermsSection } from "@/lib/establishment-terms";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Props = {
  sections: TermsSection[];
};

export function EstablishmentTermsPanel({ sections }: Props) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const blocks = termsSectionsToDisplayBlocks(sections);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <div
        className={cn(
          "relative",
          expanded
            ? "max-h-[min(65vh,560px)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]"
            : "max-h-36 overflow-hidden",
        )}
        role="region"
        aria-label={t("checkin.terms.title")}
        aria-expanded={expanded}
      >
        <div className="space-y-3 break-words p-5 pr-4 text-sm leading-relaxed text-muted-foreground">
          {blocks.map((block, index) =>
            block.kind === "heading" ? (
              <h3 key={`${block.text}-${index}`} className="font-medium text-foreground">
                {block.text}
              </h3>
            ) : (
              <p key={`${block.text.slice(0, 24)}-${index}`}>{block.text}</p>
            ),
          )}
        </div>

        {!expanded ? (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card via-card/90 to-transparent"
            aria-hidden
          />
        ) : null}
      </div>

      <div className="border-t border-border px-4 py-3">
        <Button
          type="button"
          variant="ghost"
          className="tap-safe w-full gap-2"
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4 shrink-0" aria-hidden />
              {t("checkin.terms.collapse")}
            </>
          ) : (
            <>
              <ChevronDown className="size-4 shrink-0" aria-hidden />
              {t("checkin.terms.expand")}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
