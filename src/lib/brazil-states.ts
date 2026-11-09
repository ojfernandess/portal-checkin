/** Unidades federativas do Brasil (sigla → nome oficial). */
export const BRAZIL_STATE_BY_UF: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

export const BRAZIL_STATE_UFS = Object.keys(BRAZIL_STATE_BY_UF) as string[];

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

function normalizeStateKey(value: string): string {
  return stripDiacritics(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STATE_NAME_TO_UF: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [uf, name] of Object.entries(BRAZIL_STATE_BY_UF)) {
    map[normalizeStateKey(name)] = uf;
    map[normalizeStateKey(`ESTADO DE ${name}`)] = uf;
    map[normalizeStateKey(`ESTADO DO ${name}`)] = uf;
  }
  // Variantes comuns
  map["SAO PAULO"] = "SP";
  map["RIO DE JANEIRO"] = "RJ";
  map["MINAS GERAIS"] = "MG";
  map["RIO GRANDE DO SUL"] = "RS";
  map["RIO GRANDE DO NORTE"] = "RN";
  map["MATO GROSSO"] = "MT";
  map["MATO GROSSO DO SUL"] = "MS";
  map["DISTRITO FEDERAL"] = "DF";
  map["ESPIRITO SANTO"] = "ES";
  map["SANTA CATARINA"] = "SC";
  return map;
})();

/** Indica se o valor de país/cidadania refere-se ao Brasil. */
export function isBrazilCountryValue(value?: string | null): boolean {
  const key = normalizeStateKey(value ?? "");
  return key === "BRASIL" || key === "BRAZIL" || key === "BR" || key === "1058";
}

export function isBrazilStateUf(value?: string | null): boolean {
  const uf = value?.trim().toUpperCase() ?? "";
  return Boolean(uf && BRAZIL_STATE_BY_UF[uf]);
}

/**
 * Converte nome por extenso ou sigla para UF (ex.: "São Paulo" → "SP").
 * Retorna `null` se não reconhecer um estado brasileiro.
 */
export function normalizeBrazilStateUf(value?: string | null): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const asUf = trimmed.toUpperCase();
  if (BRAZIL_STATE_BY_UF[asUf]) return asUf;

  const key = normalizeStateKey(trimmed);
  if (BRAZIL_STATE_BY_UF[key]) return key;
  return STATE_NAME_TO_UF[key] ?? null;
}

/**
 * UF brasileira só é obrigatória quando o país do endereço é Brasil.
 * Não usar cidadania/documento: hóspede BR com endereço no exterior (ou vice-versa) é válido.
 */
export function addressRequiresBrazilStateUf(
  country?: string | null,
  options?: { foreignGuest?: boolean; documentType?: string | null },
): boolean {
  if (isBrazilCountryValue(country)) return true;
  if (country?.trim()) return false;

  // País ainda vazio: assume Brasil só para fluxo nacional (CPF/RG).
  if (options?.foreignGuest === true) return false;
  if (String(options?.documentType ?? "").toUpperCase() === "PASSPORT") return false;
  return true;
}

/**
 * Normaliza o campo Estado do endereço:
 * - endereço no Brasil → UF quando reconhecido; senão mantém o texto para a validação falhar
 * - exterior → texto limpo (sem forçar UF)
 */
export function normalizeGuestStateField(
  state: string | null | undefined,
  country?: string | null,
  options?: { requireBrazilUf?: boolean; foreignGuest?: boolean; documentType?: string | null },
): string {
  const trimmed = state?.trim() ?? "";
  if (!trimmed) return "";

  const forceBrazil =
    options?.requireBrazilUf !== undefined
      ? options.requireBrazilUf
      : addressRequiresBrazilStateUf(country, {
          foreignGuest: options?.foreignGuest,
          documentType: options?.documentType,
        });
  if (!forceBrazil) return trimmed;

  return normalizeBrazilStateUf(trimmed) ?? trimmed;
}
