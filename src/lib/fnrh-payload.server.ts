import type { Dependent, EmbraturForm, MainGuest, Reservation } from "@/lib/api/types";
import type { CheckinRecordRow } from "@/lib/checkin-records";
import { filterNamedCheckinDependents } from "@/lib/checkin-record-status";
import embraturLists from "@/lib/data/embratur-reference.json";
import { GENDER_PREFER_NOT_TO_SAY } from "@/lib/guest-gender";
import type { FnrhHospede, FnrhPayload } from "@/lib/fnrh-payload.types";
import { onlyDigits } from "@/lib/validators";

export type {
  FnrhDadosPessoais,
  FnrhDocumento,
  FnrhHospede,
  FnrhPayload,
} from "@/lib/fnrh-payload.types";

const MOTIVO_VIAGEM_BY_ID: Record<string, string> = {
  "1": "LAZER_FERIAS",
  "2": "NEGOCIOS",
  "3": "CONGRESSO_FEIRA",
  "4": "PARENTES_AMIGOS",
  "5": "ESTUDOS_CURSOS",
  "6": "RELIGIAO",
  "7": "SAUDE",
  "8": "COMPRAS",
  "9": "OUTRO",
};

const MEIO_TRANSPORTE_BY_ID: Record<string, string> = {
  "1": "AVIAO",
  "2": "AUTOMOVEL",
  "3": "ONIBUS",
  "4": "MOTO",
  "5": "NAVIO_BARCO",
  "6": "TREM",
  "7": "OUTRO",
};

/** Nomes Embratur (maiúsculos) → ISO2. */
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  BRASIL: "BR",
  BRAZIL: "BR",
  ARGENTINA: "AR",
  "BOLIVIA, ESTADO PLURINACIONAL DA": "BO",
  BOLIVIA: "BO",
  CHILE: "CL",
  COLOMBIA: "CO",
  EQUADOR: "EC",
  PARAGUAI: "PY",
  PERU: "PE",
  URUGUAI: "UY",
  VENEZUELA: "VE",
  "ESTADOS UNIDOS": "US",
  "ESTADOS UNIDOS DA AMERICA": "US",
  CANADA: "CA",
  MEXICO: "MX",
  PORTUGAL: "PT",
  ESPANHA: "ES",
  FRANCA: "FR",
  "FRANÇA": "FR",
  ALEMANHA: "DE",
  ITALIA: "IT",
  "ITÁLIA": "IT",
  "REINO UNIDO": "GB",
  "REINO UNIDO DA GRA-BRETANHA E IRLANDA DO NORTE": "GB",
  HOLANDA: "NL",
  "PAISES BAIXOS (HOLANDA)": "NL",
  BELGICA: "BE",
  SUICA: "CH",
  "SUÍÇA": "CH",
  AUSTRIA: "AT",
  JAPAO: "JP",
  "JAPÃO": "JP",
  CHINA: "CN",
  "COREIA DO SUL, REPUBLICA DA": "KR",
  AUSTRALIA: "AU",
  "NOVA ZELANDIA": "NZ",
  "AFRICA DO SUL": "ZA",
  ANGOLA: "AO",
  "CABO VERDE": "CV",
  "GUINE-BISSAU": "GW",
  MOCAMBIQUE: "MZ",
  "MOÇAMBIQUE": "MZ",
  "SAO TOME E PRINCIPE": "ST",
  "TIMOR LESTE": "TL",
};

