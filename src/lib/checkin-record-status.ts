import type { Dependent, Reservation } from "@/lib/api/types";

export type CheckinRecordBadgeInput = {
  reservation_id: string | null;
  reservation_snapshot: Reservation | null;
  dependents: Dependent[];
  terms_accepted: boolean;
};

export type CheckinRecordDisplayRow = CheckinRecordBadgeInput & {
  id: string;
  localizer: string;
  checked_in_at: string;
};

export function countNamedCheckinDependents(dependents: Dependent[]): number {
  return filterNamedCheckinDependents(dependents).length;
}

export function filterNamedCheckinDependents(dependents: Dependent[]): Dependent[] {
  return dependents.filter((dependent) => Boolean(dependent.name?.trim()));
}

export function checkinRecordIsReservation(record: CheckinRecordBadgeInput): boolean {
  return Boolean(record.reservation_snapshot || record.reservation_id);
}

/** Reserva em que hóspedes acompanhantes foram adicionados após o check-in inicial. */
export function checkinRecordShowsCompanionsBadge(record: CheckinRecordBadgeInput): boolean {
  if (!checkinRecordIsReservation(record)) return false;

  const recordCount = countNamedCheckinDependents(record.dependents);
  if (recordCount === 0) return false;

  if (!record.terms_accepted) return true;

  const snapshotCount = countNamedCheckinDependents(record.reservation_snapshot?.dependents ?? []);
  return recordCount > snapshotCount;
}

function mergeCompanionDependents(primary: CheckinRecordDisplayRow, secondary: CheckinRecordDisplayRow): Dependent[] {
  const dependents = [...primary.dependents];
  for (const dependent of secondary.dependents) {
    if (!dependent.name?.trim()) continue;
    const exists = dependents.some(
      (item) =>
        (item.documentNumber?.trim() &&
          dependent.documentNumber?.trim() &&
          item.documentNumber.trim() === dependent.documentNumber.trim()) ||
        item.name?.trim().toLowerCase() === dependent.name.trim().toLowerCase(),
    );
    if (!exists) dependents.push(dependent);
  }
  return dependents;
}

/** Exibe um único check-in por localizador, mesclando acompanhantes de registros duplicados antigos. */
export function dedupeCheckinRecordsForDisplay<T extends CheckinRecordDisplayRow>(records: T[]): T[] {
  const bestByLocalizer = new Map<string, T>();

  for (const record of records) {
    const key = record.localizer.trim().toUpperCase();
    const current = bestByLocalizer.get(key);
    if (!current) {
      bestByLocalizer.set(key, record);
      continue;
    }

    let primary = current;
    let secondary = record;

    if (record.terms_accepted && !current.terms_accepted) {
      primary = record;
      secondary = current;
    } else if (!record.terms_accepted && current.terms_accepted) {
      primary = current;
      secondary = record;
    } else if (new Date(record.checked_in_at).getTime() < new Date(current.checked_in_at).getTime()) {
      primary = record;
      secondary = current;
    }

    bestByLocalizer.set(key, {
      ...primary,
      dependents: mergeCompanionDependents(primary, secondary),
    });
  }

  return [...bestByLocalizer.values()].sort(
    (a, b) => new Date(b.checked_in_at).getTime() - new Date(a.checked_in_at).getTime(),
  );
}
