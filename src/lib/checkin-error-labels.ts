import type { CheckinErrorLabels } from "@/lib/checkin-validation";

type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export function splitCheckinErrorMessage(message: string): { title: string; description?: string } {
  const lines = message
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length <= 1) return { title: lines[0] ?? "" };
  return { title: lines[0], description: lines.slice(1).join("\n") };
}

export function buildCheckinErrorLabels(t: TranslateFn): CheckinErrorLabels {
  return {
    steps: {
      guest: t("checkin.errors.steps.guest"),
      companions: t("checkin.errors.steps.companions"),
      photos: t("checkin.errors.steps.photos"),
      embratur: t("checkin.errors.steps.embratur"),
      extra: t("checkin.errors.steps.extra"),
      terms: t("checkin.errors.steps.terms"),
      search: t("checkin.errors.steps.search"),
    },
    fields: {
      name: t("checkin.errors.fields.name"),
      email: t("checkin.errors.fields.email"),
      birthDate: t("checkin.errors.fields.birthDate"),
      gender: t("checkin.errors.fields.gender"),
      documentNumber: t("checkin.errors.fields.documentNumber"),
      documentType: t("checkin.errors.fields.documentType"),
      rg: t("checkin.errors.fields.rg"),
      expeditor: t("checkin.errors.fields.expeditor"),
      mobilePhoneNumber: t("checkin.errors.fields.mobilePhoneNumber"),
      profession: t("checkin.errors.fields.profession"),
      citizenship: t("checkin.errors.fields.citizenship"),
      zipCode: t("checkin.errors.fields.zipCode"),
      street: t("checkin.errors.fields.street"),
      number: t("checkin.errors.fields.number"),
      neighborhood: t("checkin.errors.fields.neighborhood"),
      city: t("checkin.errors.fields.city"),
      state: t("checkin.errors.fields.state"),
      country: t("checkin.errors.fields.country"),
      profilePhoto: t("checkin.errors.fields.profilePhoto"),
      documentPhoto: t("checkin.errors.fields.documentPhoto"),
      snmotvia: t("checkin.errors.fields.snmotvia"),
      sntiptran: t("checkin.errors.fields.sntiptran"),
      bgstdscpais: t("checkin.errors.fields.bgstdscpais"),
      bgstdscpaisdest: t("checkin.errors.fields.bgstdscpaisdest"),
      snidcidadeibge: t("checkin.errors.fields.snidcidadeibge"),
      snidcidadeibgedest: t("checkin.errors.fields.snidcidadeibgedest"),
      terms: t("checkin.errors.fields.terms"),
      localizer: t("checkin.errors.fields.localizer"),
    },
    intro: t("checkin.errors.intro"),
    stepLine: t("checkin.errors.stepLine"),
    companionLine: t("checkin.errors.companionLine"),
    apiGeneric: t("checkin.errors.apiGeneric"),
    apiReviewGuest: t("checkin.errors.apiReviewGuest"),
    apiReviewCompanions: t("checkin.errors.apiReviewCompanions"),
    apiIncompleteMainGuest: t("checkin.errors.apiIncompleteMainGuest"),
    apiIncompleteCompanions: t("checkin.errors.apiIncompleteCompanions"),
    apiInvalidImageFormat: t("checkin.photos.invalidFormat"),
  };
}

/** Rótulos em português para validação no servidor (server functions). */
export function buildCheckinErrorLabelsPt(): CheckinErrorLabels {
  return {
    steps: {
      guest: "Dados do hóspede",
      companions: "Acompanhantes",
      photos: "Fotos",
      embratur: "Ficha Embratur",
      extra: "Informações do estabelecimento",
      terms: "Termos e políticas",
      search: "Busca da reserva",
    },
    fields: {
      name: "Nome completo",
      email: "E-mail",
      birthDate: "Data de nascimento",
      gender: "Gênero",
      documentNumber: "Documento (CPF/passaporte)",
      documentType: "Tipo de documento",
      rg: "RG",
      expeditor: "Órgão expedidor",
      mobilePhoneNumber: "Telefone celular",
      profession: "Profissão",
      citizenship: "Naturalidade / cidadania",
      zipCode: "CEP / ZIP Code",
      street: "Logradouro",
      number: "Número",
      neighborhood: "Bairro",
      city: "Cidade",
      state: "Estado",
      country: "País",
      profilePhoto: "Selfie",
      documentPhoto: "Foto do documento",
      snmotvia: "Motivo da viagem",
      sntiptran: "Meio de transporte",
      bgstdscpais: "País de origem",
      bgstdscpaisdest: "País de destino",
      snidcidadeibge: "Cidade de origem",
      snidcidadeibgedest: "Cidade de destino",
      terms: "Aceite dos termos",
      localizer: "Código da reserva",
    },
    intro: "Corrija os seguintes pontos antes de continuar:",
    stepLine: "• {step}: {fields}",
    companionLine: "• Acompanhante {name}: {fields}",
    apiGeneric: "Não foi possível concluir o check-in.",
    apiReviewGuest: "Revise os dados do hóspede principal (etapa Dados).",
    apiReviewCompanions: "Revise os dados dos acompanhantes (etapa Acompanhantes).",
    apiIncompleteMainGuest: "Revise os dados do hóspede principal. Campo(s) pendente(s): {fields}.",
    apiIncompleteCompanions: "Revise os dados dos acompanhantes. Campo(s) pendente(s): {fields}.",
    apiInvalidImageFormat:
      "O formato da imagem é inválido. Tire uma nova foto ou envie um arquivo JPG ou PNG.",
  };
}
