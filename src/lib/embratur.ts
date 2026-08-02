import type { EmbraturField } from "./api/types";

function toOptions(raw: unknown): EmbraturField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") return { value: item, label: item };
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const value =
        record["value"] ?? record["id"] ?? record["code"] ?? record["codigo"] ?? record["ibge"];
      const label =
        record["label"] ?? record["name"] ?? record["nome"] ?? record["descricao"] ?? value;
      if (value === undefined || label === undefined) return null;
      return { value: String(value), label: String(label) };
    })
    .filter((item): item is EmbraturField => item !== null);
}

const KEYS = {
  snmotvia: ["reasons", "snmotvia", "motivos", "motivoViagem", "travelReasons", "motivos_viagem"],
  sntiptran: ["transports", "sntiptran", "transportes", "meioTransporte", "meio_transporte"],
  countries: ["countries", "paises", "bgstdscpais", "pais"],
  cities: ["cities", "popularCities", "cidades", "snidcidadeibge", "municipios"],
};

export function normalizeEmbratur(payload: unknown) {
  const source = (payload ?? {}) as Record<string, unknown>;
  const pick = (candidates: string[]) => {
    for (const key of candidates) {
      const options = toOptions(source[key]);
      if (options.length) return options;
    }
    return [];
  };
  return {
    snmotvia: pick(KEYS.snmotvia),
    sntiptran: pick(KEYS.sntiptran),
    countries: pick(KEYS.countries),
    cities: pick(KEYS.cities),
  };
}
