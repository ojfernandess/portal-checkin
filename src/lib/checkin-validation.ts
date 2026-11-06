import type { Dependent, EmbraturForm, MainGuest } from "@/lib/api/types";
import { hasGenderSelection } from "@/lib/guest-gender";
import { isValidGuestState } from "@/lib/guest-state";
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
  apiIncompleteMainGuest: string;
  apiIncompleteCompanions: string;
  apiInvalidImageFormat: string;
  apiBadRequest: string;
  apiServerUnavailable: string;
  apiFixAndRetry: string;
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
  if (!hasGenderSelection(guest.gender)) {
    issues.push({ step: "guest", field: "gender" });
  }
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
  if (!isValidGuestState(guest.state, { foreign })) {
    issues.push({ step: "guest", field: "state" });
  }
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
  if (!hasGenderSelection(dependent.gender)) {
    issues.push({ step: "companions", field: "gender", ...ctx });
  }
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
  if (!isValidGuestState(dependent.state, { foreign: isPassport })) {
    issues.push({ step: "companions", field: "state", ...ctx });
  }
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

/** Valida referências de foto já enviadas ao PMS (URL e/ou mediaId). */
export function validatePhotoRefs(
  profileUrl?: string | null,
  documentUrl?: string | null,
  options?: {
    profilePhotoId?: string | number | null;
    documentPhotoId?: string | number | null;
  },
): CheckinIssue[] {
  const issues: CheckinIssue[] = [];
  const hasProfile = Boolean(profileUrl?.trim() || options?.profilePhotoId != null);
  const hasDocument = Boolean(documentUrl?.trim() || options?.documentPhotoId != null);
  if (!hasProfile) issues.push({ step: "photos", field: "profilePhoto" });
  if (!hasDocument) issues.push({ step: "photos", field: "documentPhoto" });
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
  { pattern: /mainguest.*gender/i, step: "guest", field: "gender" },
  { pattern: /mainguest.*profession/i, step: "guest", field: "profession" },
  { pattern: /mainguest.*zip|cep/i, step: "guest", field: "zipCode" },
  { pattern: /mainguest.*neighborhood|bairro/i, step: "guest", field: "neighborhood" },
  { pattern: /mainguest.*\bstate\b|estado|uf\b/i, step: "guest", field: "state" },
  { pattern: /mainguest.*city|cidade/i, step: "guest", field: "city" },
  { pattern: /mainguest.*street|logradouro/i, step: "guest", field: "street" },
  { pattern: /mainguest.*profilephoto|selfie/i, step: "photos", field: "profilePhoto" },
  { pattern: /mainguest.*documentphoto/i, step: "photos", field: "documentPhoto" },
  { pattern: /dependent.*email|dependents.*email/i, step: "companions", field: "email" },
  { pattern: /dependent.*document|dependents.*document/i, step: "companions", field: "documentNumber" },
  { pattern: /dependent.*gender|dependents.*gender/i, step: "companions", field: "gender" },
  { pattern: /dependent.*birth/i, step: "companions", field: "birthDate" },
  { pattern: /dependent.*phone/i, step: "companions", field: "mobilePhoneNumber" },
  { pattern: /dependent.*rg/i, step: "companions", field: "rg" },
  { pattern: /dependent.*expeditor|expedidor/i, step: "companions", field: "expeditor" },
  { pattern: /dependent.*\bstate\b|estado/i, step: "companions", field: "state" },
  { pattern: /embratur|snmotvia|sntiptran|ibge/i, step: "embratur", field: "snmotvia" },
];

const API_FIELD_PATH_ALIASES: Record<string, CheckinFieldKey> = {
  gender: "gender",
  email: "email",
  birthdate: "birthDate",
  mobilephonenumber: "mobilePhoneNumber",
  documentnumber: "documentNumber",
  documenttype: "documentType",
  rg: "rg",
  expeditor: "expeditor",
  profession: "profession",
  citizenship: "citizenship",
  zipcode: "zipCode",
  street: "street",
  number: "number",
  neighborhood: "neighborhood",
  city: "city",
  state: "state",
  country: "country",
  profilephotourl: "profilePhoto",
  documentphotourl: "documentPhoto",
  name: "name",
};

function stripApiErrorCodes(message: string): string {
  return message
    .replace(/\s*\(c[oó]digo:\s*[A-Z0-9_]+\)/gi, "")
    .replace(/\s*\(code:\s*[A-Z0-9_]+\)/gi, "")
    .replace(/\s*—\s*c[oó]digo:\s*[A-Z0-9_]+/gi, "")
    .trim();
}

function mapApiFieldPath(path: string): CheckinFieldKey | null {
  const normalized = path.trim().replace(/\[\d+\]/g, "").split(".").pop()?.toLowerCase() ?? "";
  return API_FIELD_PATH_ALIASES[normalized] ?? null;
}

