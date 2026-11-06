/** UFs brasileiras válidas. */
export const BRAZIL_STATE_UFS = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
] as const;

const BRAZIL_UF_SET = new Set<string>(BRAZIL_STATE_UFS);

/** Nomes por extenso → UF (para detectar preenchimento incorreto). */
const BRAZIL_STATE_NAME_TO_UF: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amapá: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  ceará: "CE",
  "distrito federal": "DF",
  espirito: "ES",
  "espirito santo": "ES",
  "espírito santo": "ES",
  goias: "GO",
  goiás: "GO",
  maranhao: "MA",
  maranhão: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  pará: "PA",
  paraiba: "PB",
  paraíba: "PB",
  parana: "PR",
  paraná: "PR",
  pernambuco: "PE",
  piaui: "PI",
  piauí: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  rondônia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  "são paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

export type StateValidationReason = "missing" | "use_abbrev" | "invalid_uf";

export type StateValidationResult =
  | { ok: true; normalized: string }
  | { ok: false; reason: StateValidationReason };

function normalizeLookupKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function looksLikeFullStateName(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/\s/.test(trimmed)) return true;
  if (trimmed.length > 5) return true;
  if (/[^A-Za-zÀ-ÿ]/.test(trimmed) && !/^[A-Za-z]{2}$/.test(trimmed)) return true;
  return false;
}

/** Valida Estado/UF (BR) ou sigla de estado/província (estrangeiro). */
export function validateGuestState(
  value: string | undefined | null,
  options: { foreign?: boolean } = {},
): StateValidationResult {
  const raw = String(value ?? "").trim();
  if (!raw) return { ok: false, reason: "missing" };

  const foreign = options.foreign === true;

  if (!foreign) {
    const upper = raw.toUpperCase();
    if (BRAZIL_UF_SET.has(upper) && /^[A-Z]{2}$/.test(upper)) {
      return { ok: true, normalized: upper };
    }

    const mapped = BRAZIL_STATE_NAME_TO_UF[normalizeLookupKey(raw)];
    if (mapped || looksLikeFullStateName(raw) || raw.length !== 2) {
      return { ok: false, reason: "use_abbrev" };
    }

    return { ok: false, reason: "invalid_uf" };
  }

  // Estrangeiro: apenas sigla curta (ex.: CA, NY, ON, TX) — sem nome por extenso.
  const compact = raw.replace(/\s+/g, "");
  if (looksLikeFullStateName(raw) || compact.length > 5) {
    return { ok: false, reason: "use_abbrev" };
  }
  if (!/^[A-Za-z]{2,5}$/.test(compact)) {
    return { ok: false, reason: "use_abbrev" };
  }
  return { ok: true, normalized: compact.toUpperCase() };
}

export function isValidGuestState(
  value: string | undefined | null,
  options: { foreign?: boolean } = {},
): boolean {
  return validateGuestState(value, options).ok;
}
