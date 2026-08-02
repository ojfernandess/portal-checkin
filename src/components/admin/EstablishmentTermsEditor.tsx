import { useEffect, useState } from "react";
import { Eye, FileText, History, Layers, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format-dates";
import {
  cloneDefaultSections,
  fullTextToSections,
  sectionsToFullText,
  type TermsSection,
  termsSectionsToDisplayBlocks,
} from "@/lib/establishment-terms";
import { useI18n } from "@/lib/i18n/context";

export type TermsHistoryEntry = {
  id: string;
  version: number;
  createdAt: string;
  editedBy: string | null;
};

type EstablishmentTermsEditorProps = {
  establishmentName: string;
  sections: TermsSection[];
  version: number;
  isDefault: boolean;
  updatedAt: string | null;
  history: TermsHistoryEntry[];
  saving?: boolean;
  onChange: (sections: TermsSection[]) => void;
  onSave: (sections: TermsSection[]) => Promise<void>;
  onLoadHistory: (historyId: string) => Promise<TermsSection[]>;
};

function validateTermsSectionsI18n(
  sections: TermsSection[],
  t: (key: string, params?: Record<string, string | number>) => string,
): string | null {
  if (sections.length === 0) return t("admin.termsEditor.sectionRequired");

  for (const section of sections) {
    if (!section.title.trim()) return t("admin.termsEditor.sectionTitleRequired");
    if (section.paragraphs.filter((paragraph) => paragraph.trim()).length === 0) {
      return t("admin.termsEditor.sectionParagraphRequired", { title: section.title });
    }
  }

  return null;
}

function TermsPreview({
  establishmentName,
  sections,
}: {
  establishmentName: string;
  sections: TermsSection[];
}) {
  const { t } = useI18n();
  const blocks = termsSectionsToDisplayBlocks(sections);

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h3 className="font-display text-lg">{t("admin.termsEditor.previewTitle")}</h3>
        <p className="text-sm text-muted-foreground">
          {establishmentName || t("common.establishment")}
        </p>
      </header>
      <ScrollArea className="h-72 rounded-2xl border border-border bg-card p-5 shadow-card">
        <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          {blocks.map((block, index) =>
            block.kind === "heading" ? (
              <h4 key={`${block.text}-${index}`} className="font-medium text-foreground">
                {block.text}
              </h4>
            ) : (
              <p key={`${block.text.slice(0, 24)}-${index}`}>{block.text}</p>
            ),
          )}
        </div>
      </ScrollArea>
      <p className="rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        {t("admin.termsEditor.acceptPreview")}
      </p>
    </div>
  );
}

