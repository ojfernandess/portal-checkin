import type { Dependent } from "@/lib/api/types";

export function companionNeedsInboxPhoto(dependent: Dependent): boolean {
  return Boolean(dependent.name?.trim() && !dependent.profilePhotoUrl?.trim());
}

export function companionsNeedInboxPhotos(dependents: Dependent[]): boolean {
  return dependents.some(companionNeedsInboxPhoto);
}

export function companionsHaveInboxPhotoUpdates(
  current: Dependent[],
  initial: Dependent[],
): boolean {
  const len = Math.min(current.length, initial.length);
  for (let index = 0; index < len; index += 1) {
    const currentPhoto = current[index]?.profilePhotoUrl?.trim() ?? "";
    const initialPhoto = initial[index]?.profilePhotoUrl?.trim() ?? "";
    if (currentPhoto !== initialPhoto && currentPhoto.startsWith("data:")) {
      return true;
    }
  }
  return false;
}