function parseApiMissingFields(message: string): {
  scope: "guest" | "companions";
  fields: CheckinFieldKey[];
} | null {
  const match = message.match(/campos faltantes:\s*([^(\n]+)/i);
  if (!match) return null;

  const fields = match[1]
    .split(",")
    .map((part) => mapApiFieldPath(part.trim()))
    .filter((field): field is CheckinFieldKey => field != null);

  if (fields.length === 0) return null;

  const lower = message.toLowerCase();
  const scope =
    lower.includes("dependent") || lower.includes("acompanhante") ? "companions" : "guest";

  return { scope, fields: [...new Set(fields)] };
}

function isAlreadyFriendlyGuestMessage(message: string, labels: CheckinErrorLabels): boolean {
  const trimmed = message.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith(labels.intro)) return true;
  if (trimmed.startsWith(labels.apiGeneric)) return true;
  if (trimmed === labels.apiInvalidImageFormat) return true;
  if (trimmed.startsWith(labels.apiBadRequest)) return true;
  if (trimmed.startsWith(labels.apiServerUnavailable)) return true;
  return false;
}

function looksTechnicalOrUnsafe(message: string): boolean {
  return (
    /\b(erro|error|status|http)\s*[45]\d{2}\b/i.test(message) ||
    /\b[45]\d{2}\b/.test(message) ||
    /TECHOSPITALITY|VB_PMS|Vivakey|Vinibarr|X-Auth|IApi-Token|\.env|dev\.vars|vkr_|Bearer|api[_-]?key|stack|exception|TypeError|SyntaxError|ECONNREFUSED|fetch failed|supabase|postgres|internal server|undefined is not|null is not|at\s+\w+\.\w+|Admin\s*→|Slim Application|\$cnpj/i.test(
      message,
    ) ||
    /token inválido|token invalido|invalid token|código:\s*[A-Z0-9_]+|code:\s*[A-Z0-9_]+/i.test(
      message,
    ) ||
    /PMS VB|estabelecimento não identificado para upload/i.test(message)
  );
}

export function humanizeCheckinApiError(message: string, labels: CheckinErrorLabels): string {
  const trimmed = message.trim();
  if (!trimmed) {
    return `${labels.apiGeneric}\n${labels.apiFixAndRetry}`;
  }

  if (isAlreadyFriendlyGuestMessage(trimmed, labels)) {
    return trimmed;
  }

  const lower = trimmed.toLowerCase();

  if (
    /INVALID_IMAGE_FORMAT/i.test(trimmed) ||
    lower.includes("não corresponde ao mime") ||
    lower.includes("nao corresponde ao mime") ||
    lower.includes("does not match the reported mime") ||
    lower.includes("no coincide con el mime")
  ) {
    return labels.apiInvalidImageFormat;
  }

  const raw = stripApiErrorCodes(trimmed);
  const normalized = raw.toLowerCase();

  if (
    /\b(500|502|503|504)\b/.test(normalized) ||
    normalized.includes("internal server") ||
    normalized.includes("temporariamente indispon") ||
    normalized.includes("não foi possível contatar") ||
    normalized.includes("nao foi possivel contatar")
  ) {
    return `${labels.apiServerUnavailable}\n${labels.apiFixAndRetry}`;
  }

  if (/\b(400|422)\b/.test(normalized) || normalized.includes("bad request") || normalized.includes("validation")) {
    return `${labels.apiBadRequest}\n${labels.apiReviewGuest}\n${labels.apiReviewCompanions}`;
  }

  const missing = parseApiMissingFields(raw);
  if (missing) {
    const fieldLabels = missing.fields.map((field) => labels.fields[field]).join(", ");
    if (missing.scope === "companions") {
      return `${labels.apiGeneric}\n${labels.apiIncompleteCompanions.replace("{fields}", fieldLabels)}`;
    }
    return `${labels.apiGeneric}\n${labels.apiIncompleteMainGuest.replace("{fields}", fieldLabels)}`;
  }

  if (
    normalized.includes("main_guest_incomplete") ||
    (normalized.includes("mainguest") && normalized.includes("incompleto"))
  ) {
    return `${labels.apiGeneric}\n${labels.apiReviewGuest}`;
  }

  if (
    normalized.includes("failed to perform reservation checkin") ||
    normalized.includes("falha ao realizar check-in")
  ) {
    return `${labels.apiGeneric}\n${labels.apiReviewGuest}\n${labels.apiReviewCompanions}`;
  }

  for (const hint of API_FIELD_HINTS) {
    if (hint.pattern.test(raw) || hint.pattern.test(normalized)) {
      return `${labels.apiGeneric}\n${labels.stepLine
        .replace("{step}", labels.steps[hint.step])
        .replace("{fields}", labels.fields[hint.field])}\n${labels.apiFixAndRetry}`;
    }
  }

  if (normalized.includes("dependent") || normalized.includes("acompanhante")) {
    return `${labels.apiGeneric}\n${labels.apiReviewCompanions}\n${labels.apiFixAndRetry}`;
  }

  if (normalized.includes("mainguest") || normalized.includes("hóspede") || normalized.includes("hospede")) {
    return `${labels.apiGeneric}\n${labels.apiReviewGuest}\n${labels.apiFixAndRetry}`;
  }

  if (normalized.includes("reserva não encontrada") || normalized.includes("reserva nao encontrada")) {
    return `${labels.apiGeneric}\n${labels.stepLine
      .replace("{step}", labels.steps.search)
      .replace("{fields}", labels.fields.localizer)}`;
  }

  // Nunca expor mensagem crua de API/servidor ao hóspede.
  if (looksTechnicalOrUnsafe(raw) || raw.length > 180) {
    return `${labels.apiGeneric}\n${labels.apiFixAndRetry}`;
  }

  return `${labels.apiGeneric}\n${labels.apiFixAndRetry}`;
}
