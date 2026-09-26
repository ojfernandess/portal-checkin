import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ArrowRight, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

import { BrandLogo } from "@/components/BrandLogo";
import { BirthDateInput } from "@/components/checkin/BirthDateInput";
import { CountryFlag } from "@/components/checkin/CountryFlag";
import { CheckinLanding } from "@/components/checkin/CheckinLanding";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { Stepper } from "@/components/checkin/Stepper";
import { ReservationCard } from "@/components/checkin/ReservationCard";
import { GuestForm } from "@/components/checkin/GuestForm";
import { CompanionsStep } from "@/components/checkin/CompanionsStep";
import { EmbraturStep } from "@/components/checkin/EmbraturStep";
import { CameraCapture } from "@/components/checkin/CameraCapture";
import { SelfieCapture, type SelfieValidationOutcome } from "@/components/checkin/SelfieCapture";
import { RegisteredPhotoTile, RegisteredSelfieQualityNotice } from "@/components/checkin/RegisteredPhotoTile";
import { EstablishmentTermsPanel } from "@/components/checkin/EstablishmentTermsPanel";
import { CheckinFinalizingScreen } from "@/components/checkin/CheckinFinalizingScreen";
import { ReaccessIdentityGate } from "@/components/checkin/ReaccessIdentityGate";
import { isEstablishmentNotRegisteredError } from "@/lib/checkin-access";
import { SuccessScreen } from "@/components/checkin/SuccessScreen";
import { ExtraFieldsPanel, validateExtraFields } from "@/components/checkin/ExtraFieldsPanel";
import { cn } from "@/lib/utils";

import {
  findReservation,
  getCompletedCheckinContext,
  getEmbraturReference,
  getEstablishmentContact,
  getEstablishmentExtraFields,
  getEstablishmentSettings,
  getCheckinFaceValidationSettings,
  getEstablishmentTerms,
  getReservationDetails,
  lookupGuest,
  startCheckinSession,
  submitCheckin,
  updateCompanionInboxPhotos,
  uploadCheckinMedia,
  validateCheckinSelfie,
  verifyReaccessBirthDate,
  type CheckinExtraField,
  type CompletedCheckinContext,
} from "@/lib/api/checkin.functions";
import { normalizeEmbratur } from "@/lib/embratur";
import { mergeSuccessReservationFromLocalizer } from "@/lib/api/reservation-normalizer";
import { isAlreadyCheckedIn, type Dependent, type EmbraturForm, type GuestLookup, type MainGuest, type Reservation } from "@/lib/api/types";
import { isValidCpf, isValidEmail, maskCpf } from "@/lib/validators";
import { type TermsSection } from "@/lib/establishment-terms";
import { buildCheckinErrorLabels, splitCheckinErrorMessage } from "@/lib/checkin-error-labels";
import {
  formatCheckinIssues,
  humanizeCheckinApiError,
  validateDependents,
  validateEmbraturForm,
  validateMainGuest,
  validatePhotos,
} from "@/lib/checkin-validation";
import {
  birthDatesMatch,
  DEFAULT_ESTABLISHMENT_SETTINGS,
  type EstablishmentSettings,
} from "@/lib/establishment-settings";
import { useI18n } from "@/lib/i18n/context";
import {
  companionsHaveInboxPhotoUpdates,
} from "@/lib/companion-inbox-photos";
import {
  isDistinctPhotoReference,
  normalizeImageDataUrlToJpeg,
} from "@/lib/checkin-photo-normalize";

export type CheckinPortalProps = {
  initialLocalizer?: string;
  autoSearch?: boolean;
};

const EMPTY_EMBRATUR: EmbraturForm = {
  snmotvia: "",
  sntiptran: "",
  bgstdscpais: "",
  bgstdscpaisdest: "",
  snidcidadeibge: "",
  snidcidadeibgedest: "",
};

type Reference = ReturnType<typeof normalizeEmbratur>;

function isDataUrl(value: string | null | undefined): boolean {
  return !!value?.startsWith("data:");
}

function photosNeedUpload(profile?: string | null, document?: string | null): boolean {
  return isDataUrl(profile) || isDataUrl(document);
}

function registeredDisplayUrl(found: GuestLookup, type: "profile" | "document"): string | null {
  if (type === "profile") {
    return found.profilePhotoDisplayUrl ?? found.profilePhotoUrl ?? null;
  }
  return found.documentPhotoDisplayUrl ?? found.documentPhotoUrl ?? null;
}

function mergeRegisteredPhotos(
  current: MainGuest,
  baseline: {
    profileUrl?: string | null;
    profileId?: string | number;
    documentUrl?: string | null;
    documentId?: string | number;
  },
  replaced: { profile: boolean; document: boolean },
  pending: { profile: string | null; document: string | null },
  uploaded?: {
    profileUrl?: string;
    profileId?: string | number;
    documentUrl?: string;
    documentId?: string | number;
  },
): MainGuest {
  const next = { ...current };

  if (replaced.profile) {
    const url =
      uploaded?.profileUrl ??
      (pending.profile && isDataUrl(pending.profile) ? pending.profile : null) ??
      pending.profile ??
      current.profilePhotoUrl;
    if (url) {
      next.profilePhotoUrl = url;
      if (isDataUrl(url)) {
        next.profilePhotoId = undefined;
      } else if (uploaded?.profileId != null) {
        next.profilePhotoId = uploaded.profileId;
      } else if (baseline.profileUrl && url !== baseline.profileUrl) {
        next.profilePhotoId = undefined;
      }
    }
  } else if (baseline.profileUrl) {
    next.profilePhotoUrl = baseline.profileUrl;
    if (baseline.profileId != null) next.profilePhotoId = baseline.profileId;
  }

  if (replaced.document) {
    const url =
      uploaded?.documentUrl ??
      (pending.document && isDataUrl(pending.document) ? pending.document : null) ??
      pending.document ??
      current.documentPhotoUrl;
    if (url) {
      next.documentPhotoUrl = url;
      if (isDataUrl(url)) {
        next.documentPhotoId = undefined;
      } else if (uploaded?.documentId != null) {
        next.documentPhotoId = uploaded.documentId;
      } else if (baseline.documentUrl && url !== baseline.documentUrl) {
        next.documentPhotoId = undefined;
      }
    }
  } else if (baseline.documentUrl) {
    next.documentPhotoUrl = baseline.documentUrl;
    if (baseline.documentId != null) next.documentPhotoId = baseline.documentId;
  }

  delete next.profilePhotoDisplayUrl;
  delete next.documentPhotoDisplayUrl;

  return next;
}

function stripRegisteredPhotoFields(guest: MainGuest): MainGuest {
  const next = { ...guest };
  delete next.profilePhotoUrl;
  delete next.profilePhotoId;
  delete next.documentPhotoUrl;
  delete next.documentPhotoId;
  delete next.profilePhotoDisplayUrl;
  delete next.documentPhotoDisplayUrl;
  return next;
}

function photoReplacementFlags(
  current: MainGuest,
  baseline: {
    profileUrl?: string | null;
    profileId?: string | number;
    documentUrl?: string | null;
    documentId?: string | number;
  },
  tracked: { profile: boolean; document: boolean },
  pending: { profile: string | null; document: string | null },
): { profile: boolean; document: boolean } {
  return {
    profile:
      tracked.profile ||
      (!!pending.profile && isDataUrl(pending.profile)) ||
      isDistinctPhotoReference(
        pending.profile ?? current.profilePhotoUrl,
        current.profilePhotoId,
        baseline.profileUrl,
        baseline.profileId,
      ),
    document:
      tracked.document ||
      (!!pending.document && isDataUrl(pending.document)) ||
      isDistinctPhotoReference(
        pending.document ?? current.documentPhotoUrl,
        current.documentPhotoId,
        baseline.documentUrl,
        baseline.documentId,
      ),
  };
}

