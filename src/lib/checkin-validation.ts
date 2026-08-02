import type { Dependent, EmbraturForm, MainGuest } from "@/lib/api/types";
import { isValidPhoneWithDialCode, splitPhoneInput } from "@/lib/phone-display";
import { isValidEmail, onlyDigits } from "@/lib/validators";

export type CheckinStepId =
  | "guest"
  | "companions"
  | "photos"
  | "embratur"
  | "extra"
  | "terms"
  | "search";

export type CheckinFieldKey =
  | "name"
  | "email"
  | "birthDate"
  | "gender"
  | "documentNumber"
  | "documentType"
  | "rg"
  | "expeditor"
  | "mobilePhoneNumber"
  | "profession"
  | "citizenship"
  | "zipCode"
  | "street"
  | "number"
  | "neighborhood"
  | "city"
  | "state"
  | "country"
  | "profilePhoto"
  | "documentPhoto"
  | "snmotvia"
  | "sntiptran"
  | "bgstdscpais"
  | "bgstdscpaisdest"
  | "snidcidadeibge"
  | "snidcidadeibgedest"
  | "terms"
  | "localizer";

export type CheckinIssue = {
  step: CheckinStepId;
  field: CheckinFieldKey;
  companionIndex?: number;
  companionName?: string;
};

export type CheckinErrorLabels = {
  steps: Record<CheckinStepId, string>;
  fields: Record<CheckinFieldKey, string>;
  intro: string;
  stepLine: string;
  companionLine: string;
  apiGeneric: string;
  apiReviewGuest: string;
  apiReviewCompanions: string;
};

function normalizeDoc(value: string, documentType: string): string {
  if (documentType === "CPF" || documentType === "RG") return onlyDigits(value);
  return value.trim().replace(/\s+/g, "").toUpperCase();
}

function isValidGuestPhone(value: string | undefined | null, foreign = false): boolean {
  if (!value?.trim()) return false;
  const parts = splitPhoneInput(value, foreign ? "1" : "55");
  return isValidPhoneWithDialCode(parts.callingCode, parts.nationalDigits);
}

function pushIfMissing(
  issues: CheckinIssue[],
  step: CheckinStepId,
  field: CheckinFieldKey,
  value: string | undefined | null,
  extra?: Pick<CheckinIssue, "companionIndex" | "companionName">,
) {
  if (!value?.trim()) issues.push({ step, field, ...extra });
}

export function validateMainGuest(
  guest: MainGuest,
  options: { foreign?: boolean } = {},
): CheckinIssue[] {
  const foreign = options.foreign ?? guest.documentType === "PASSPORT";
  const documentType = String(guest.documentType ?? (foreign ? "PASSPORT" : "CPF"));
  const issues: CheckinIssue[] = [];

  pushIfMissing(issues, "guest", "name", guest.name);
  if (!guest.email?.trim() || !isValidEmail(guest.email)) {
    issues.push({ step: "guest", field: "email" });
  }
  pushIfMissing(issues, "guest", "birthDate", guest.birthDate);
  pushIfMissing(issues, "guest", "gender", guest.gender);
  pushIfMissing(issues, "guest", "documentNumber", guest.documentNumber);
  pushIfMissing(issues, "guest", "citizenship", guest.citizenship);
  pushIfMissing(issues, "guest", "profession", guest.profession);

  if (!foreign) {
    pushIfMissing(issues, "guest", "rg", guest.rg);
    pushIfMissing(issues, "guest", "expeditor", guest.expeditor);
  }
  if (!isValidGuestPhone(guest.mobilePhoneNumber, foreign)) {
    issues.push({ step: "guest", field: "mobilePhoneNumber" });
  }

  pushIfMissing(issues, "guest", "zipCode", guest.zipCode);
  pushIfMissing(issues, "guest", "street", guest.street);
  pushIfMissing(issues, "guest", "number", guest.number);
  pushIfMissing(issues, "guest", "neighborhood", guest.neighborhood);
  pushIfMissing(issues, "guest", "city", guest.city);
  pushIfMissing(issues, "guest", "state", guest.state);
  pushIfMissing(issues, "guest", "country", guest.country);

  if (
    guest.documentNumber?.trim() &&
    (documentType === "CPF" || documentType === "RG") &&
    onlyDigits(guest.documentNumber).length !== 11 &&
    documentType === "CPF"
  ) {
    issues.push({ step: "guest", field: "documentNumber" });
  }

  return issues;
}

