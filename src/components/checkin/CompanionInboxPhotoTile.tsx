import { useState } from "react";
import { Loader2 } from "lucide-react";
import { SelfieCapture, type SelfieValidationOutcome } from "@/components/checkin/SelfieCapture";
import { Button } from "@/components/ui/button";
import type { Dependent } from "@/lib/api/types";
import { companionNeedsInboxPhoto } from "@/lib/companion-inbox-photos";
import type { ExclusiveCameraProps } from "@/lib/camera-utils";
import { useI18n } from "@/lib/i18n/context";

type Props = {
  companion: Dependent;
  companionKey: string;
  saving?: boolean;
  faceValidationEnabled?: boolean;
  onValidateSelfie?: (photoBase64: string, guestId?: string) => Promise<SelfieValidationOutcome>;
  onSave: (photoBase64: string) => Promise<void>;
} & Partial<ExclusiveCameraProps>;

export function CompanionInboxPhotoTile({
  companion,
  companionKey,
  saving = false,
  faceValidationEnabled = false,
  onValidateSelfie,
  onSave,
  captureId,
  activeCaptureId,
  onRequestCapture,
  onReleaseCapture,
}: Props) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const [draftPhoto, setDraftPhoto] = useState<string | null>(companion.profilePhotoUrl ?? null);
  const needsPhoto = companionNeedsInboxPhoto(companion);
  const resolvedCaptureId = captureId ?? `companion-inbox-photo-${companionKey}`;

  if (!needsPhoto && !companion.profilePhotoUrl?.trim()) {
    return null;
  }

  async function handleSave() {
    if (!draftPhoto?.trim()) return;
    await onSave(draftPhoto);
    setEditing(false);
  }

  return (
    <div className="rounded-xl border border-border bg-muted/20 p-4">
      <div className="mb-3 space-y-1">
        <p className="text-sm font-medium">{companion.name}</p>
        <p className="text-xs text-muted-foreground">{t("checkin.companions.inboxPhotoTitle")}</p>
        <p className="text-xs text-muted-foreground">{t("checkin.companions.inboxPhotoHint")}</p>
      </div>

      {editing || needsPhoto ? (
        <div className="space-y-3">
          <SelfieCapture
            compact
            title={t("checkin.photos.selfie")}
            value={draftPhoto}
            photoGuidance="new"
            validationEnabled={faceValidationEnabled}
            onValidate={(photo) =>
              onValidateSelfie
                ? onValidateSelfie(photo, companion.documentNumber?.trim() || undefined)
                : Promise.resolve({ status: "APPROVED" as const })
            }
            captureId={resolvedCaptureId}
            activeCaptureId={activeCaptureId}
            onRequestCapture={onRequestCapture}
            onReleaseCapture={onReleaseCapture}
            onCapture={setDraftPhoto}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="tap-safe"
              disabled={saving || !draftPhoto?.trim()}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t("checkin.companions.inboxPhotoSave")}
            </Button>
            {!needsPhoto ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="tap-safe"
                disabled={saving}
                onClick={() => {
                  setDraftPhoto(companion.profilePhotoUrl ?? null);
                  setEditing(false);
                }}
              >
                {t("common.back")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="relative aspect-square max-w-[140px] overflow-hidden rounded-xl border border-border bg-muted">
            <img
              src={companion.profilePhotoUrl}
              alt={companion.name}
              className="size-full object-cover"
            />
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="tap-safe"
            disabled={saving}
            onClick={() => setEditing(true)}
          >
            {t("checkin.companions.inboxPhotoChange")}
          </Button>
        </div>
      )}
    </div>
  );
}
