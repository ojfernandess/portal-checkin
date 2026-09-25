import embraturLists from "@/lib/data/embratur-reference.json";

type EmbraturListItem = { id: number | string; name: string; uf?: string };

const REASONS = [
  { id: 1, name: "Lazer/Férias - Leisure/Vacation" },
  { id: 2, name: "Negócios - Business" },
  { id: 3, name: "Congresso/Feira - Convention/Fair" },
  { id: 4, name: "Parentes/Amigos - Relatives/Friends" },
  { id: 5, name: "Estudos/Cursos - Studies/Courses" },
  { id: 6, name: "Religião - Religion" },
  { id: 7, name: "Saúde - Health" },
  { id: 8, name: "Compras - Shopping" },
  { id: 9, name: "Outro - Other" },
];

const TRANSPORTS = [
  { id: 1, name: "Avião - Plane" },
  { id: 2, name: "Automóvel - Car" },
  { id: 3, name: "Ônibus - Bus" },
  { id: 4, name: "Moto - Motorcycle" },
  { id: 5, name: "Navio/Barco - Ship/Ferry Boat" },
  { id: 6, name: "Trem - Train" },
  { id: 7, name: "Outro - Other" },
];

function toFieldOptions(items: EmbraturListItem[]) {
  return items.map((item) => ({
    id: String(item.id),
    name: item.name,
    value: String(item.id),
    label: item.uf ? `${item.name} (${item.uf})` : item.name,
  }));
}

/** Catálogo Embratur/FNRH nativo do portal (espelha /api/reservations/hub/embratur-reference). */
export function getNativeEmbraturReference(): Record<string, unknown> {
  const data = embraturLists as {
    countries: EmbraturListItem[];
    popularCities: EmbraturListItem[];
    cities: EmbraturListItem[];
  };

  const cities = [...(data.popularCities ?? []), ...(data.cities ?? [])];

  return {
    reasons: REASONS,
    transports: TRANSPORTS,
    countries: data.countries ?? [],
    popularCities: data.popularCities ?? [],
    cities,
    snmotvia: REASONS,
    sntiptran: TRANSPORTS,
    bgstdscpais: data.countries ?? [],
    snidcidadeibge: cities,
  };
}