export function validateDependent(
  dependent: Dependent,
  index: number,
  mainGuest?: MainGuest,
): CheckinIssue[] {
  const issues: CheckinIssue[] = [];
  const ctx = {
    companionIndex: index,
    companionName: dependent.name?.trim() || `#${index + 1}`,
  };
  const documentType = dependent.documentType ?? "CPF";
  const isPassport = documentType === "PASSPORT";

  pushIfMissing(issues, "companions", "name", dependent.name, ctx);
  if (!dependent.email?.trim() || !isValidEmail(dependent.email)) {
    issues.push({ step: "companions", field: "email", ...ctx });
  }
  pushIfMissing(issues, "companions", "birthDate", dependent.birthDate, ctx);
  pushIfMissing(issues, "companions", "gender", dependent.gender, ctx);
  pushIfMissing(issues, "companions", "documentNumber", dependent.documentNumber, ctx);
  if (!isValidGuestPhone(dependent.mobilePhoneNumber, dependent.documentType === "PASSPORT")) {
    issues.push({ step: "companions", field: "mobilePhoneNumber", ...ctx });
  }
  pushIfMissing(issues, "companions", "citizenship", dependent.citizenship, ctx);
  pushIfMissing(issues, "companions", "profession", dependent.profession, ctx);

  if (!isPassport) {
    pushIfMissing(issues, "companions", "rg", dependent.rg, ctx);
    pushIfMissing(issues, "companions", "expeditor", dependent.expeditor, ctx);
  }

  pushIfMissing(issues, "companions", "zipCode", dependent.zipCode, ctx);
  pushIfMissing(issues, "companions", "street", dependent.street, ctx);
  pushIfMissing(issues, "companions", "number", dependent.number, ctx);
  pushIfMissing(issues, "companions", "neighborhood", dependent.neighborhood, ctx);
  pushIfMissing(issues, "companions", "city", dependent.city, ctx);
  pushIfMissing(issues, "companions", "state", dependent.state, ctx);
  pushIfMissing(issues, "companions", "country", dependent.country, ctx);

  if (mainGuest?.documentNumber?.trim() && dependent.documentNumber?.trim()) {
    const mainType = mainGuest.documentType ?? "CPF";
    const mainDoc = normalizeDoc(mainGuest.documentNumber, mainType);
    const depDoc = normalizeDoc(dependent.documentNumber, documentType);
    if (mainDoc && depDoc && mainDoc === depDoc) {
      issues.push({ step: "companions", field: "documentNumber", ...ctx });
    }
  }

  return issues;
}

export function validateDependents(
  dependents: Dependent[],
  mainGuest?: MainGuest,
): CheckinIssue[] {
  return dependents.flatMap((dependent, index) => validateDependent(dependent, index, mainGuest));
}

export function validateEmbraturForm(form: EmbraturForm): CheckinIssue[] {
  const fields: CheckinFieldKey[] = [
    "snmotvia",
    "sntiptran",
    "bgstdscpais",
    "bgstdscpaisdest",
    "snidcidadeibge",
    "snidcidadeibgedest",
  ];
  return fields.filter((field) => !form[field]?.trim()).map((field) => ({ step: "embratur", field }));
}

export function validatePhotos(profileUrl?: string | null, documentUrl?: string | null): CheckinIssue[] {
  const issues: CheckinIssue[] = [];
  if (!profileUrl?.trim()) issues.push({ step: "photos", field: "profilePhoto" });
  if (!documentUrl?.trim()) issues.push({ step: "photos", field: "documentPhoto" });
  return issues;
}