export function CheckinPortal({ initialLocalizer = "", autoSearch = false }: CheckinPortalProps) {
  const { t } = useI18n();

  function showCheckinError(message: string) {
    const { title, description } = splitCheckinErrorMessage(message);
    toast.error(title || t("checkin.errors.apiGeneric"), description ? { description } : undefined);
  }

  function showPhotoUploadError(error: unknown) {
    const labels = buildCheckinErrorLabels(t);
    const message =
      error instanceof Error
        ? humanizeCheckinApiError(error.message, labels)
        : t("checkin.photos.uploadFailed");
    toast.error(message);
  }

  const navigate = useNavigate();
  const find = useServerFn(findReservation);
  const refreshReservation = useServerFn(getReservationDetails);
  const lookup = useServerFn(lookupGuest);
  const loadTerms = useServerFn(getEstablishmentTerms);
  const loadContact = useServerFn(getEstablishmentContact);
  const loadExtraFields = useServerFn(getEstablishmentExtraFields);
  const loadSettings = useServerFn(getEstablishmentSettings);
  const loadFaceValidationSettings = useServerFn(getCheckinFaceValidationSettings);
  const validateSelfieFn = useServerFn(validateCheckinSelfie);
  const upload = useServerFn(uploadCheckinMedia);
  const loadReference = useServerFn(getEmbraturReference);
  const submit = useServerFn(submitCheckin);
  const updateCompanionInboxPhotosFn = useServerFn(updateCompanionInboxPhotos);
  const startSession = useServerFn(startCheckinSession);
  const verifyReaccess = useServerFn(verifyReaccessBirthDate);
  const loadCompletedContext = useServerFn(getCompletedCheckinContext);

  const [step, setStep] = useState(0);
  const [subStep, setSubStep] = useState<
    "lookup" | "verifyBirthDate" | "confirm" | "form" | "companions" | "extra"
  >("lookup");
  const [loading, setLoading] = useState(false);
  const [checkinSessionId, setCheckinSessionId] = useState<string | null>(null);

  const [localizer, setLocalizer] = useState(initialLocalizer.toUpperCase());
  const autoSearchStarted = useRef<string | null>(null);
  const registeredPhotoBaseline = useRef<{
    profileUrl?: string | null;
    profileId?: string | number;
    documentUrl?: string | null;
    documentId?: string | number;
  }>({});
  const photosReplacedRef = useRef({ profile: false, document: false });
  const registeredPhotosActive = useRef(false);
  const uploadedReplacementRef = useRef<{
    profileUrl?: string;
    profileId?: string | number;
    documentUrl?: string;
    documentId?: string | number;
  }>({});

  function rememberRegisteredPhotos(found: GuestLookup) {
    registeredPhotoBaseline.current = {
      profileUrl: found.profilePhotoUrl,
      profileId: found.profilePhotoId,
      documentUrl: found.documentPhotoUrl,
      documentId: found.documentPhotoId,
    };
    registeredPhotosActive.current = true;
    photosReplacedRef.current = { profile: false, document: false };
    uploadedReplacementRef.current = {};
  }

  function clearRegisteredPhotoState() {
    registeredPhotoBaseline.current = {};
    registeredPhotosActive.current = false;
    photosReplacedRef.current = { profile: false, document: false };
    uploadedReplacementRef.current = {};
    setEditRegisteredSelfie(false);
    setEditRegisteredDocPhoto(false);
    setSelfie(null);
    setDocPhoto(null);
  }

  function rememberUploadedReplacement(guest: MainGuest, replaced: { profile: boolean; document: boolean }) {
    const next = { ...uploadedReplacementRef.current };
    if (replaced.profile && guest.profilePhotoUrl && !isDataUrl(guest.profilePhotoUrl)) {
      next.profileUrl = guest.profilePhotoUrl;
      if (guest.profilePhotoId != null) next.profileId = guest.profilePhotoId;
    }
    if (replaced.document && guest.documentPhotoUrl && !isDataUrl(guest.documentPhotoUrl)) {
      next.documentUrl = guest.documentPhotoUrl;
      if (guest.documentPhotoId != null) next.documentId = guest.documentPhotoId;
    }
    uploadedReplacementRef.current = next;
  }

  function buildGuestPhotos(current: MainGuest): MainGuest {
    const pending = { profile: selfie, document: docPhoto };

    if (!registeredPhotosActive.current) {
      const next = stripRegisteredPhotoFields(current);
      if (pending.profile) {
        next.profilePhotoUrl = pending.profile;
        if (isDataUrl(pending.profile)) delete next.profilePhotoId;
      }
      if (pending.document) {
        next.documentPhotoUrl = pending.document;
        if (isDataUrl(pending.document)) delete next.documentPhotoId;
      }
      return next;
    }

    const baseline = registeredPhotoBaseline.current;
    const replaced = photoReplacementFlags(current, baseline, photosReplacedRef.current, pending);
    return mergeRegisteredPhotos(
      current,
      baseline,
      replaced,
      pending,
      uploadedReplacementRef.current,
    );
  }

  function resetRegisteredPhotoEdits(found: GuestLookup) {
    setEditRegisteredSelfie(false);
    setEditRegisteredDocPhoto(false);
    if (reservation?.pmsProvider === "vb") {
      setSelfie(null);
      setDocPhoto(null);
      return;
    }
    setSelfie(registeredDisplayUrl(found, "profile"));
    setDocPhoto(registeredDisplayUrl(found, "document"));
  }

  function handleRegisteredPhotoCapture(type: "profile" | "document", value: string) {
    if (type === "profile") {
      setSelfie(value || null);
      photosReplacedRef.current.profile = !!value && isDataUrl(value);
      return;
    }
    setDocPhoto(value || null);
    photosReplacedRef.current.document = !!value && isDataUrl(value);
  }
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [termsSections, setTermsSections] = useState<TermsSection[]>([]);
  const [termsVersion, setTermsVersion] = useState(0);
  const [supportContact, setSupportContact] = useState<{ phone?: string | null; whatsapp?: string | null }>({});
  const [lookupResult, setLookupResult] = useState<GuestLookup | null>(null);
  const [foreign, setForeign] = useState(false);
  const [document, setDocument] = useState("");
  const [guest, setGuest] = useState<MainGuest>({});
  const [dependents, setDependents] = useState<Dependent[]>([]);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [docPhoto, setDocPhoto] = useState<string | null>(null);
  const [editRegisteredSelfie, setEditRegisteredSelfie] = useState(false);
  const [editRegisteredDocPhoto, setEditRegisteredDocPhoto] = useState(false);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const isVbPmsCheckin = reservation?.pmsProvider === "vb";
  const [reference, setReference] = useState<Reference | null>(null);
  const [embratur, setEmbratur] = useState<EmbraturForm>(EMPTY_EMBRATUR);
  const [extraFields, setExtraFields] = useState<CheckinExtraField[]>([]);
  const [extraFieldValues, setExtraFieldValues] = useState<Record<string, string | boolean>>({});
  const [extraFieldErrors, setExtraFieldErrors] = useState<Record<string, string>>({});
  const [checkinAlreadyDone, setCheckinAlreadyDone] = useState(false);
  const [establishmentSettings, setEstablishmentSettings] = useState<EstablishmentSettings>(
    DEFAULT_ESTABLISHMENT_SETTINGS,
  );
  const [faceValidationEnabled, setFaceValidationEnabled] = useState(false);
  const [birthDateConfirmInput, setBirthDateConfirmInput] = useState("");
  const [birthDateConfirmError, setBirthDateConfirmError] = useState("");
  const [reaccessVerifiedFor, setReaccessVerifiedFor] = useState<string | null>(null);
  const [reaccessSecurityRequired, setReaccessSecurityRequired] = useState(false);
  const [reaccessBirthDateInput, setReaccessBirthDateInput] = useState("");
  const [reaccessBirthDateError, setReaccessBirthDateError] = useState("");
  const [reaccessVerifying, setReaccessVerifying] = useState(false);
  const [addingPostCompanions, setAddingPostCompanions] = useState(false);
  const [postCompanionsSaving, setPostCompanionsSaving] = useState(false);
  const [postCompanionsLockedCount, setPostCompanionsLockedCount] = useState(0);
  const [postCompanionsCanAdd, setPostCompanionsCanAdd] = useState(false);
  const [postCompanionsDraft, setPostCompanionsDraft] = useState<Dependent[]>([]);
  const [postCompanionsContext, setPostCompanionsContext] = useState<CompletedCheckinContext | null>(
    null,
  );
  const [companionInboxPhotoSavingKey, setCompanionInboxPhotoSavingKey] = useState<string | null>(null);
  const successLocalizerRefreshKeyRef = useRef<string | null>(null);
  const dependentsRef = useRef<Dependent[]>([]);

  useEffect(() => {
    dependentsRef.current = dependents;
  }, [dependents]);

  const reservationId = String(reservation?.localizer ?? reservation?.reservationId ?? localizer);
  const guestsQuantity = Math.max(
    1,
    Number(reservation?.stay?.guestsQuantity ?? reservation?.guestsQuantity ?? 1) || 1,
  );
  const hasCompanions = guestsQuantity > 1;

  const exclusiveCameraProps = {
    activeCaptureId: activeCameraId,
    onRequestCapture: (id: string) => setActiveCameraId(id),
    onReleaseCapture: (id: string) => setActiveCameraId((current) => (current === id ? null : current)),
  } as const;

  async function uploadPhotoIfNeeded(
    value: string | null | undefined,
    type: "profile" | "document",
  ): Promise<{ url: string; id?: string | number } | null> {
    if (!value) return null;
    if (!isDataUrl(value)) return { url: value };

    let uploadPayload = value;
    if (reservation?.pmsProvider === "vb") {
      uploadPayload = await normalizeImageDataUrlToJpeg(value);
    }

    const establishmentId = String(reservation?.establishmentId ?? "").trim() || undefined;
    const result = await upload({
      data: {
        reservationId,
        data: uploadPayload,
        type,
        establishmentId,
        localizer: reservation?.localizer ?? reservationId,
        pmsProvider: reservation?.pmsProvider,
      },
    });
    return {
      url:
        (type === "profile" ? result.profilePhotoUrl : result.documentPhotoUrl) ??
        result.url,
      id:
        (type === "profile" ? result.profilePhotoId : result.documentPhotoId) ??
        result.mediaId,
    };
  }

  async function ensureGuestPhotosUploaded(current: MainGuest): Promise<MainGuest> {
    const [profile, document] = await Promise.all([
      uploadPhotoIfNeeded(current.profilePhotoUrl ?? null, "profile"),
      uploadPhotoIfNeeded(current.documentPhotoUrl ?? null, "document"),
    ]);

    const next: MainGuest = { ...current };

    if (profile) {
      if (!profile.url && profile.id == null) {
        throw new Error(t("checkin.photos.uploadFailed"));
      }
      next.profilePhotoUrl = profile.url || (profile.id != null ? String(profile.id) : "");
      if (profile.id != null) next.profilePhotoId = profile.id;
      else if (isDataUrl(current.profilePhotoUrl ?? null)) next.profilePhotoId = undefined;
    }

    if (document) {
      if (!document.url && document.id == null) {
        throw new Error(t("checkin.photos.uploadFailed"));
      }
      next.documentPhotoUrl = document.url || (document.id != null ? String(document.id) : "");
      if (document.id != null) next.documentPhotoId = document.id;
      else if (isDataUrl(current.documentPhotoUrl ?? null)) next.documentPhotoId = undefined;
    }

    delete next.profilePhotoDisplayUrl;
    delete next.documentPhotoDisplayUrl;

    return next;
  }

  async function resolveGuestForSubmit(current: MainGuest): Promise<MainGuest> {
    let merged = buildGuestPhotos(current);
    if (photosNeedUpload(merged.profilePhotoUrl, merged.documentPhotoUrl)) {
      merged = await ensureGuestPhotosUploaded(merged);
      rememberUploadedReplacement(merged, photosReplacedRef.current);
    }
    return merged;
  }

  async function loadEmbraturStep() {
    const raw = await loadReference({
      data: {
        establishmentId:
          reservation?.establishmentId != null
            ? String(reservation.establishmentId)
            : undefined,
      },
    });
    const normalized = normalizeEmbratur(raw);
    setReference(normalized);
    setEmbratur((prev) => ({
      ...prev,
      bgstdscpaisdest:
        prev.bgstdscpaisdest ||
        (normalized.countries.find((option) => option.label.toLowerCase().includes("brasil"))?.value ??
          ""),
      snidcidadeibgedest:
        prev.snidcidadeibgedest ||
        (normalized.cities.find(
          (option) =>
            reservation?.establishment?.city &&
            option.label.toLowerCase().includes(reservation.establishment.city.toLowerCase()),
        )?.value ?? ""),
    }));
    setStep(6);
  }

  async function loadEstablishmentConfig(found: Reservation): Promise<EstablishmentSettings> {
    const establishmentId = String(found.establishmentId ?? "");
    if (!establishmentId) {
      setEstablishmentSettings(DEFAULT_ESTABLISHMENT_SETTINGS);
      setFaceValidationEnabled(false);
      return DEFAULT_ESTABLISHMENT_SETTINGS;
    }
    const [terms, contact, extra, settings, faceValidation] = await Promise.all([
      loadTerms({ data: { establishmentId } }),
      loadContact({ data: { establishmentId } }),
      loadExtraFields({ data: { establishmentId } }),
      loadSettings({ data: { establishmentId } }),
      loadFaceValidationSettings({ data: { establishmentId } }),
    ]);
    setTermsSections(terms.sections);
    setTermsVersion(terms.version);
    setSupportContact(contact);
    setExtraFields(extra.fields);
    setExtraFieldValues({});
    setExtraFieldErrors({});
    setEstablishmentSettings(settings);
    setFaceValidationEnabled(faceValidation.enabled === true);
    return settings;
  }

  async function validateSelfiePhoto(
    photoBase64: string,
    companionGuestId?: string,
  ): Promise<SelfieValidationOutcome> {
    const establishmentId = String(reservation?.establishmentId ?? "").trim();
    if (!establishmentId) {
      return { status: "ERROR", reason: "SERVICE_UNAVAILABLE" };
    }
    const guestId = companionGuestId?.trim() || guest.documentNumber?.trim();
    const result = await validateSelfieFn({
      data: {
        establishmentId,
        imageData: photoBase64,
        ...(checkinSessionId ? { checkinSessionId } : {}),
        ...(guestId ? { guestId: String(guestId) } : {}),
      },
    });
    return {
      status: result.status,
      reason: result.reason,
      maxAttemptsReached: result.maxAttemptsReached,
    };
  }

  function applyReaccessSecurityForLocalizer(
    localizerCode: string,
    settings: EstablishmentSettings,
  ) {
    setReaccessSecurityRequired(settings.requireBirthDateConfirmationOnReaccess);
    setReaccessVerifiedFor(
      settings.requireBirthDateConfirmationOnReaccess ? null : localizerCode,
    );
  }

  async function searchByCode(code: string) {
    const normalized = code.trim().toUpperCase();
    if (normalized.length < 3) return;

    setReaccessVerifiedFor(null);
    setReaccessSecurityRequired(false);
    resetReaccessBirthDateConfirm();
    setLoading(true);
    try {
      const found = await find({ data: { localizer: normalized } });
      if (!found) {
        toast.error(t("checkin.search.notFound"));
        return;
      }
      setReservation(found);
      setLocalizer(normalized);
      const settings = await loadEstablishmentConfig(found);
      if (isAlreadyCheckedIn(found)) {
        setCheckinAlreadyDone(true);
        applyReaccessSecurityForLocalizer(normalized, settings);
        setStep(8);
        void refreshPostCompanionsAvailability(normalized);
      } else {
        setCheckinAlreadyDone(false);
        setReaccessSecurityRequired(false);
        setStep(0);
      }
    } catch (error) {
      toast.error(
        isEstablishmentNotRegisteredError(error)
          ? t("checkin.search.establishmentNotRegistered")
          : error instanceof Error
            ? error.message
            : t("checkin.search.error"),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!autoSearch) return;
    const code = initialLocalizer.trim().toUpperCase();
    if (code.length < 3) return;
    if (autoSearchStarted.current === code) return;
    autoSearchStarted.current = code;
    void searchByCode(code);
  }, [autoSearch, initialLocalizer]);

  useEffect(() => {
    if (step !== 8) {
      successLocalizerRefreshKeyRef.current = null;
      return;
    }

    const code = String(reservation?.localizer ?? localizer).trim().toUpperCase();
    if (code.length < 3) return;

    const refreshKey = `${code}:${checkinAlreadyDone ? "reaccess" : "fresh"}`;
    if (successLocalizerRefreshKeyRef.current === refreshKey) return;
    successLocalizerRefreshKeyRef.current = refreshKey;

    let cancelled = false;
    void (async () => {
      try {
        const refreshed = await refreshReservation({ data: { localizer: code } });
        if (cancelled || !refreshed) return;
        setReservation((current) => mergeSuccessReservationFromLocalizer(current, refreshed));
        await loadEstablishmentConfig(refreshed);
      } catch {
        // Mantém snapshot atual se o refresh falhar.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step, reservation?.localizer, localizer, checkinAlreadyDone]);

  async function handleSearch(event: React.FormEvent) {
    event.preventDefault();
    const code = localizer.trim().toUpperCase();
    if (code.length < 3) return;
    await searchByCode(code);
  }

  function resetToSearch() {
    setStep(0);
    setReservation(null);
    setCheckinSessionId(null);
    setCheckinAlreadyDone(false);
    setReaccessVerifiedFor(null);
    setReaccessSecurityRequired(false);
    resetReaccessBirthDateConfirm();
    resetPostCompanionsEditor();
    setPostCompanionsCanAdd(false);
    setLocalizer("");
    autoSearchStarted.current = null;
    void navigate({ to: "/" });
  }

  async function beginCheckinFlow() {
    if (!reservation) {
      setStep(1);
      return;
    }

    const code = String(reservation.localizer ?? localizer).trim().toUpperCase();
    const reservationId = reservation.reservationId != null ? String(reservation.reservationId) : undefined;
    const establishmentId =
      reservation.establishmentId != null ? String(reservation.establishmentId) : undefined;

    try {
      const result = await startSession({
        data: {
          localizer: code,
          ...(reservationId ? { reservationId } : {}),
          ...(establishmentId ? { establishmentId } : {}),
        },
      });
      setCheckinSessionId(result.sessionId);
    } catch {
      setCheckinSessionId(null);
    }

    setStep(1);
  }

  function resetReaccessBirthDateConfirm() {
    setReaccessBirthDateInput("");
    setReaccessBirthDateError("");
  }

  function resetBirthDateConfirm() {
    setBirthDateConfirmInput("");
    setBirthDateConfirmError("");
  }

  function needsBirthDateVerification(found: GuestLookup): boolean {
    return (
      establishmentSettings.requireBirthDateConfirmation && !!found.birthDate?.trim()
    );
  }

  function afterLookupFound(found: GuestLookup, fallbackGuest: MainGuest) {
    setLookupResult(found);
    resetBirthDateConfirm();
    if (needsBirthDateVerification(found)) {
      clearRegisteredPhotoState();
      setGuest(stripRegisteredPhotoFields(fallbackGuest));
      setSubStep("verifyBirthDate");
      return;
    }
    if (found.profilePhotoUrl?.trim() || found.documentPhotoUrl?.trim()) {
      rememberRegisteredPhotos(found);
      resetRegisteredPhotoEdits(found);
    } else {
      clearRegisteredPhotoState();
    }
    setGuest(found);
    setSubStep("confirm");
  }

  function handleVerifyBirthDate() {
    if (!lookupResult) return;
    if (!birthDateConfirmInput.trim()) {
      setBirthDateConfirmError(t("checkin.lookup.birthDateRequired"));
      return;
    }
    if (!birthDatesMatch(lookupResult.birthDate, birthDateConfirmInput)) {
      setBirthDateConfirmError(t("checkin.lookup.birthDateMismatch"));
      return;
    }
    setBirthDateConfirmError("");
    if (lookupResult.profilePhotoUrl?.trim() || lookupResult.documentPhotoUrl?.trim()) {
      rememberRegisteredPhotos(lookupResult);
      resetRegisteredPhotoEdits(lookupResult);
    } else {
      clearRegisteredPhotoState();
    }
    setGuest(lookupResult);
    setSubStep("confirm");
  }

  function backFromVerifyBirthDate() {
    resetBirthDateConfirm();
    setLookupResult(null);
    clearRegisteredPhotoState();
    setSubStep("lookup");
  }

  async function handleVerifyReaccessBirthDate() {
    if (!reaccessBirthDateInput.trim()) {
      setReaccessBirthDateError(t("checkin.lookup.birthDateRequired"));
      return;
    }
    const establishmentId = String(reservation?.establishmentId ?? "");
    const code = String(reservation?.localizer ?? localizer).trim().toUpperCase();
    if (!establishmentId || code.length < 3) {
      setReaccessBirthDateError(t("checkin.reaccess.verifyFailed"));
      return;
    }

    setReaccessVerifying(true);
    setReaccessBirthDateError("");
    try {
      const result = await verifyReaccess({
        data: {
          localizer: code,
          establishmentId,
          birthDate: reaccessBirthDateInput,
        },
      });
      if (!result.ok) {
        setReaccessBirthDateError(
          result.unavailable
            ? t("checkin.reaccess.unavailable")
            : t("checkin.lookup.birthDateMismatch"),
        );
        return;
      }
      setReaccessVerifiedFor(code);
      resetReaccessBirthDateConfirm();
    } catch {
      setReaccessBirthDateError(t("checkin.reaccess.verifyFailed"));
    } finally {
      setReaccessVerifying(false);
    }
  }

  function backFromReaccessVerify() {
    resetReaccessBirthDateConfirm();
    resetToSearch();
  }

  async function handleLookup() {
    const establishmentId = String(reservation?.establishmentId ?? "").trim() || undefined;

    if (foreign) {
      const email = document.trim().toLowerCase();
      if (!isValidEmail(email)) {
        toast.error(t("checkin.lookup.invalidEmail"));
        return;
      }
      setLoading(true);
      try {
        const found = await lookup({ data: { email, establishmentId } });
        if (found) {
          afterLookupFound(found, { email });
        } else {
          clearRegisteredPhotoState();
          setGuest(stripRegisteredPhotoFields({ email }));
          setLookupResult(null);
          resetBirthDateConfirm();
          setSubStep("form");
        }
      } catch {
        clearRegisteredPhotoState();
        setGuest(stripRegisteredPhotoFields({ email }));
        setLookupResult(null);
        resetBirthDateConfirm();
        setSubStep("form");
      } finally {
        setLoading(false);
      }
      return;
    }

    const value = document;
    if (!isValidCpf(value)) {
      toast.error(t("checkin.lookup.invalidCpf"));
      return;
    }
    setLoading(true);
    try {
      const found = await lookup({
        data: { documentNumber: value.replace(/\D/g, ""), establishmentId },
      });
      const fallbackGuest = {
        documentNumber: value.replace(/\D/g, ""),
        documentType: "CPF" as const,
      };
      if (found) {
        afterLookupFound(found, fallbackGuest);
      } else {
        clearRegisteredPhotoState();
        setGuest(stripRegisteredPhotoFields(fallbackGuest));
        setLookupResult(null);
        resetBirthDateConfirm();
        setSubStep("form");
      }
    } catch {
      clearRegisteredPhotoState();
      setGuest(
        stripRegisteredPhotoFields({
          documentNumber: value.replace(/\D/g, ""),
          documentType: "CPF",
        }),
      );
      setLookupResult(null);
      resetBirthDateConfirm();
      setSubStep("form");
    } finally {
      setLoading(false);
    }
  }

  async function proceedAfterGuestData(currentGuest?: MainGuest) {
    let current = buildGuestPhotos(currentGuest ?? guest);
    const profile = current.profilePhotoUrl;
    const documentPhoto = current.documentPhotoUrl;

    if (photosNeedUpload(profile, documentPhoto)) {
      setLoading(true);
      try {
        const uploaded = await ensureGuestPhotosUploaded(current);
        rememberUploadedReplacement(uploaded, photosReplacedRef.current);
        setGuest(uploaded);
        setSelfie(uploaded.profilePhotoUrl ?? null);
        setDocPhoto(uploaded.documentPhotoUrl ?? null);
        await loadEmbraturStep();
      } catch (error) {
        showPhotoUploadError(error);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (profile && documentPhoto) {
      setLoading(true);
      try {
        await loadEmbraturStep();
      } finally {
        setLoading(false);
      }
      return;
    }

    setSelfie(profile ?? null);
    setDocPhoto(documentPhoto ?? null);
    setStep(5);
  }

  async function goToPhotosOrEmbratur(nextGuest?: MainGuest) {
    const merged = nextGuest ?? guest;
    if (nextGuest) setGuest(nextGuest);
    if (extraFields.length > 0) {
      setSubStep("extra");
      return;
    }
    await proceedAfterGuestData(merged);
  }

  function handleExtraFieldsContinue() {
    const errors = validateExtraFields(extraFields, extraFieldValues, t("errors.requiredField"));
    setExtraFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const missing = extraFields
        .filter((field) => errors[field.id])
        .map((field) => field.label)
        .join(", ");
      showCheckinError(
        `${t("checkin.extraFields.requiredError")}\n${t("checkin.errors.stepLine", {
          step: t("checkin.errors.steps.extra"),
          fields: missing,
        })}`,
      );
      return;
    }
    void proceedAfterGuestData(guest);
  }

  async function handlePhotos() {
    const labels = buildCheckinErrorLabels(t);
    const photoIssues = validatePhotos(selfie, docPhoto);
    if (photoIssues.length > 0) {
      showCheckinError(formatCheckinIssues(photoIssues, labels));
      return;
    }
    setLoading(true);
    try {
      const merged = buildGuestPhotos({
        ...guest,
        profilePhotoUrl: selfie ?? undefined,
        documentPhotoUrl: docPhoto ?? undefined,
      });
      const replacementFlags = photoReplacementFlags(
        merged,
        registeredPhotoBaseline.current,
        photosReplacedRef.current,
        { profile: selfie, document: docPhoto },
      );
      const uploaded = photosNeedUpload(merged.profilePhotoUrl, merged.documentPhotoUrl)
        ? await ensureGuestPhotosUploaded(merged)
        : merged;
      rememberUploadedReplacement(uploaded, replacementFlags);
      setGuest(uploaded);
      setSelfie(uploaded.profilePhotoUrl ?? null);
      setDocPhoto(uploaded.documentPhotoUrl ?? null);
      await loadEmbraturStep();
    } catch (error) {
      showPhotoUploadError(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleConfirmLookup() {
    if (!lookupResult) return;

    if (isVbPmsCheckin) {
      setGuest(stripRegisteredPhotoFields({ ...lookupResult }));
      clearRegisteredPhotoState();
      setSelfie(null);
      setDocPhoto(null);
      setEditRegisteredSelfie(false);
      setEditRegisteredDocPhoto(false);
      setSubStep("form");
      return;
    }

    const profileDisplayUrl = registeredDisplayUrl(lookupResult, "profile");
    const documentDisplayUrl = registeredDisplayUrl(lookupResult, "document");
    const profileReplaced = photosReplacedRef.current.profile;
    const documentReplaced = photosReplacedRef.current.document;

    let nextGuest = buildGuestPhotos(lookupResult);

    setLoading(true);
    try {
      if (photosNeedUpload(nextGuest.profilePhotoUrl, nextGuest.documentPhotoUrl)) {
        nextGuest = await ensureGuestPhotosUploaded(nextGuest);
        rememberUploadedReplacement(nextGuest, photosReplacedRef.current);
      }
      setGuest(nextGuest);
      setSelfie(
        profileReplaced
          ? (nextGuest.profilePhotoUrl ?? null)
          : (profileDisplayUrl ?? nextGuest.profilePhotoUrl ?? null),
      );
      setDocPhoto(
        documentReplaced
          ? (nextGuest.documentPhotoUrl ?? null)
          : (documentDisplayUrl ?? nextGuest.documentPhotoUrl ?? null),
      );
      setEditRegisteredSelfie(false);
      setEditRegisteredDocPhoto(false);
      setSubStep("form");
    } catch (error) {
      showPhotoUploadError(error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit() {
    const labels = buildCheckinErrorLabels(t);
    const companionsForSubmit = dependentsRef.current;
    const issues = [
      ...validateMainGuest(guest, { foreign }),
      ...validateDependents(companionsForSubmit, guest),
      ...validateEmbraturForm(embratur),
      ...validatePhotos(guest.profilePhotoUrl ?? selfie, guest.documentPhotoUrl ?? docPhoto),
    ];
    if (issues.length > 0) {
      showCheckinError(formatCheckinIssues(issues, labels));
      return;
    }

    setLoading(true);
    let checkinResult: Record<string, unknown> | null = null;
    let mainGuest = guest;
    const submittedDependents = dependentsRef.current;
    try {
      mainGuest = await resolveGuestForSubmit(guest);
      setGuest(mainGuest);
      setDependents(submittedDependents);
      setSelfie(mainGuest.profilePhotoUrl ?? null);
      setDocPhoto(mainGuest.documentPhotoUrl ?? null);

      const replacementFlags = photoReplacementFlags(
        mainGuest,
        registeredPhotoBaseline.current,
        photosReplacedRef.current,
        { profile: selfie, document: docPhoto },
      );

      checkinResult = await submit({
        data: {
          reservationId,
          localizer: String(reservation?.localizer ?? localizer).trim().toUpperCase(),
          establishmentId: String(reservation?.establishmentId ?? ""),
          establishmentName: reservation?.establishmentName,
          reservationSnapshot: reservation ?? undefined,
          mainGuest: mainGuest as Record<string, unknown>,
          registeredPhotos: {
            ...(registeredPhotoBaseline.current.profileUrl
              ? { profileUrl: registeredPhotoBaseline.current.profileUrl }
              : {}),
            ...(registeredPhotoBaseline.current.profileId != null
              ? { profileId: registeredPhotoBaseline.current.profileId }
              : {}),
            ...(registeredPhotoBaseline.current.documentUrl
              ? { documentUrl: registeredPhotoBaseline.current.documentUrl }
              : {}),
            ...(registeredPhotoBaseline.current.documentId != null
              ? { documentId: registeredPhotoBaseline.current.documentId }
              : {}),
          },
          photosReplaced: replacementFlags,
          embratur: embratur as unknown as Record<string, unknown>,
          dependents: submittedDependents as unknown as Record<string, unknown>[],
          termsAcceptedAt: termsAcceptedAt ?? undefined,
          termsVersion: termsVersion || undefined,
          ...(checkinSessionId ? { checkinSessionId } : {}),
          extraFields: extraFieldValues,
        },
      });
    } catch (error) {
      if (isEstablishmentNotRegisteredError(error)) {
        showCheckinError(t("checkin.search.establishmentNotRegistered"));
        setLoading(false);
        return;
      }
      const labels = buildCheckinErrorLabels(t);
      const message =
        error instanceof Error
          ? humanizeCheckinApiError(error.message, labels)
          : t("checkin.success.submitFailed");
      showCheckinError(message);
      setLoading(false);
      return;
    }

    setLoading(false);
    setStep(7);

    const code = String(reservation?.localizer ?? localizer).trim().toUpperCase();
    const prior = reservation;
    try {
      const refreshed = await refreshReservation({ data: { localizer: code } });
      if (refreshed) {
        const successReservation = mergeSuccessReservationFromLocalizer(
          prior ?? refreshed,
          refreshed,
          checkinResult,
          { dependents: submittedDependents },
        );
        setReservation(successReservation);
        await loadEstablishmentConfig(successReservation);
      } else if (prior) {
        setReservation(
          mergeSuccessReservationFromLocalizer(prior, prior, checkinResult, {
            dependents: submittedDependents,
          }),
        );
      }
    } catch {
      if (prior) {
        setReservation(
          mergeSuccessReservationFromLocalizer(prior, prior, checkinResult, {
            dependents: submittedDependents,
          }),
        );
      }
    }

    setCheckinAlreadyDone(false);
    setReaccessSecurityRequired(false);
    setReaccessVerifiedFor(String(reservation?.localizer ?? localizer).trim().toUpperCase());
    setStep(8);
    void refreshPostCompanionsAvailability(String(reservation?.localizer ?? localizer).trim().toUpperCase());
  }

  function successReservation(): Reservation | null {
    if (!reservation) return null;
    return {
      ...reservation,
      establishment: {
        ...reservation.establishment,
        ...(supportContact.phone
          ? { phone: supportContact.phone }
          : reservation.establishment?.phone
            ? { phone: reservation.establishment.phone }
            : {}),
        ...(supportContact.whatsapp
          ? { whatsapp: supportContact.whatsapp }
          : reservation.establishment?.whatsapp
            ? { whatsapp: reservation.establishment.whatsapp }
            : {}),
      },
    };
  }

  function resetPostCompanionsEditor() {
    setAddingPostCompanions(false);
    setPostCompanionsSaving(false);
    setPostCompanionsDraft([]);
    setPostCompanionsLockedCount(0);
    setPostCompanionsContext(null);
  }

  async function refreshPostCompanionsAvailability(code?: string) {
    const localizerCode = String(code ?? reservation?.localizer ?? localizer)
      .trim()
      .toUpperCase();
    if (localizerCode.length < 3) {
      setPostCompanionsCanAdd(false);
      return;
    }
    try {
      const ctx = await loadCompletedContext({ data: { localizer: localizerCode } });
      setPostCompanionsContext(ctx);
      setPostCompanionsCanAdd(ctx.canAdd);
      if (!addingPostCompanions) {
        setPostCompanionsLockedCount(ctx.dependents.length);
        if (ctx.dependents.length > 0) {
          setDependents(ctx.dependents);
        }
        if (ctx.mainGuest.name) setGuest(ctx.mainGuest);
        if (ctx.embratur) setEmbratur(ctx.embratur);
      }
    } catch {
      setPostCompanionsCanAdd(false);
    }
  }

  async function startAddPostCompanions() {
    const localizerCode = String(reservation?.localizer ?? localizer).trim().toUpperCase();
    setLoading(true);
    try {
      const ctx = await loadCompletedContext({ data: { localizer: localizerCode } });
      setPostCompanionsContext(ctx);
      if (ctx.blockedReason === "cancelled" || ctx.blockedReason === "pending_cancellation") {
        toast.error(t("checkin.companions.postBlockedCancelled"));
        setPostCompanionsCanAdd(false);
        return;
      }
      if (ctx.blockedReason === "no_slots") {
        toast.error(t("checkin.companions.postNoSlots"));
        setPostCompanionsCanAdd(false);
        return;
      }
      if (!ctx.canAdd) {
        toast.error(t("checkin.companions.postNoSlots"));
        setPostCompanionsCanAdd(false);
        return;
      }
      if (!ctx.contextComplete || !ctx.embratur) {
        toast.error(t("checkin.companions.postIncompleteContext"));
        return;
      }
      setGuest(ctx.mainGuest);
      setEmbratur(ctx.embratur);
      setPostCompanionsLockedCount(ctx.dependents.length);
      setPostCompanionsDraft(ctx.dependents);
      setDependents(ctx.dependents);
      setPostCompanionsCanAdd(true);
      setAddingPostCompanions(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("checkin.companions.postLoadFailed"));
    } finally {
      setLoading(false);
    }
  }

  async function saveCompanionInboxPhoto(
    companion: Dependent,
    photoBase64: string,
    companionKey?: string,
  ) {
    if (!reservation) return;
    const establishmentId = String(reservation.establishmentId ?? "").trim();
    if (!establishmentId) {
      toast.error(t("checkin.companions.inboxPhotoSaveFailed"));
      return;
    }

    const key = companionKey ?? `${companion.documentNumber || companion.name}`;
    const currentDependents =
      dependents.length > 0 ? dependents : (reservation.dependents ?? []);
    const nextDependents = currentDependents.map((dependent) => {
      const sameDocument =
        dependent.documentNumber?.trim() &&
        companion.documentNumber?.trim() &&
        dependent.documentNumber.trim() === companion.documentNumber.trim();
      const sameName =
        dependent.name?.trim().toLowerCase() === companion.name?.trim().toLowerCase();
      if (!sameDocument && !sameName) return dependent;
      return { ...dependent, profilePhotoUrl: photoBase64 };
    });

    setCompanionInboxPhotoSavingKey(key);
    try {
      const result = await updateCompanionInboxPhotosFn({
        data: {
          localizer: String(reservation.localizer ?? localizer).trim().toUpperCase(),
          establishmentId,
          dependents: nextDependents as unknown as Record<string, unknown>[],
        },
      });
      const savedDependents = result.dependents ?? nextDependents;
      setDependents(savedDependents);
      setPostCompanionsDraft(savedDependents);
      setReservation((current) =>
        current ? { ...current, dependents: savedDependents } : current,
      );
      toast.success(t("checkin.companions.inboxPhotoSaved"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("checkin.companions.inboxPhotoSaveFailed"),
      );
    } finally {
      setCompanionInboxPhotoSavingKey(null);
    }
  }

  async function savePostCompanions(companionsOverride?: Dependent[]) {
    if (!reservation || !postCompanionsContext?.embratur) return;
    const companionsToSave = companionsOverride ?? postCompanionsDraft;
    const hasNewCompanions = companionsToSave.length > postCompanionsLockedCount;
    const hasPhotoUpdates = companionsHaveInboxPhotoUpdates(
      companionsToSave,
      postCompanionsContext.dependents,
    );

    if (!hasNewCompanions && !hasPhotoUpdates) {
      toast.error(t("checkin.companions.postNeedNewOrPhoto"));
      return;
    }

    const labels = buildCheckinErrorLabels(t);
    const mainGuest = postCompanionsContext.mainGuest;

    if (hasNewCompanions) {
      const issues = validateDependents(companionsToSave, mainGuest);
      if (issues.length > 0) {
        showCheckinError(formatCheckinIssues(issues, labels));
        return;
      }
    }

    setPostCompanionsSaving(true);
    try {
      if (hasNewCompanions) {
        await submit({
          data: {
            reservationId,
            localizer: String(reservation.localizer ?? localizer).trim().toUpperCase(),
            establishmentId: String(reservation.establishmentId ?? ""),
            establishmentName: reservation.establishmentName,
            reservationSnapshot: reservation,
            mainGuest: mainGuest as Record<string, unknown>,
            embratur: postCompanionsContext.embratur as unknown as Record<string, unknown>,
            dependents: companionsToSave as unknown as Record<string, unknown>[],
            purpose: "companions",
          },
        });
      } else if (hasPhotoUpdates && establishmentSettings.inboxEnabled) {
        await updateCompanionInboxPhotosFn({
          data: {
            localizer: String(reservation.localizer ?? localizer).trim().toUpperCase(),
            establishmentId: String(reservation.establishmentId ?? ""),
            dependents: companionsToSave as unknown as Record<string, unknown>[],
          },
        });
      }

      const code = String(reservation.localizer ?? localizer).trim().toUpperCase();
      const refreshed = await refreshReservation({ data: { localizer: code } });
      if (refreshed) {
        setReservation(
          mergeSuccessReservationFromLocalizer(reservation, refreshed, undefined, {
            dependents: companionsToSave,
          }),
        );
      }
      setDependents(companionsToSave);
      setPostCompanionsDraft(companionsToSave);
      setGuest(mainGuest);
      setEmbratur(postCompanionsContext.embratur);
      resetPostCompanionsEditor();
      toast.success(
        hasNewCompanions
          ? t("checkin.companions.postSaved")
          : t("checkin.companions.inboxPhotoSaved"),
      );
      void refreshPostCompanionsAvailability(code);
    } catch (error) {
      const message =
        error instanceof Error
          ? humanizeCheckinApiError(error.message, labels)
          : t("checkin.companions.postSaveFailed");
      showCheckinError(message);
    } finally {
      setPostCompanionsSaving(false);
    }
  }

  if (step === 0) {
    const reservationContent =
      reservation && !isAlreadyCheckedIn(reservation) ? (
        <section className="space-y-5 animate-step-in">
          <header className="space-y-2 text-center lg:text-left">
            <h2 className="font-display text-2xl text-foreground">{t("checkin.landing.formTitle")}</h2>
            <p className="text-sm text-muted-foreground">{t("checkin.search.body")}</p>
          </header>

          <ReservationCard reservation={reservation} />

          {reservation.isCancelled ? (
            <Notice tone="error" text={t("checkin.search.cancelled")} />
          ) : reservation.isPendingCancellation ? (
            <Notice tone="warning" text={t("checkin.search.pendingCancel")} />
          ) : (
            <Button className="tap-safe h-14 w-full text-base" onClick={() => void beginCheckinFlow()}>
              {t("checkin.search.start")} <ArrowRight className="size-5" aria-hidden />
            </Button>
          )}

          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setReservation(null);
              setLocalizer("");
              setCheckinSessionId(null);
              setReaccessVerifiedFor(null);
              setReaccessSecurityRequired(false);
              resetReaccessBirthDateConfirm();
            }}
          >
            {t("checkin.search.another")}
          </Button>
        </section>
      ) : undefined;

    return (
      <CheckinLanding
        localizer={localizer}
        loading={loading}
        onLocalizerChange={setLocalizer}
        onSubmit={handleSearch}
      >
        {reservationContent}
      </CheckinLanding>
    );
  }

  return (
    <div className={cn("min-h-screen pb-16", step === 8 ? "bg-[#F7F8FA]" : "bg-background")}>
      <header
        className={cn(
          "border-b border-border bg-primary text-primary-foreground",
          step === 8 ? "py-2.5 shadow-sm" : "py-4",
        )}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-4",
            step === 8 ? "success-page-shell" : "page-shell",
          )}
        >
          <BrandLogo className={cn("shrink-0", step === 8 ? "max-h-9 sm:max-h-10" : "max-h-12 sm:max-h-14")} />
          <div className={cn("min-w-0 flex-1 text-center", step === 8 ? "block" : "hidden sm:block")}>
            <p
              className={cn(
                "truncate font-sans font-semibold tracking-tight",
                step === 8 ? "text-sm sm:text-base" : "font-display text-lg tracking-wide",
              )}
            >
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

      {step > 0 && step < 7 && <Stepper current={step} />}

      <main className={cn("app-container py-7", step === 8 ? "success-page-shell" : "page-shell")}>
        <div key={`${step}-${subStep}`} className="animate-step-in">
          {step === 1 && reservation && (
            <section className="space-y-5">
              {reservation.isCancelled ? (
                <Notice tone="error" text={t("checkin.search.cancelled")} />
              ) : reservation.isPendingCancellation ? (
                <Notice tone="warning" text={t("checkin.search.pendingCancel")} />
              ) : (
                <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
                  <h2 className="font-display text-lg">{t("checkin.confirmation.title")}</h2>
                  <p className="text-sm text-muted-foreground">
                    {t("checkin.confirmation.bodyPrefix")}{" "}
                    <strong className="text-foreground">
                      {reservation.responsible?.name ?? reservation.mainGuest?.name ?? "—"}
                    </strong>
                    .
                  </p>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t("checkin.confirmation.bodyHint")}
                  </p>
                  <Button className="tap-safe w-full" onClick={() => setStep(2)}>
                    {t("checkin.confirmation.yes")} <ArrowRight className="size-4" aria-hidden />
                  </Button>
                  <Button
                    variant="outline"
                    className="tap-safe w-full"
                    onClick={() => toast.info(t("checkin.confirmation.onlyMainGuest"))}
                  >
                    {t("checkin.confirmation.no")}
                  </Button>
                </div>
              )}

              <Button variant="ghost" className="w-full" onClick={() => setStep(0)}>
                {t("common.back")}
              </Button>
            </section>
          )}

          {step === 2 && (
            <section className="space-y-5">
              <header className="space-y-1">
                <h2 className="font-display text-2xl">{t("checkin.terms.title")}</h2>
                <p className="text-sm text-muted-foreground">{reservation?.establishmentName}</p>
              </header>
              <EstablishmentTermsPanel sections={termsSections} />
              <label className="flex items-start gap-3 rounded-xl border border-border bg-card p-4">
                <Checkbox
                  checked={termsChecked}
                  onCheckedChange={(checked) => setTermsChecked(checked === true)}
                  aria-label={t("checkin.terms.acceptAria")}
                />
                <span className="text-sm">{t("checkin.terms.acceptLabel")}</span>
              </label>
              <div className="flex gap-3">
                <Button variant="outline" className="tap-safe" onClick={() => setStep(1)}>
                  {t("common.back")}
                </Button>
                <Button
                  className="tap-safe flex-1"
                  disabled={!termsChecked}
                  onClick={() => {
                    setTermsAcceptedAt(new Date().toISOString());
                    setStep(3);
                  }}
                >
                  {t("common.continue")}
                </Button>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="space-y-5">
              <header className="space-y-1">
                <h2 className="font-display text-2xl">{t("checkin.nationality.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("checkin.nationality.body")}</p>
              </header>
              <div className="grid gap-3">
                <Button
                  variant="outline"
                  className="tap-safe h-16 items-center justify-start text-base"
                  onClick={() => {
                    setForeign(false);
                    setDocument("");
                    setLookupResult(null);
                    clearRegisteredPhotoState();
                    setSubStep("lookup");
                    setStep(4);
                  }}
                >
                  <CountryFlag iso="BR" size="md" className="mr-3" />
                  {t("checkin.nationality.brazilian")}
                </Button>
                <Button
                  variant="outline"
                  className="tap-safe h-16 items-center justify-start text-base"
                  onClick={() => {
                    setForeign(true);
                    setDocument("");
                    setLookupResult(null);
                    clearRegisteredPhotoState();
                    setSubStep("lookup");
                    setStep(4);
                  }}
                >
                  <span className="mr-2 text-2xl" aria-hidden>
                    🌍
                  </span>
                  {t("checkin.nationality.foreign")}
                </Button>
              </div>
              <Button variant="ghost" className="w-full" onClick={() => setStep(2)}>
                {t("common.back")}
              </Button>
            </section>
          )}

          {step === 4 && subStep === "verifyBirthDate" && lookupResult && (
            <section className="space-y-5">
              <header className="space-y-1">
                <h2 className="font-display text-2xl">{t("checkin.lookup.birthDateVerifyTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("checkin.lookup.birthDateVerifyBody")}</p>
              </header>

              <article className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="space-y-1.5">
                  <Label htmlFor="birthDateVerify">{t("checkin.lookup.birthDateConfirmLabel")}</Label>
                  <BirthDateInput
                    id="birthDateVerify"
                    value={birthDateConfirmInput}
                    onChange={(value) => {
                      setBirthDateConfirmInput(value);
                      if (birthDateConfirmError) setBirthDateConfirmError("");
                    }}
                    aria-invalid={Boolean(birthDateConfirmError)}
                    placeholder={t("guest.birthDatePlaceholder")}
                  />
                  <p className="text-xs text-muted-foreground">{t("checkin.lookup.birthDateConfirmHint")}</p>
                  {birthDateConfirmError ? (
                    <p className="text-xs text-destructive">{birthDateConfirmError}</p>
                  ) : null}
                </div>
              </article>

              <div className="flex gap-3">
                <Button variant="outline" className="tap-safe" onClick={backFromVerifyBirthDate}>
                  {t("common.back")}
                </Button>
                <Button
                  className="tap-safe flex-1"
                  disabled={!birthDateConfirmInput.trim()}
                  onClick={handleVerifyBirthDate}
                >
                  {t("common.continue")}
                </Button>
              </div>
            </section>
          )}

          {step === 4 && subStep === "confirm" && lookupResult && (
            <section className="space-y-5">
              <header className="space-y-1">
                <h2 className="font-display text-2xl">{t("checkin.lookup.foundTitle")}</h2>
                <p className="text-sm text-muted-foreground">
                  {isVbPmsCheckin ? t("checkin.lookup.foundBodyVb") : t("checkin.lookup.foundBody")}
                </p>
              </header>

              <article className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
                <div className="space-y-1">
                  <p className="font-medium">{lookupResult.name}</p>
                  <p className="text-sm text-muted-foreground">{lookupResult.email}</p>
                  <p className="text-sm text-muted-foreground">{lookupResult.mobilePhoneNumber}</p>
                  <p className="font-code text-sm">{lookupResult.documentNumber}</p>
                </div>

                {isVbPmsCheckin ? (
                  <p className="border-t border-border pt-4 text-sm text-muted-foreground">
                    {t("checkin.lookup.foundPhotosRequiredLater")}
                  </p>
                ) : (
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="grid grid-cols-2 gap-3">
                    <RegisteredPhotoTile
                      title={t("checkin.photos.selfie")}
                      photoType="profile"
                      label={t("checkin.photos.selfieHint")}
                      registeredUrl={registeredDisplayUrl(lookupResult, "profile")}
                      mediaId={lookupResult.profilePhotoId}
                      facingMode="user"
                      editing={editRegisteredSelfie}
                      editValue={selfie}
                      captureId="registered-selfie"
                      {...exclusiveCameraProps}
                      onStartEdit={(resolvedUrl) => {
                        setEditRegisteredSelfie(true);
                        setSelfie(resolvedUrl ?? registeredDisplayUrl(lookupResult, "profile"));
                      }}
                      onCancelEdit={() => {
                        setEditRegisteredSelfie(false);
                        photosReplacedRef.current.profile = false;
                        setSelfie(registeredDisplayUrl(lookupResult, "profile"));
                      }}
                      onCapture={(value) => handleRegisteredPhotoCapture("profile", value)}
                      validationEnabled={faceValidationEnabled}
                      onValidateSelfie={validateSelfiePhoto}
                    />
                    <RegisteredPhotoTile
                      title={t("checkin.photos.document")}
                      photoType="document"
                      label={t("checkin.photos.documentHint")}
                      registeredUrl={registeredDisplayUrl(lookupResult, "document")}
                      mediaId={lookupResult.documentPhotoId}
                      facingMode="environment"
                      editing={editRegisteredDocPhoto}
                      editValue={docPhoto}
                      captureId="registered-document"
                      {...exclusiveCameraProps}
                      onStartEdit={(resolvedUrl) => {
                        setEditRegisteredDocPhoto(true);
                        setDocPhoto(resolvedUrl ?? registeredDisplayUrl(lookupResult, "document"));
                      }}
                      onCancelEdit={() => {
                        setEditRegisteredDocPhoto(false);
                        photosReplacedRef.current.document = false;
                        setDocPhoto(registeredDisplayUrl(lookupResult, "document"));
                      }}
                      onCapture={(value) => handleRegisteredPhotoCapture("document", value)}
                    />
                  </div>
                  <RegisteredSelfieQualityNotice />
                </div>
                )}
              </article>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="tap-safe"
                  onClick={() => {
                    setLookupResult(null);
                    clearRegisteredPhotoState();
                    setSubStep("lookup");
                  }}
                >
                  {t("common.back")}
                </Button>
                <Button
                  className="tap-safe flex-1"
                  disabled={loading}
                  onClick={() => void handleConfirmLookup()}
                >
                  {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}{" "}
                  {t("checkin.lookup.confirm")}
                </Button>
              </div>
            </section>
          )}

          {step === 4 && subStep === "lookup" && (
            <section className="space-y-5">
              <header className="space-y-1">
                <h2 className="font-display text-2xl">
                  {foreign ? t("checkin.lookup.emailTitle") : t("checkin.lookup.cpfTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {foreign ? t("checkin.lookup.bodyForeign") : t("checkin.lookup.body")}
                </p>
              </header>
              <div className="space-y-1.5">
                <Label htmlFor="doc">
                  {foreign ? t("checkin.lookup.emailLabel") : t("checkin.lookup.cpfLabel")}
                </Label>
                <Input
                  id="doc"
                  className="tap-safe h-14 font-code text-lg"
                  type={foreign ? "email" : "text"}
                  inputMode={foreign ? "email" : "numeric"}
                  autoComplete={foreign ? "email" : "off"}
                  value={document}
                  placeholder={
                    foreign ? t("checkin.lookup.emailPlaceholder") : t("checkin.lookup.cpfPlaceholder")
                  }
                  onChange={(event) =>
                    setDocument(foreign ? event.target.value : maskCpf(event.target.value))
                  }
                />
              </div>
              <div className="flex gap-3">
                <Button variant="outline" className="tap-safe" onClick={() => setStep(3)}>
                  {t("common.back")}
                </Button>
                <Button className="tap-safe flex-1" disabled={loading} onClick={() => void handleLookup()}>
                  {loading && <Loader2 className="size-4 animate-spin" aria-hidden />} {t("checkin.lookup.verify")}
                </Button>
              </div>
            </section>
          )}

          {step === 4 && subStep === "form" && (
            <GuestForm
              foreign={foreign}
              initial={guest}
              onBack={() => {
                setLookupResult(null);
                clearRegisteredPhotoState();
                setSubStep("lookup");
              }}
              onSubmit={(value) => {
                const nextGuest = registeredPhotosActive.current
                  ? value
                  : stripRegisteredPhotoFields(value);
                setGuest(nextGuest);
                if (hasCompanions) setSubStep("companions");
                else void goToPhotosOrEmbratur(nextGuest);
              }}
            />
          )}

          {step === 4 && subStep === "companions" && (
            <CompanionsStep
              guestsQuantity={guestsQuantity}
              mainGuest={guest}
              dependents={dependents}
              inboxEnabled={establishmentSettings.inboxEnabled}
              faceValidationEnabled={faceValidationEnabled}
              onValidateSelfie={validateSelfiePhoto}
              {...exclusiveCameraProps}
              onChange={setDependents}
              onBack={() => setSubStep("form")}
              onContinue={(next) => {
                if (next) {
                  dependentsRef.current = next;
                  setDependents(next);
                }
                void goToPhotosOrEmbratur();
              }}
            />
          )}

          {step === 4 && subStep === "extra" && (
            <section className="space-y-5">
              <header className="space-y-1">
                <h2 className="font-display text-2xl">{t("checkin.extraFields.establishmentTitle")}</h2>
                <p className="text-sm text-muted-foreground">
                  {reservation?.establishmentName ?? t("checkin.extraFields.establishmentBody")}
                </p>
              </header>
              <ExtraFieldsPanel
                fields={extraFields}
                values={extraFieldValues}
                errors={extraFieldErrors}
                onChange={setExtraFieldValues}
              />
              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="tap-safe"
                  onClick={() => setSubStep(hasCompanions ? "companions" : "form")}
                >
                  {t("common.back")}
                </Button>
                <Button className="tap-safe flex-1" onClick={handleExtraFieldsContinue}>
                  {t("common.continue")}
                </Button>
              </div>
            </section>
          )}

          {step === 5 && (
            <section className="space-y-5">
              <header className="space-y-1">
                <h2 className="font-display text-2xl">{t("checkin.photos.title")}</h2>
                <p className="text-sm text-muted-foreground">{t("checkin.photos.body")}</p>
              </header>

              <div className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-card">
                <SelfieCapture
                  title={t("checkin.photos.selfie")}
                  value={selfie}
                  photoGuidance="new"
                  captureId="selfie"
                  validationEnabled={faceValidationEnabled}
                  onValidate={validateSelfiePhoto}
                  {...exclusiveCameraProps}
                  onCapture={(value) => {
                    setSelfie(value || null);
                    if (registeredPhotosActive.current && value && isDataUrl(value)) {
                      photosReplacedRef.current.profile = true;
                    }
                  }}
                />
                <CameraCapture
                  compact
                  title={t("checkin.photos.document")}
                  facingMode="environment"
                  value={docPhoto}
                  captureId="document"
                  {...exclusiveCameraProps}
                  label={t("checkin.photos.documentHint")}
                  onCapture={(value) => {
                    setDocPhoto(value || null);
                    if (registeredPhotosActive.current && value && isDataUrl(value)) {
                      photosReplacedRef.current.document = true;
                    }
                  }}
                />
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="tap-safe"
                  onClick={() => {
                    setStep(4);
                    setSubStep(hasCompanions ? "companions" : "form");
                  }}
                >
                  {t("common.back")}
                </Button>
                <Button
                  className="tap-safe flex-1"
                  disabled={loading || !selfie || !docPhoto}
                  onClick={() => void handlePhotos()}
                >
                  {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}{" "}
                  {t("checkin.photos.submit")}
                </Button>
              </div>
            </section>
          )}

          {step === 6 && reference && (
            <EmbraturStep
              reference={reference}
              value={embratur}
              onChange={setEmbratur}
              onBack={() => setStep(5)}
              onContinue={() => void handleSubmit()}
              submitting={loading}
            />
          )}

          {step === 7 && <CheckinFinalizingScreen />}

          {step === 8 && (() => {
            const displayReservation = successReservation();
            if (!displayReservation) return null;

            const activeLocalizer = String(displayReservation.localizer ?? localizer)
              .trim()
              .toUpperCase();
            const needsReaccessVerify =
              checkinAlreadyDone &&
              reaccessSecurityRequired &&
              reaccessVerifiedFor !== activeLocalizer;

            if (needsReaccessVerify) {
              return (
                <ReaccessIdentityGate
                  birthDateInput={reaccessBirthDateInput}
                  birthDateError={reaccessBirthDateError}
                  verifying={reaccessVerifying}
                  onBirthDateChange={(value) => {
                    setReaccessBirthDateInput(value);
                    if (reaccessBirthDateError) setReaccessBirthDateError("");
                  }}
                  onBack={backFromReaccessVerify}
                  onContinue={() => void handleVerifyReaccessBirthDate()}
                />
              );
            }

            return (
              <>
                <SuccessScreen
                  reservation={displayReservation}
                  mainGuest={displayReservation.mainGuest ?? guest}
                  dependents={
                    addingPostCompanions
                      ? postCompanionsDraft
                      : dependents.length > 0
                        ? dependents
                        : (reservation?.dependents ?? [])
                  }
                  alreadyCompleted={checkinAlreadyDone}
                  establishmentPhotoUrl={establishmentSettings.successPagePhotoUrl}
                  inboxPortariaEnabled={establishmentSettings.inboxEnabled}
                  usefulInfoItems={establishmentSettings.usefulInfoItems}
                  canAddCompanions={
                    postCompanionsCanAdd &&
                    !displayReservation.isCancelled &&
                    !displayReservation.isPendingCancellation
                  }
                  addingCompanions={addingPostCompanions}
                  companionsSaving={postCompanionsSaving || loading}
                  onStartAddCompanions={() => void startAddPostCompanions()}
                  faceValidationEnabled={faceValidationEnabled}
                  onValidateCompanionSelfie={validateSelfiePhoto}
                  onSaveCompanionInboxPhoto={
                    establishmentSettings.inboxEnabled
                      ? (companion, photoBase64) => saveCompanionInboxPhoto(companion, photoBase64)
                      : undefined
                  }
                  companionInboxPhotoSavingKey={companionInboxPhotoSavingKey}
                  {...exclusiveCameraProps}
                  companionsEditor={
                    addingPostCompanions && postCompanionsContext ? (
                      <CompanionsStep
                        mode="postCheckin"
                        guestsQuantity={postCompanionsContext.guestsQuantity}
                        mainGuest={postCompanionsContext.mainGuest}
                        dependents={postCompanionsDraft}
                        lockedCount={postCompanionsLockedCount}
                        saving={postCompanionsSaving}
                        inboxEnabled={establishmentSettings.inboxEnabled}
                        faceValidationEnabled={faceValidationEnabled}
                        onValidateSelfie={validateSelfiePhoto}
                        onSaveCompanionInboxPhoto={
                          establishmentSettings.inboxEnabled
                            ? (companion, photoBase64) => saveCompanionInboxPhoto(companion, photoBase64)
                            : undefined
                        }
                        companionInboxPhotoSavingKey={companionInboxPhotoSavingKey}
                        {...exclusiveCameraProps}
                        onChange={setPostCompanionsDraft}
                        onBack={resetPostCompanionsEditor}
                        onContinue={(next) => {
                          if (next) {
                            dependentsRef.current = next;
                            setPostCompanionsDraft(next);
                            setDependents(next);
                          }
                          void savePostCompanions(next);
                        }}
                      />
                    ) : null
                  }
                />
                <Button
                  variant="ghost"
                  className="mt-6 w-full print:hidden"
                  onClick={resetToSearch}
                >
                  {t("checkin.search.another")}
                </Button>
              </>
            );
          })()}
        </div>

        {step > 0 && step < 7 && (
          <p className="mt-8 flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="size-3.5" aria-hidden /> {t("checkin.footer.encrypted")}
            {termsAcceptedAt ? ` ${t("checkin.footer.termsAccepted")}` : ""}
          </p>
        )}
      </main>
    </div>
  );
}

function Notice({ tone, text }: { tone: "error" | "warning" | "success"; text: string }) {
  const styles = {
    error: "border-destructive/40 bg-destructive/10 text-destructive",
    warning: "border-warning/40 bg-warning/10 text-warning-foreground",
    success: "border-success/40 bg-success/10 text-foreground",
  } as const;
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${styles[tone]}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>{text}</p>
    </div>
  );
}
