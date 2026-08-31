import type { InboxManagedUnit, InboxStay } from "@/lib/inbox/types";

export type InboxManagedUnitOption = {
  id: number;
  display_name: string;
};

function readNumericId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return undefined;
}

export function resolveStayManagedUnitId(
  stay: InboxStay & { managed_unit?: { id?: unknown; display_name?: string | null } | null },
): number | undefined {
  const direct = readNumericId(stay.managed_unit_id);
  if (direct) return direct;
  return readNumericId(stay.managed_unit?.id);
}

export function normalizeInboxStay(
  raw: InboxStay & { managed_unit?: { id?: unknown; display_name?: string | null } | null },
): InboxStay {
  const managedUnitId = resolveStayManagedUnitId(raw);
  return {
    ...raw,
    managed_unit_id: managedUnitId ?? raw.managed_unit_id,
  };
}

export function normalizeManagedUnitOption(raw: unknown): InboxManagedUnitOption | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const id = readNumericId(record.id);
  if (!id) return null;

  const displayName =
    (typeof record.display_name === "string" && record.display_name.trim()) ||
    (typeof record.displayName === "string" && record.displayName.trim()) ||
    (typeof record.name === "string" && record.name.trim()) ||
    `#${id}`;

  return { id, display_name: displayName };
}

export function normalizeManagedUnitOptions(raw: unknown): InboxManagedUnitOption[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const options: InboxManagedUnitOption[] = [];
  for (const item of raw) {
    const option = normalizeManagedUnitOption(item);
    if (!option || seen.has(option.id)) continue;
    seen.add(option.id);
    options.push(option);
  }
  return options;
}

export function enrichManagedUnitOptionsFromStay(
  units: InboxManagedUnitOption[],
  stay: InboxStay & { managed_unit?: { id?: unknown; display_name?: string | null } | null },
): InboxManagedUnitOption[] {
  const managedUnitId = resolveStayManagedUnitId(stay);
  if (!managedUnitId || units.some((unit) => unit.id === managedUnitId)) {
    return units;
  }

  const nestedName =
    typeof stay.managed_unit?.display_name === "string" && stay.managed_unit.display_name.trim()
      ? stay.managed_unit.display_name.trim()
      : `#${managedUnitId}`;

  return [...units, { id: managedUnitId, display_name: nestedName }];
}

export function managedUnitLabel(unit: InboxManagedUnit | InboxManagedUnitOption): string {
  return unit.display_name?.trim() || `#${unit.id}`;
}