export function formatCheckinIssues(issues: CheckinIssue[], labels: CheckinErrorLabels): string {
  if (issues.length === 0) return labels.apiGeneric;

  const guestFields = uniqueFields(issues.filter((i) => i.step === "guest" && i.companionIndex == null));
  const companionGroups = groupCompanionIssues(issues);
  const otherSteps = ["photos", "embratur", "extra", "terms", "search"] as const;

  const lines: string[] = [labels.intro];

  if (guestFields.length > 0) {
    lines.push(
      labels.stepLine
        .replace("{step}", labels.steps.guest)
        .replace("{fields}", guestFields.map((f) => labels.fields[f]).join(", ")),
    );
  }

  for (const group of companionGroups) {
    lines.push(
      labels.companionLine
        .replace("{name}", group.name)
        .replace("{fields}", group.fields.map((f) => labels.fields[f]).join(", ")),
    );
  }

  for (const step of otherSteps) {
    const fields = uniqueFields(issues.filter((i) => i.step === step));
    if (fields.length === 0) continue;
    lines.push(
      labels.stepLine
        .replace("{step}", labels.steps[step])
        .replace("{fields}", fields.map((f) => labels.fields[f]).join(", ")),
    );
  }

  return lines.join("\n");
}

function uniqueFields(issues: CheckinIssue[]): CheckinFieldKey[] {
  return [...new Set(issues.map((issue) => issue.field))];
}

function groupCompanionIssues(issues: CheckinIssue[]) {
  const map = new Map<string, { name: string; fields: CheckinFieldKey[] }>();
  for (const issue of issues.filter((i) => i.step === "companions")) {
    const key = String(issue.companionIndex ?? issue.companionName ?? "0");
    const current = map.get(key) ?? {
      name: issue.companionName ?? `#${Number(key) + 1}`,
      fields: [],
    };
    if (!current.fields.includes(issue.field)) current.fields.push(issue.field);
    map.set(key, current);
  }
  return [...map.values()];
}

const API_FIELD_HINTS: Array<{ pattern: RegExp; step: CheckinStepId; field: CheckinFieldKey }> = [
  { pattern: /mainguest.*email|email.*main/i, step: "guest", field: "email" },
  { pattern: /mainguest.*document|documentnumber/i, step: "guest", field: "documentNumber" },
  { pattern: /mainguest.*phone|mobilephone/i, step: "guest", field: "mobilePhoneNumber" },
  { pattern: /mainguest.*birth/i, step: "guest", field: "birthDate" },
  { pattern: /mainguest.*profession/i, step: "guest", field: "profession" },
  { pattern: /mainguest.*zip|cep/i, step: "guest", field: "zipCode" },
  { pattern: /mainguest.*neighborhood|bairro/i, step: "guest", field: "neighborhood" },
  { pattern: /mainguest.*profilephoto|selfie/i, step: "photos", field: "profilePhoto" },
  { pattern: /mainguest.*documentphoto/i, step: "photos", field: "documentPhoto" },
  { pattern: /dependent.*email|dependents.*email/i, step: "companions", field: "email" },
  { pattern: /dependent.*document|dependents.*document/i, step: "companions", field: "documentNumber" },
  { pattern: /dependent.*birth/i, step: "companions", field: "birthDate" },
  { pattern: /dependent.*phone/i, step: "companions", field: "mobilePhoneNumber" },
  { pattern: /dependent.*rg/i, step: "companions", field: "rg" },
  { pattern: /dependent.*expeditor|expedidor/i, step: "companions", field: "expeditor" },
  { pattern: /embratur|snmotvia|sntiptran|ibge/i, step: "embratur", field: "snmotvia" },
];

export function humanizeCheckinApiError(message: string, labels: CheckinErrorLabels): string {
  const raw = message.trim();
  const lower = raw.toLowerCase();

  if (
    lower.includes("failed to perform reservation checkin") ||
    lower.includes("falha ao realizar check-in")
  ) {
    return `${labels.apiGeneric}\n${labels.apiReviewGuest}\n${labels.apiReviewCompanions}`;
  }

  for (const hint of API_FIELD_HINTS) {
    if (hint.pattern.test(raw) || hint.pattern.test(lower)) {
      return labels.stepLine
        .replace("{step}", labels.steps[hint.step])
        .replace("{fields}", labels.fields[hint.field]);
    }
  }

  if (lower.includes("dependent") || lower.includes("acompanhante")) {
    return `${raw}\n${labels.apiReviewCompanions}`;
  }

  if (lower.includes("mainguest") || lower.includes("hóspede") || lower.includes("hospede")) {
    return `${raw}\n${labels.apiReviewGuest}`;
  }

  return raw || labels.apiGeneric;
}
