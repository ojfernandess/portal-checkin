import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CalendarRange, ChevronRight, CircleCheck, Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { CompanionsStep } from "@/components/checkin/CompanionsStep";
import { ReaccessIdentityGate } from "@/components/checkin/ReaccessIdentityGate";
import { SuccessScreen } from "@/components/checkin/SuccessScreen";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import {
  getCompanionCompletedStay,
  getCompanionGuestPage,
  submitCompanionSelfRegistration,
  validateCheckinSelfie,
  type CompanionGuestPageContext,
} from "@/lib/api/checkin.functions";
import type { SelfieValidationOutcome } from "@/components/checkin/SelfieCapture";
import type { Dependent, Reservation } from "@/lib/api/types";
import type { UsefulInfoItem } from "@/lib/establishment-settings";
import { formatDate } from "@/lib/format-dates";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  localizer: string;
};

type StayPhase = "form" | "verify" | "stay";

type UnlockedStay = {
  reservation: Reservation;
  usefulInfoItems: UsefulInfoItem[];
  successPagePhotoUrl: string | null;
  inboxEnabled: boolean;
};

export function CompanionSelfRegisterPage({ localizer }: Props) {
  const { t, locale } = useI18n();
  const loadPage = useServerFn(getCompanionGuestPage);
  const submit = useServerFn(submitCompanionSelfRegistration);
  const unlockStay = useServerFn(getCompanionCompletedStay);
  const validateSelfieFn = useServerFn(validateCheckinSelfie);
  const code = localizer.trim().toUpperCase();
  const [context, setContext] = useState<CompanionGuestPageContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<StayPhase>("form");
  const [birthDateInput, setBirthDateInput] = useState("");
  const [birthDateError, setBirthDateError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [stay, setStay] = useState<UnlockedStay | null>(null);
  const [formKey, setFormKey] = useState(0);
  const multiCompanion = (context?.guestsQuantity ?? 0) >= 3;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadPage({ data: { localizer: code } })
      .then((page) => {
        if (cancelled) return;
        setContext(page);
        if (page.guestsQuantity < 3 && !page.canRegister && page.blockedReason === "no_slots") {
          setPhase("verify");
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("checkin.companions.selfPageLoadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, loadPage, t]);

  async function validateSelfiePhoto(
    photoBase64: string,
    companionGuestId?: string,
  ): Promise<SelfieValidationOutcome> {
    const establishmentId = context?.establishmentId?.trim();
    if (!establishmentId) {
      return { status: "ERROR", reason: "SERVICE_UNAVAILABLE" };
    }
    const result = await validateSelfieFn({
      data: {
        establishmentId,
        imageData: photoBase64,
        ...(companionGuestId?.trim() ? { guestId: companionGuestId.trim() } : {}),
      },
    });
    return {
      status: result.status,
      reason: result.reason,
      maxAttemptsReached: result.maxAttemptsReached,
    };
  }

  async function handleSubmit(dependents?: Dependent[]) {
    const next = dependents ?? [];
    if (next.length === 0) return;
    setSaving(true);
    try {
      await submit({
        data: {
          localizer: code,
          dependents: next as unknown as Record<string, unknown>[],
        },
      });
      toast.success(t("checkin.companions.selfPageSaved"));
      if ((context?.guestsQuantity ?? 0) >= 3) {
        const page = await loadPage({ data: { localizer: code } });
        setContext(page);
        setFormKey((current) => current + 1);
        return;
      }
      setDone(true);
      setPhase("verify");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("checkin.companions.selfPageSaveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleVerifyBirthDate() {
    const birthDate = birthDateInput.trim();
    if (!birthDate) {
      setBirthDateError(t("checkin.lookup.birthDateRequired"));
      return;
    }
    setVerifying(true);
    setBirthDateError("");
    try {
      const result = await unlockStay({ data: { localizer: code, birthDate } });
      if (result.access === "granted" && result.reservation) {
        setStay({
          reservation: result.reservation,
          usefulInfoItems: result.usefulInfoItems ?? [],
          successPagePhotoUrl: result.successPagePhotoUrl ?? null,
          inboxEnabled: result.inboxEnabled === true,
        });
        setPhase("stay");
        return;
      }
      if (result.access === "unavailable") {
        setBirthDateError(t("checkin.reaccess.unavailable"));
        return;
      }
      setBirthDateError(t("checkin.lookup.birthDateMismatch"));
    } catch {
      setBirthDateError(t("checkin.reaccess.verifyFailed"));
    } finally {
      setVerifying(false);
    }
  }

  const stayLine = [context?.checkinDate, context?.checkoutDate]
    .filter(Boolean)
    .map((value) => formatDate(value, locale))
    .join(" — ");
  const showingStay = phase === "stay" && stay != null;
  const checkinComplete = context?.canRegister === true || context?.blockedReason === "no_slots" || done;

  return (
    <div className="min-h-screen bg-background pb-16">
      <header className="border-b border-border bg-primary py-4 text-primary-foreground">
        <div
          className={cn(
            "flex items-center justify-between gap-4",
            showingStay ? "success-page-shell" : "page-shell",
          )}
        >
          <BrandLogo className="max-h-12 shrink-0 sm:max-h-14" />
          <div className="hidden min-w-0 flex-1 text-center sm:block">
            <p className="truncate font-display text-lg font-semibold tracking-wide">
              {t("checkin.header.title")}
            </p>
            <p className="truncate text-[11px] text-primary-foreground/70 sm:text-xs">
              {t("checkin.header.subtitle")}
            </p>
          </div>
          <LanguageSwitcher
            showLabelOnMobile
            className="shrink-0 gap-1.5 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            variant="ghost"
          />
        </div>
      </header>

      <main className={cn("app-container py-7", showingStay ? "success-page-shell" : "page-shell")}>
        {showingStay && stay ? (
          <SuccessScreen
            reservation={stay.reservation}
            mainGuest={stay.reservation.mainGuest}
            dependents={stay.reservation.dependents ?? []}
            alreadyCompleted
            establishmentPhotoUrl={stay.successPagePhotoUrl}
            inboxPortariaEnabled={stay.inboxEnabled}
            usefulInfoItems={stay.usefulInfoItems}
            canAddCompanions={false}
          />
        ) : (
          <div className="animate-step-in space-y-5">
            <header className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("checkin.companions.selfPageEyebrow")}
              </p>
              <h1 className="font-display text-2xl text-foreground">{t("checkin.companions.selfPageTitle")}</h1>
              <p className="text-sm text-muted-foreground">
                {context?.establishmentName
                  ? t("checkin.companions.selfPageBody", {
                      establishment: context.establishmentName,
                      localizer: code,
                    })
                  : t("checkin.companions.selfPageBodyGeneric", { localizer: code })}
              </p>
            </header>

            {context && (context.establishmentName || stayLine) ? (
              <section className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-card">
                {context.establishmentName ? (
                  <p className="font-medium text-foreground">{context.establishmentName}</p>
                ) : null}
                <p className="font-code text-xs tracking-wide text-muted-foreground">{code}</p>
                {stayLine ? (
                  <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CalendarRange className="size-4 shrink-0" aria-hidden />
                    {stayLine}
                  </p>
                ) : null}
              </section>
            ) : null}

            {loading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("common.loading")}
              </div>
            ) : error ? (
              <p className="rounded-2xl border border-destructive/30 bg-card p-5 text-sm text-destructive shadow-card">
                {error}
              </p>
            ) : multiCompanion ? (
              <>
                <section className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-card">
                  <h2 className="font-display text-xl">{t("checkin.companions.selfRosterTitle")}</h2>
                  {(context?.registeredCompanions.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground">{t("checkin.companions.selfRosterEmpty")}</p>
                  ) : (
                    <ul className="space-y-2">
                      {context?.registeredCompanions.map((companion) => (
                        <li key={companion.accessKey}>
                          <Link
                            to="/$localizer/guest/acesso"
                            params={{ localizer: code }}
                            search={{ c: companion.accessKey }}
                            className="flex items-center justify-between gap-3 rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
                          >
                            <span>{companion.name}</span>
                            <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
                {context?.canRegister ? (
                  <>
                    <h2 className="font-display text-xl">{t("checkin.companions.selfRosterRegisterTitle")}</h2>
                    <CompanionsStep
                      key={formKey}
                      guestsQuantity={(context.remainingSlots ?? 0) + 1}
                      mainGuest={{
                        documentNumber: context.mainGuestDocumentNumber ?? "",
                        documentType: context.mainGuestDocumentType ?? "CPF",
                        zipCode: context.mainGuestAddress.zipCode ?? "",
                        street: context.mainGuestAddress.street ?? "",
                        number: context.mainGuestAddress.number ?? "",
                        neighborhood: context.mainGuestAddress.neighborhood ?? "",
                        city: context.mainGuestAddress.city ?? "",
                        state: context.mainGuestAddress.state ?? "",
                        country: context.mainGuestAddress.country ?? "",
                      }}
                      dependents={[]}
                      mode="postCheckin"
                      selfService
                      lockedCount={0}
                      saving={saving}
                      inboxEnabled={context.inboxEnabled === true}
                      faceValidationEnabled={context.faceValidationEnabled === true}
                      onValidateSelfie={validateSelfiePhoto}
                      onChange={() => undefined}
                      onBack={() => undefined}
                      onContinue={(next) => void handleSubmit(next)}
                    />
                  </>
                ) : (context?.registeredCompanions.length ?? 0) === 0 ? (
                  <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
                    {blockedMessage(context?.blockedReason, t)}
                  </p>
                ) : null}
              </>
            ) : phase === "verify" && checkinComplete ? (
              <>
                {done ? (
                  <section className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-card">
                    <div className="flex items-center gap-2">
                      <CircleCheck className="size-5 text-success" aria-hidden />
                      <h2 className="font-display text-xl">{t("checkin.companions.selfPageDoneTitle")}</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">{t("checkin.companions.selfPageDoneBody")}</p>
                  </section>
                ) : null}
                <ReaccessIdentityGate
                  birthDateInput={birthDateInput}
                  birthDateError={birthDateError}
                  verifying={verifying}
                  onBirthDateChange={(value) => {
                    setBirthDateInput(value);
                    if (birthDateError) setBirthDateError("");
                  }}
                  onBack={context?.canRegister || done ? () => setPhase("form") : undefined}
                  onContinue={() => void handleVerifyBirthDate()}
                  body={t("checkin.companions.selfStayVerifyBody")}
                />
              </>
            ) : context?.canRegister || done ? (
              <>
                {done ? (
                  <section className="space-y-2 rounded-2xl border border-border bg-card p-5 shadow-card">
                    <div className="flex items-center gap-2">
                      <CircleCheck className="size-5 text-success" aria-hidden />
                      <h2 className="font-display text-xl">{t("checkin.companions.selfPageDoneTitle")}</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">{t("checkin.companions.selfPageDoneBody")}</p>
                  </section>
                ) : null}
                <CompanionsStep
                  guestsQuantity={(context?.remainingSlots ?? 0) + 1}
                  mainGuest={{
                    documentNumber: context?.mainGuestDocumentNumber ?? "",
                    documentType: context?.mainGuestDocumentType ?? "CPF",
                    zipCode: context?.mainGuestAddress.zipCode ?? "",
                    street: context?.mainGuestAddress.street ?? "",
                    number: context?.mainGuestAddress.number ?? "",
                    neighborhood: context?.mainGuestAddress.neighborhood ?? "",
                    city: context?.mainGuestAddress.city ?? "",
                    state: context?.mainGuestAddress.state ?? "",
                    country: context?.mainGuestAddress.country ?? "",
                  }}
                  dependents={[]}
                  mode="postCheckin"
                  selfService
                  readOnly={done}
                  lockedCount={0}
                  saving={saving}
                  inboxEnabled={context?.inboxEnabled === true}
                  faceValidationEnabled={context?.faceValidationEnabled === true}
                  onValidateSelfie={validateSelfiePhoto}
                  onChange={() => undefined}
                  onBack={() => undefined}
                  onContinue={(next) => void handleSubmit(next)}
                />
                {(done || (context?.registeredCount ?? 0) > 0) && !saving ? (
                  <Button type="button" variant="outline" className="tap-safe w-full" onClick={() => setPhase("verify")}>
                    {t("checkin.companions.selfStayView")}
                  </Button>
                ) : null}
              </>
            ) : (
              <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
                {blockedMessage(context?.blockedReason, t)}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function blockedMessage(
  reason: CompanionGuestPageContext["blockedReason"] | undefined,
  t: (key: string, vars?: Record<string, string | number>) => string,
): string {
  if (reason === "not_checked_in" || reason === "incomplete_context") {
    return t("checkin.companions.selfPageWaitingMain");
  }
  if (reason === "no_slots") return t("checkin.companions.postNoSlots");
  if (reason === "cancelled" || reason === "pending_cancellation") {
    return t("checkin.companions.postBlockedCancelled");
  }
  return t("checkin.companions.selfPageLoadFailed");
}
