const NUMBERED_STEP_PATTERN = /^\d+[.)]\s+/;

/** Divide texto em passos (uma linha = um passo). Remove numeração manual quando presente. */
export function parseUsefulInfoSteps(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(NUMBERED_STEP_PATTERN, "").trim())
    .filter(Boolean);
}

export function shouldRenderUsefulInfoAsSteps(kind: string, value: string): boolean {
  if (kind === "access") return parseUsefulInfoSteps(value).length > 0;
  return parseUsefulInfoSteps(value).length > 1;
}

export function shouldRenderUsefulInfoAsFormattedBlock(kind: string, value: string): boolean {
  return kind === "parking" && value.includes("\n");
}
