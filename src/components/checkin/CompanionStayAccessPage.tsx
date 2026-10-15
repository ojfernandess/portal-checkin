import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { ReaccessIdentityGate } from "@/components/checkin/ReaccessIdentityGate";
import { SuccessScreen } from "@/components/checkin/SuccessScreen";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import {
  getCompanionCompletedStay,
  getCompanionGuestPage,
} from "@/lib/api/checkin.functions";
import type { Reservation } from "@/lib/api/types";
import type { UsefulInfoItem } from "@/lib/establishment-settings";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";

type Props = {
  localizer: string;
  companionKey: string;
};

type UnlockedStay = {
  reservation: Reservation;
  usefulInfoItems: UsefulInfoItem[];
  successPagePhotoUrl: string | null;
  inboxEnabled: boolean;
};

export function CompanionStayAccessPage({ localizer, companionKey }: Props) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const loadPage = useServerFn(getCompanionGuestPage);
  const unlockStay = useServerFn(getCompanionCompletedStay);
  const code = localizer.trim().toUpperCase();
  const [companionName, setCompanionName] = useState("");
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [birthDateInput, setBirthDateInput] = useState("");
  const [birthDateError, setBirthDateError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [stay, setStay] = useState<UnlockedStay | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setPageError(null);
    setStay(null);
    void loadPage({ data: { localizer: code } })
      .then((page) => {
        if (cancelled) return;
        if (page.guestsQuantity < 3) {
          setPageError("single");
          return;
        }
        const companion = page.registeredCompanions.find((item) => item.accessKey === companionKey);
        if (!companion) {
          setPageError(t("checkin.companions.selfAccessMissing"));
          return;
        }
        setCompanionName(companion.name);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPageError(err instanceof Error ? err.message : t("checkin.companions.selfPageLoadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [code, companionKey, loadPage, t]);

  async function handleVerifyBirthDate() {
    const birthDate = birthDateInput.trim();
    if (!birthDate) {
      setBirthDateError(t("checkin.lookup.birthDateRequired"));
      return;
    }
    setVerifying(true);
    setBirthDateError("");
    try {
      const result = await unlockStay({
        data: { localizer: code, birthDate, companionKey },
      });
      if (result.access === "granted" && result.reservation) {
        setStay({
          reservation: result.reservation,
          usefulInfoItems: result.usefulInfoItems ?? [],
          successPagePhotoUrl: result.successPagePhotoUrl ?? null,
          inboxEnabled: result.inboxEnabled === true,
        });
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

  const showingStay = stay != null;

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
            {loading ? (
              <div className="flex items-center gap-2 rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
                <Loader2 className="size-4 animate-spin" aria-hidden />
                {t("common.loading")}
              </div>
            ) : pageError === "single" ? (
              <Link to="/$localizer/guest" params={{ localizer: code }} className="text-sm text-primary underline">
                {t("checkin.companions.selfPageTitle")}
              </Link>
            ) : pageError ? (
              <div className="space-y-3">
                <p className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-card">
                  {pageError}
                </p>
                <Link to="/$localizer/guest" params={{ localizer: code }} className="text-sm text-primary underline">
                  {t("common.back")}
                </Link>
              </div>
            ) : (
              <ReaccessIdentityGate
                birthDateInput={birthDateInput}
                birthDateError={birthDateError}
                verifying={verifying}
                onBirthDateChange={(value) => {
                  setBirthDateInput(value);
                  if (birthDateError) setBirthDateError("");
                }}
                onBack={() => {
                  void navigate({ to: "/$localizer/guest", params: { localizer: code } });
                }}
                onContinue={() => void handleVerifyBirthDate()}
                body={t("checkin.companions.selfAccessVerifyBody", { name: companionName })}
              />
            )}
          </div>
        )}
      </main>
    </div>
  );
}