function SectionEditor({
  section,
  onChange,
  onRemove,
  canRemove,
}: {
  section: TermsSection;
  onChange: (section: TermsSection) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const { t } = useI18n();

  function updateParagraph(index: number, value: string) {
    const paragraphs = [...section.paragraphs];
    paragraphs[index] = value;
    onChange({ ...section, paragraphs });
  }

  function addParagraph() {
    onChange({ ...section, paragraphs: [...section.paragraphs, ""] });
  }

  function removeParagraph(index: number) {
    if (section.paragraphs.length <= 1) return;
    onChange({
      ...section,
      paragraphs: section.paragraphs.filter((_, i) => i !== index),
    });
  }

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2">
          <Label htmlFor={`title-${section.id}`}>{t("admin.termsEditor.sectionTitle")}</Label>
          <Input
            id={`title-${section.id}`}
            value={section.title}
            onChange={(event) => onChange({ ...section, title: event.target.value })}
          />
        </div>
        {canRemove ? (
          <Button type="button" variant="ghost" size="icon" className="mt-7 shrink-0" onClick={onRemove}>
            <Trash2 className="size-4 text-destructive" aria-hidden />
            <span className="sr-only">{t("admin.termsEditor.removeSection")}</span>
          </Button>
        ) : null}
      </div>

      <div className="space-y-3">
        <Label>{t("admin.termsEditor.paragraphs")}</Label>
        {section.paragraphs.map((paragraph, index) => (
          <div key={`${section.id}-${index}`} className="flex gap-2">
            <Textarea
              value={paragraph}
              onChange={(event) => updateParagraph(index, event.target.value)}
              rows={3}
              placeholder={t("admin.termsEditor.paragraphN", { n: index + 1 })}
              className="font-sans"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 self-start"
              disabled={section.paragraphs.length <= 1}
              onClick={() => removeParagraph(index)}
            >
              <Trash2 className="size-4" aria-hidden />
              <span className="sr-only">{t("admin.termsEditor.removeParagraph")}</span>
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addParagraph}>
          <Plus className="size-4" aria-hidden /> {t("admin.termsEditor.addParagraph")}
        </Button>
      </div>
    </div>
  );
}

export function EstablishmentTermsEditor({
  establishmentName,
  sections,
  version,
  isDefault,
  updatedAt,
  history,
  saving = false,
  onChange,
  onSave,
  onLoadHistory,
}: EstablishmentTermsEditorProps) {
  const { locale, t } = useI18n();
  const [editMode, setEditMode] = useState<"sections" | "full">("sections");
  const [fullText, setFullText] = useState(() => sectionsToFullText(sections));
  const [loadingHistoryId, setLoadingHistoryId] = useState<string | null>(null);

  useEffect(() => {
    if (editMode === "sections") {
      setFullText(sectionsToFullText(sections));
    }
  }, [sections, editMode]);

  function switchEditMode(mode: "sections" | "full") {
    if (mode === editMode) return;

    if (mode === "full") {
      setFullText(sectionsToFullText(sections));
    } else {
      onChange(fullTextToSections(fullText));
    }

    setEditMode(mode);
  }

  function updateSection(index: number, section: TermsSection) {
    const next = [...sections];
    next[index] = section;
    onChange(next);
  }

  function removeSection(index: number) {
    if (sections.length <= 1) return;
    onChange(sections.filter((_, i) => i !== index));
  }

  async function handleSave() {
    const payload = editMode === "full" ? fullTextToSections(fullText) : sections;
    const error = validateTermsSectionsI18n(payload, t);
    if (error) {
      toast.error(error);
      return;
    }
    if (editMode === "full") {
      onChange(payload);
    }
    await onSave(payload);
  }

  function handleUseDefault() {
    const defaults = cloneDefaultSections();
    onChange(defaults);
    setFullText(sectionsToFullText(defaults));
  }

  function handleFullTextChange(value: string) {
    setFullText(value);
    onChange(fullTextToSections(value));
  }

  async function handleRestoreHistory(entry: TermsHistoryEntry) {
    setLoadingHistoryId(entry.id);
    try {
      const restored = await onLoadHistory(entry.id);
      onChange(restored);
      setFullText(sectionsToFullText(restored));
      setEditMode("sections");
      toast.success(t("admin.termsEditor.restored", { n: entry.version }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.termsEditor.restoreFailed"));
    } finally {
      setLoadingHistoryId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {isDefault ? (
          <Badge variant="secondary">{t("admin.termsEditor.usingDefault")}</Badge>
        ) : (
          <Badge variant="default">{t("admin.termsEditor.customTerms", { version })}</Badge>
        )}
        <span className="text-xs text-muted-foreground">
          {t("common.updatedAt")} {formatDateTime(updatedAt, locale) || "—"}
        </span>
      </div>

      <p className="text-sm text-muted-foreground">{t("admin.termsEditor.body")}</p>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={editMode === "sections" ? "default" : "outline"}
          size="sm"
          onClick={() => switchEditMode("sections")}
        >
          <Layers className="size-4" aria-hidden /> {t("admin.termsEditor.bySections")}
        </Button>
        <Button
          type="button"
          variant={editMode === "full" ? "default" : "outline"}
          size="sm"
          onClick={() => switchEditMode("full")}
        >
          <FileText className="size-4" aria-hidden /> {t("admin.termsEditor.fullText")}
        </Button>
      </div>

      <Tabs defaultValue="edit">
        <TabsList>
          <TabsTrigger value="edit">{t("common.edit")}</TabsTrigger>
          <TabsTrigger value="preview">
            <Eye className="size-4" aria-hidden /> {t("common.preview")}
          </TabsTrigger>
          <TabsTrigger value="history">
            <History className="size-4" aria-hidden /> {t("common.history")}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="edit" className="mt-4 space-y-4">
          {editMode === "sections" ? (
            sections.map((section, index) => (
              <SectionEditor
                key={section.id}
                section={section}
                onChange={(updated) => updateSection(index, updated)}
                onRemove={() => removeSection(index)}
                canRemove={sections.length > 1}
              />
            ))
          ) : (
            <div className="space-y-3 rounded-xl border border-border bg-card p-4">
              <Label htmlFor="terms-full-text">{t("admin.termsEditor.fullTextLabel")}</Label>
              <p className="text-xs text-muted-foreground">{t("admin.termsEditor.fullTextHint")}</p>
              <Textarea
                id="terms-full-text"
                value={fullText}
                onChange={(event) => handleFullTextChange(event.target.value)}
                rows={20}
                className="min-h-80 font-sans leading-relaxed"
                placeholder={"Termos de uso\n\n1. Check-in e check-out...\n\n2. Identificação...\n\nPolítica de privacidade (LGPD)\n\n9. Privacidade e LGPD..."}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={handleUseDefault}>
              <RotateCcw className="size-4" aria-hidden /> {t("admin.termsEditor.useDefault")}
            </Button>
            <Button type="button" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("admin.termsEditor.save")}
            </Button>
          </div>
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <TermsPreview establishmentName={establishmentName} sections={sections} />
        </TabsContent>

        <TabsContent value="history" className="mt-4 space-y-3">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("admin.termsEditor.noHistory")}</p>
          ) : (
            history.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border p-3"
              >
                <div>
                  <p className="font-medium">{t("admin.termsEditor.versionN", { n: entry.version })}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(entry.createdAt, locale)}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loadingHistoryId === entry.id}
                  onClick={() => void handleRestoreHistory(entry)}
                >
                  {loadingHistoryId === entry.id ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : (
                    t("admin.termsEditor.restore")
                  )}
                </Button>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