const EMBRATUR_COUNTRY_BY_ID = new Map<string, string>(
  ((embraturLists as { countries?: Array<{ id: number | string; name: string }> }).countries ?? []).map(
    (item) => [String(item.id), String(item.name).trim().toUpperCase()] as const,
  ),
);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function trimStr(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function toIsoDate(value: unknown): string {
  const raw = trimStr(value);
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function toIsoDateTime(value: unknown): string {
  const raw = trimStr(value);
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function ageInYears(birthDate: string, onDate: string): number | null {
  const birth = toIsoDate(birthDate);
  const on = toIsoDate(onDate) || toIsoDate(new Date().toISOString());
  if (!birth || !on) return null;
  const [by, bm, bd] = birth.split("-").map(Number);
  const [oy, om, od] = on.split("-").map(Number);
  if (!by || !bm || !bd || !oy || !om || !od) return null;
  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) age -= 1;
  return age;
}

function isMinor(birthDate: string | undefined, onDate: string): boolean {
  const age = ageInYears(birthDate ?? "", onDate);
  if (age == null) return false;
  return age < 18;
}

function mapGender(value: unknown): { genero_id: string; GeneroDescricao: string } {
  const raw = trimStr(value).toUpperCase();
  if (!raw || raw === GENDER_PREFER_NOT_TO_SAY) {
    return { genero_id: "OUTRO", GeneroDescricao: "" };
  }
  if (raw === "MALE" || raw === "M" || raw === "HOMEM" || raw === "MASCULINO") {
    return { genero_id: "HOMEM", GeneroDescricao: "" };
  }
  if (raw === "FEMALE" || raw === "F" || raw === "MULHER" || raw === "FEMININO") {
    return { genero_id: "MULHER", GeneroDescricao: "" };
  }
  return { genero_id: "OUTRO", GeneroDescricao: "" };
}

function mapDocumentType(value: unknown): string {
  const raw = trimStr(value).toUpperCase();
  if (raw === "CPF" || raw === "2") return "CPF";
  if (raw === "RG" || raw === "5") return "RG";
  if (raw === "PASSPORT" || raw === "PASSAPORTE" || raw === "7") return "PASSPORT";
  return raw || "CPF";
}

function normalizeDocumentNumber(documentNumber: string, documentType: string): string {
  const trimmed = documentNumber.trim();
  if (!trimmed) return "";
  if (documentType === "CPF" || documentType === "RG") {
    return onlyDigits(trimmed) || trimmed;
  }
  return trimmed.replace(/\s+/g, "").toUpperCase();
}

function normalizePhone(value: unknown): string {
  return onlyDigits(trimStr(value));
}

function normalizeCep(value: unknown): string {
  return onlyDigits(trimStr(value));
}

/** Converte cidadania/país Embratur (nome, id ou ISO) para ISO2. */
export function mapCountryToIso2(value: unknown, fallbackWhenEmpty = "BR"): string {
  const raw = trimStr(value);
  if (!raw) return fallbackWhenEmpty;

  const upper = raw.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  if (upper === "1058" || upper === "BRASIL" || upper === "BRAZIL") return "BR";

  const byIdName = EMBRATUR_COUNTRY_BY_ID.get(upper);
  if (byIdName) {
    const mapped = COUNTRY_NAME_TO_ISO[byIdName];
    if (mapped) return mapped;
  }

  const byName = COUNTRY_NAME_TO_ISO[upper];
  if (byName) return byName;

  // Nome parcial (ex.: "ALEMANHA" contido em variantes).
  for (const [name, iso] of Object.entries(COUNTRY_NAME_TO_ISO)) {
    if (upper.includes(name) || name.includes(upper)) return iso;
  }

  return fallbackWhenEmpty;
}

function mapMotivoViagem(snmotvia: string | undefined): string {
  const key = trimStr(snmotvia);
  return MOTIVO_VIAGEM_BY_ID[key] ?? "LAZER_FERIAS";
}

function mapMeioTransporte(sntiptran: string | undefined): string {
  const key = trimStr(sntiptran);
  return MEIO_TRANSPORTE_BY_ID[key] ?? "OUTRO";
}

function toIbgeNumber(value: unknown): number {
  const digits = onlyDigits(trimStr(value));
  if (!digits) return 0;
  const n = Number(digits);
  return Number.isFinite(n) ? n : 0;
}

function resolveStayDates(snapshot: Reservation | null): { entrada: string; saida: string } {
  const stay = snapshot?.stay;
  const entrada =
    toIsoDate(stay?.checkinDate) ||
    toIsoDate(snapshot?.checkinDate) ||
    toIsoDate(snapshot?.["check_in"]) ||
    "";
  const saida =
    toIsoDate(stay?.checkoutDate) ||
    toIsoDate(snapshot?.checkoutDate) ||
    toIsoDate(snapshot?.["check_out"]) ||
    "";
  return { entrada, saida };
}

function resolveOtaReservationNumber(snapshot: Reservation | null): string {
  if (!snapshot) return "";
  const row = snapshot as Record<string, unknown>;
  const candidates = [
    row["otaLocalizer"],
    row["otaReservationId"],
    row["bookingCode"],
    row["externalLocalizer"],
    row["channelReservationId"],
    row["numero_reserva_ota"],
    asRecord(row["channel"])?.["reservationId"],
    asRecord(row["ota"])?.["reservationId"],
  ];
  for (const candidate of candidates) {
    const value = trimStr(candidate);
    if (value) return value;
  }
  return "";
}

function resolveOrigemReservaId(snapshot: Reservation | null): string {
  if (!snapshot) return "DIRETA";
  const row = snapshot as Record<string, unknown>;
  const raw = trimStr(
    row["origem_reserva_id"] ??
      row["reservationOrigin"] ??
      row["channel"] ??
      row["source"] ??
      asRecord(row["channel"])?.["name"] ??
      asRecord(row["channel"])?.["code"],
  ).toUpperCase();
  if (!raw) return "DIRETA";
  if (raw.includes("OTA") || raw.includes("BOOKING") || raw.includes("AIRBNB") || raw.includes("EXPEDIA")) {
    return "OTA";
  }
  if (raw === "DIRETA" || raw === "DIRECT" || raw === "WALKIN" || raw === "WALK-IN") return "DIRETA";
  if (raw.length <= 24) return raw.replace(/\s+/g, "_");
  return "DIRETA";
}

function buildFnrhBlock(embratur: EmbraturForm | null): FnrhHospede["fnrh"] {
  return {
    motivo_viagem_id: mapMotivoViagem(embratur?.snmotvia),
    meio_transporte_id: mapMeioTransporte(embratur?.sntiptran),
    pais_origem_id: mapCountryToIso2(embratur?.bgstdscpais),
    pais_destino_id: mapCountryToIso2(embratur?.bgstdscpaisdest),
    cidade_origem_id: toIbgeNumber(embratur?.snidcidadeibge),
    cidade_destino_id: toIbgeNumber(embratur?.snidcidadeibgedest),
  };
}

function buildDadosPessoais(
  guest: MainGuest | Dependent,
  embratur: EmbraturForm | null,
): FnrhDadosPessoais {
  const documentType = mapDocumentType(guest.documentType);
  const documentNumber = normalizeDocumentNumber(String(guest.documentNumber ?? ""), documentType);
  const gender = mapGender(guest.gender);
  const nationality = mapCountryToIso2(guest.citizenship ?? guest.country);
  const residenceCountry = mapCountryToIso2(guest.country ?? guest.citizenship);
  const cityId =
    toIbgeNumber((guest as { cityIbge?: unknown }).cityIbge) ||
    toIbgeNumber(embratur?.snidcidadeibge);

  return {
    nome: trimStr(guest.name).toUpperCase(),
    nome_social: "",
    PaisNacionalidade_id: nationality,
    genero_id: gender.genero_id,
    GeneroDescricao: gender.GeneroDescricao,
    data_nascimento: toIsoDate(guest.birthDate),
    raca_id: "NAOINFORMAR",
    deficiencia_id: "NAO",
    tipo_deficiencia_id: "",
    documento_id: {
      numero_documento: documentNumber,
      tipo_documento_id: documentType,
    },
    contato: {
      email: trimStr(guest.email).toLowerCase(),
      telefone: normalizePhone(guest.mobilePhoneNumber),
      cep: normalizeCep(guest.zipCode),
      logradouro: trimStr(guest.street).toUpperCase(),
      numero: trimStr(guest.number),
      complemento: trimStr((guest as { complement?: unknown }).complement).toUpperCase(),
      bairro: trimStr(guest.neighborhood).toUpperCase(),
      PaisResidencia_id: residenceCountry,
      cidade_id: cityId,
      estado_id: trimStr(guest.state).toUpperCase(),
    },
  };
}

function buildHospede(input: {
  guest: MainGuest | Dependent;
  isPrincipal: boolean;
  checkedInAt: string;
  embratur: EmbraturForm | null;
  onDate: string;
  mainGuest?: MainGuest;
}): FnrhHospede {
  const minor = !input.isPrincipal && isMinor(input.guest.birthDate, input.onDate);
  const mainDocumentType = mapDocumentType(input.mainGuest?.documentType);
  const mainDocumentNumber = normalizeDocumentNumber(
    String(input.mainGuest?.documentNumber ?? ""),
    mainDocumentType,
  );

  return {
    is_principal: input.isPrincipal,
    situacao_hospede: "CHECKIN_REALIZADO",
    situacao_hospede_id: "CHECKIN_REALIZADO",
    check_in_em: input.checkedInAt,
    checkin_em: input.checkedInAt,
    check_out_em: null,
    checkout_em: null,
    ...(minor && mainDocumentNumber
      ? {
          responsavel: {
            numero_documento: mainDocumentNumber,
            tipo_documento_id: mainDocumentType,
          },
        }
      : {}),
    dados_pessoais: buildDadosPessoais(input.guest, input.embratur),
    fnrh: buildFnrhBlock(input.embratur),
  };
}

/** Monta o payload FNRH a partir de um registro de check-in do portal. */
export function buildFnrhPayloadFromCheckinRecord(record: CheckinRecordRow): FnrhPayload {
  const snapshot = record.reservation_snapshot;
  const { entrada, saida } = resolveStayDates(snapshot);
  const onDate = entrada || toIsoDate(record.checked_in_at) || toIsoDate(new Date().toISOString());
  const checkedInAt = toIsoDateTime(record.checked_in_at);
  const embratur = record.embratur;
  const mainGuest = record.main_guest ?? {};
  const companions = filterNamedCheckinDependents(record.dependents ?? []);

  const guests: Array<{ guest: MainGuest | Dependent; isPrincipal: boolean }> = [
    { guest: mainGuest, isPrincipal: true },
    ...companions.map((dependent) => ({ guest: dependent as MainGuest | Dependent, isPrincipal: false })),
  ];

  let adultos = 0;
  let menores = 0;
  for (const item of guests) {
    if (isMinor(item.guest.birthDate, onDate)) menores += 1;
    else adultos += 1;
  }

  const dados_hospede = guests.map((item) =>
    buildHospede({
      guest: item.guest,
      isPrincipal: item.isPrincipal,
      checkedInAt,
      embratur,
      onDate,
      mainGuest,
    }),
  );

  return {
    reserva: {
      numero_reserva: record.localizer.trim().toUpperCase(),
      numero_reserva_ota: resolveOtaReservationNumber(snapshot),
      data_entrada: entrada,
      data_saida: saida,
      quantidade_hospede_adulto: adultos,
      quantidade_hospede_menor: menores,
      origem_reserva_id: resolveOrigemReservaId(snapshot),
    },
    dados_hospede,
  };
}
