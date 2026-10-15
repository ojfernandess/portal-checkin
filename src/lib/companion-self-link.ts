/** Caminho público para o acompanhante fazer o próprio cadastro: /{localizador}/guest */
export function companionGuestPath(localizer: string): string {
  const code = localizer.trim().toUpperCase();
  return `/${code}/guest`;
}

export function companionGuestUrl(localizer: string, origin?: string): string {
  const path = companionGuestPath(localizer);
  const base =
    origin ??
    (typeof window !== "undefined" ? window.location.origin : "");
  return base ? `${base}${path}` : path;
}
