import { TERMS_TEXT } from "@/lib/terms";

export type TermsSectionId = "termsOfUse" | "privacyPolicy";

export type TermsSection = {
  id: TermsSectionId;
  title: string;
  paragraphs: string[];
};

export type StructuredTermsContent = {
  sections: TermsSection[];
};

export const DEFAULT_TERMS_SECTIONS: TermsSection[] = [
  {
    id: "termsOfUse",
    title: "Termos de uso",
    paragraphs: TERMS_TEXT.slice(0, 8),
  },
  {
    id: "privacyPolicy",
    title: "Política de privacidade (LGPD)",
    paragraphs: TERMS_TEXT.slice(8),
  },
];

export function cloneDefaultSections(): TermsSection[] {
  return DEFAULT_TERMS_SECTIONS.map((section) => ({
    ...section,
    paragraphs: [...section.paragraphs],
  }));
}

function isStructuredContent(value: unknown): value is StructuredTermsContent {
  return (
    typeof value === "object" &&
    value !== null &&
    "sections" in value &&
    Array.isArray((value as StructuredTermsContent).sections)
  );
}

function normalizeSectionId(id: unknown): TermsSectionId {
  return id === "privacyPolicy" ? "privacyPolicy" : "termsOfUse";
}

export function parseTermsContent(raw: unknown): { sections: TermsSection[]; isStructured: boolean } {
  if (isStructuredContent(raw) && raw.sections.length > 0) {
    const sections = raw.sections
      .map((section) => ({
        id: normalizeSectionId(section.id),
        title: String(section.title ?? "").trim() || "Termos",
        paragraphs: Array.isArray(section.paragraphs)
          ? section.paragraphs.map((p) => String(p).trim()).filter(Boolean)
          : [],
      }))
      .filter((section) => section.paragraphs.length > 0);

    if (sections.length > 0) {
      return { sections, isStructured: true };
    }
  }

  if (Array.isArray(raw) && raw.length > 0) {
    const paragraphs = raw.map((p) => String(p).trim()).filter(Boolean);
    return {
      sections: [{ id: "termsOfUse", title: "Termos e políticas", paragraphs }],
      isStructured: false,
    };
  }

  if (typeof raw === "string" && raw.trim()) {
    return {
      sections: [{ id: "termsOfUse", title: "Termos e políticas", paragraphs: [raw.trim()] }],
      isStructured: false,
    };
  }

  return { sections: cloneDefaultSections(), isStructured: false };
}

export type TermsDisplayBlock =
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string };

export function termsSectionsToDisplayBlocks(sections: TermsSection[]): TermsDisplayBlock[] {
  return sections.flatMap((section) => [
    { kind: "heading" as const, text: section.title },
    ...section.paragraphs.map((text) => ({ kind: "paragraph" as const, text })),
  ]);
}

export function flattenTermsSections(sections: TermsSection[]): string[] {
  return sections.flatMap((section) => [section.title, ...section.paragraphs]);
}

export function validateTermsSections(sections: TermsSection[]): string | null {
  if (sections.length === 0) return "Informe ao menos uma seção de termos.";

  for (const section of sections) {
    if (!section.title.trim()) return "Cada seção precisa de um título.";
    if (section.paragraphs.filter((paragraph) => paragraph.trim()).length === 0) {
      return `A seção "${section.title}" precisa de ao menos um parágrafo.`;
    }
  }

  return null;
}

export function normalizeSectionsForSave(sections: TermsSection[]): StructuredTermsContent {
  return {
    sections: sections.map((section) => ({
      id: section.id,
      title: section.title.trim(),
      paragraphs: section.paragraphs.map((paragraph) => paragraph.trim()).filter(Boolean),
    })),
  };
}

function isLikelySectionTitle(block: string): boolean {
  if (block.includes("\n")) return false;
  if (block.length > 120) return false;
  if (/^\d+\.\s/.test(block)) return false;
  return !block.endsWith(".") || block.length < 60;
}

/** Converte seções em texto único para edição livre (títulos separados por linha em branco). */
export function sectionsToFullText(sections: TermsSection[]): string {
  return sections
    .map((section) => [section.title.trim(), ...section.paragraphs.map((p) => p.trim())].join("\n\n"))
    .join("\n\n")
    .trim();
}

/** Interpreta texto completo: títulos curtos iniciam seções; demais blocos viram parágrafos. */
export function fullTextToSections(text: string): TermsSection[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [{ id: "termsOfUse", title: "Termos e políticas", paragraphs: [""] }];
  }

  const blocks = trimmed.split(/\n\n+/).map((block) => block.trim()).filter(Boolean);
  const sections: TermsSection[] = [];
  let currentTitle = "Termos e políticas";
  let currentParagraphs: string[] = [];

  function pushSection() {
    if (currentParagraphs.length === 0) return;
    sections.push({
      id: sections.length === 0 ? "termsOfUse" : "privacyPolicy",
      title: currentTitle,
      paragraphs: [...currentParagraphs],
    });
    currentParagraphs = [];
  }

  for (const block of blocks) {
    if (isLikelySectionTitle(block) && (sections.length > 0 || currentParagraphs.length > 0)) {
      pushSection();
      currentTitle = block;
      continue;
    }

    if (isLikelySectionTitle(block) && sections.length === 0 && currentParagraphs.length === 0) {
      currentTitle = block;
      continue;
    }

    currentParagraphs.push(block);
  }

  pushSection();

  if (sections.length === 0) {
    return [{ id: "termsOfUse", title: "Termos e políticas", paragraphs: blocks }];
  }

  return sections;
}

export function validateFullText(text: string): string | null {
  const sections = fullTextToSections(text);
  return validateTermsSections(sections);
}
