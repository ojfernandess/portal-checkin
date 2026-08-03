/** Código de erro quando o estabelecimento não está cadastrado no portal. */
export const ESTABLISHMENT_NOT_REGISTERED = "ESTABLISHMENT_NOT_REGISTERED";

export function isEstablishmentNotRegisteredError(error: unknown): boolean {
  return error instanceof Error && error.message === ESTABLISHMENT_NOT_REGISTERED;
}
