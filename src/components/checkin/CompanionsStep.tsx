import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BirthDateInput } from "@/components/checkin/BirthDateInput";
import { SearchableSelect } from "@/components/checkin/SearchableSelect";
import { PhoneWithDialCodeInput } from "@/components/checkin/PhoneWithDialCodeInput";
import { SelfieCapture, type SelfieValidationOutcome } from "@/components/checkin/SelfieCapture";
import { getEmbraturReference } from "@/lib/api/checkin.functions";
import type { Dependent, MainGuest } from "@/lib/api/types";
import { CompanionInboxPhotoTile } from "@/components/checkin/CompanionInboxPhotoTile";
import { companionNeedsInboxPhoto, companionsHaveInboxPhotoUpdates } from "@/lib/companion-inbox-photos";
import { CompanionInviteLink } from "@/components/checkin/CompanionInviteLink";
import { normalizeEmbratur } from "@/lib/embratur";
import type { ExclusiveCameraProps } from "@/lib/camera-utils";
import {
  BRAZIL_PMS_COUNTRY,
  matchPmsCountryValue,
  toPmsCountryOptions,
} from "@/lib/guest-countries";
import { useI18n } from "@/lib/i18n/context";
import { buildCheckinErrorLabels, splitCheckinErrorMessage } from "@/lib/checkin-error-labels";
import { formatCheckinIssues, validateDependent } from "@/lib/checkin-validation";
import { buildGenderSelectOptions } from "@/lib/guest-gender";
import { defaultCallingCodeForGuest } from "@/lib/phone-display";
import { fetchViaCep, maskCep, maskCpf, onlyDigits } from "@/lib/validators";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  guestsQuantity: number;
  mainGuest: MainGuest;
  dependents: Dependent[];
  onChange: (dependents: Dependent[]) => void;
  onContinue: (dependents?: Dependent[]) => void;
  onBack: () => void;
  /** Localizador para o link /{localizador}/guest. */
  localizer?: string;
  /** Cadastro aberto pelo próprio acompanhante. */
  selfService?: boolean;
  /** Mantém o formulário visível, sem edição (após o envio). */
  readOnly?: boolean;
  /** Pós-check-in: lista existente somente leitura; botão salva em vez de continuar. */
  mode?: "flow" | "postCheckin";
  /** Quantidade de acompanhantes já gravados (somente leitura no modo postCheckin). */
  lockedCount?: number;
  saving?: boolean;
  /** Portaria Inbox: permite selfie opcional por acompanhante. */
  inboxEnabled?: boolean;
  faceValidationEnabled?: boolean;
  onValidateSelfie?: (photoBase64: string, guestId?: string) => Promise<SelfieValidationOutcome>;
  onSaveCompanionInboxPhoto?: (
    companion: Dependent,
    photoBase64: string,
    companionKey?: string,
  ) => Promise<void>;
  companionInboxPhotoSavingKey?: string | null;
} & Partial<ExclusiveCameraProps>;

const EMPTY: Dependent = {
  dependentId: null,
  name: "",
  email: "",
  documentNumber: "",
  documentType: "CPF",
  gender: "MALE",
  rg: "",
  expeditor: "",
  birthDate: "",
  mobilePhoneNumber: "",
  profession: "",
  citizenship: "",
  zipCode: "",
  country: "",
  state: "",
  city: "",
  street: "",
  number: "",
  neighborhood: "",
  fnrhId: null,
};

function addressFromMainGuest(mainGuest: MainGuest): Pick<
  Dependent,
  "zipCode" | "street" | "number" | "neighborhood" | "city" | "state" | "country"
> {
  return {
    zipCode: mainGuest.zipCode ?? "",
    street: mainGuest.street ?? "",
    number: mainGuest.number ?? "",
    neighborhood: mainGuest.neighborhood ?? "",
    city: mainGuest.city ?? "",
    state: mainGuest.state ?? "",
    country: mainGuest.country ?? mainGuest.citizenship ?? BRAZIL_PMS_COUNTRY,
  };
}

function normalizeDocumentForCompare(documentNumber: string, documentType: string): string {
  if (documentType === "CPF" || documentType === "RG") return onlyDigits(documentNumber);
  return documentNumber.trim().replace(/\s+/g, "").toUpperCase();
}

const GUEST_VALIDATION_KEYS: Partial<Record<string, string>> = {
  name: "guest.validation.fullName",
  email: "guest.validation.email",
  birthDate: "guest.validation.birthDate",
  gender: "guest.validation.gender",
  documentNumber: "guest.validation.document",
  mobilePhoneNumber: "guest.validation.phone",
  citizenship: "guest.validation.citizenship",
  profession: "guest.validation.profession",
  rg: "guest.validation.rg",
  expeditor: "guest.validation.expeditor",
  street: "guest.validation.street",
  number: "guest.validation.streetNumber",
  neighborhood: "guest.validation.neighborhood",
  city: "guest.validation.city",
  state: "guest.validation.state",
  country: "guest.validation.country",
};

export function CompanionsStep({
  guestsQuantity,
  mainGuest,
  dependents,
  onChange,
  onContinue,
  onBack,
  localizer,
  selfService = false,
  readOnly = false,
  mode = "flow",
  lockedCount = 0,
  saving = false,
  inboxEnabled = false,
  faceValidationEnabled = false,
  onValidateSelfie,
  onSaveCompanionInboxPhoto,
  companionInboxPhotoSavingKey = null,
  captureId: _captureId,
  activeCaptureId,
  onRequestCapture,
  onReleaseCapture,
}: Props) {
  const { t } = useI18n();
  const loadReference = useServerFn(getEmbraturReference);
  const max = Math.max(0, guestsQuantity - 1);
  const isPostCheckin = mode === "postCheckin";
  const formLocked = saving || readOnly;
  const readOnlyCount = isPostCheckin ? Math.min(lockedCount, dependents.length) : 0;
  const [adding, setAdding] = useState(isPostCheckin || dependents.length > 0);
  const [draft, setDraft] = useState<Dependent>(EMPTY);
  const [useMainGuestAddress, setUseMainGuestAddress] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [countryOptions, setCountryOptions] = useState<
    ReturnType<typeof toPmsCountryOptions>
  >([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [editingPhotoIndex, setEditingPhotoIndex] = useState<number | null>(null);

  const showInboxPhotos = inboxEnabled && max > 0;
  const canSavePhotoOnly =
    isPostCheckin &&
    showInboxPhotos &&
    companionsHaveInboxPhotoUpdates(dependents, dependents.slice(0, readOnlyCount));

  function validateCompanionPhoto(photoBase64: string, guestId?: string) {
    if (!faceValidationEnabled || !onValidateSelfie) {
      return Promise.resolve({ status: "APPROVED" as const });
    }
    return onValidateSelfie(photoBase64, guestId?.trim() || undefined);
  }

  const isForeignDocument = draft.documentType === "PASSPORT";

  useEffect(() => {
    let active = true;
    setCountriesLoading(true);
    void loadReference({ data: {} })
      .then((raw) => {
        if (!active) return;
        const options = toPmsCountryOptions(normalizeEmbratur(raw).countries);
        setCountryOptions(options);
        setDraft((current) => ({
          ...current,
          citizenship: matchPmsCountryValue(current.citizenship, options) || BRAZIL_PMS_COUNTRY,
          country: matchPmsCountryValue(current.country, options) || BRAZIL_PMS_COUNTRY,
        }));
      })
      .finally(() => {
        if (active) setCountriesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [loadReference]);

  useEffect(() => {
    if (!useMainGuestAddress) return;
    setDraft((current) => ({
      ...current,
      ...addressFromMainGuest(mainGuest),
    }));
  }, [useMainGuestAddress, mainGuest]);

  function setDraftField(field: keyof Dependent, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
  }

  async function handleCep(value: string) {
    setDraftField("zipCode", maskCep(value));
    const address = await fetchViaCep(value);
    if (address) {
      setDraft((current) => ({
        ...current,
        street: address.logradouro ?? current.street,
        neighborhood: address.bairro ?? current.neighborhood,
        city: address.localidade ?? current.city,
        state: address.uf ?? current.state,
        country: current.country || BRAZIL_PMS_COUNTRY,
      }));
    }
  }

  function validate(): boolean {
    const address = useMainGuestAddress ? addressFromMainGuest(mainGuest) : draft;
    const candidate: Dependent = {
      ...draft,
      zipCode: address.zipCode,
      street: address.street,
      number: address.number,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      country: address.country,
    };

    const issues = validateDependent(candidate, 0, mainGuest);

    if (draft.documentNumber.trim()) {
      const companionDoc = normalizeDocumentForCompare(draft.documentNumber, draft.documentType);
      if (
        dependents.some(
          (dependent) =>
            normalizeDocumentForCompare(dependent.documentNumber, dependent.documentType) ===
            companionDoc,
        )
      ) {
        issues.push({
          step: "companions",
          field: "documentNumber",
          companionIndex: 0,
          companionName: draft.name.trim() || "#1",
        });
      }
    }

    const next: Record<string, string> = {};
    for (const issue of issues) {
      if (issue.field === "documentNumber") {
        const companionDoc = normalizeDocumentForCompare(draft.documentNumber, draft.documentType);
        const mainDoc = normalizeDocumentForCompare(
          mainGuest.documentNumber ?? "",
          mainGuest.documentType ?? "CPF",
        );
        if (companionDoc && mainDoc && companionDoc === mainDoc) {
          next["documentNumber"] = t("checkin.companions.sameDocumentAsMain");
          continue;
        }
        if (
          dependents.some(
            (dependent) =>
              normalizeDocumentForCompare(dependent.documentNumber, dependent.documentType) ===
              companionDoc,
          )
        ) {
          next["documentNumber"] = t("checkin.companions.duplicateDocument");
          continue;
        }
      }

      const validationKey =
        issue.field === "zipCode"
          ? isForeignDocument
            ? "guest.validation.zipCodeIntl"
            : "guest.validation.zipCode"
          : GUEST_VALIDATION_KEYS[issue.field];
      if (validationKey) next[issue.field] = t(validationKey);
    }

    setErrors(next);
    if (issues.length > 0) {
      const labels = buildCheckinErrorLabels(t);
      const { title, description } = splitCheckinErrorMessage(formatCheckinIssues(issues, labels));
      toast.error(title, description ? { description } : undefined);
    }
    return issues.length === 0;
  }

  function draftHasMinimumData(): boolean {
    return Boolean(
      draft.name?.trim() ||
        draft.email?.trim() ||
        draft.documentNumber?.trim() ||
        draft.profilePhotoUrl?.trim(),
    );
  }

  function buildCompanionFromDraft(): Dependent | null {
    if (!validate()) return null;

    const address = useMainGuestAddress ? addressFromMainGuest(mainGuest) : draft;
    const documentType = draft.documentType;
    return {
      dependentId: null,
      name: draft.name.trim(),
      email: draft.email?.trim(),
      documentNumber:
        documentType === "CPF" || documentType === "RG"
          ? onlyDigits(draft.documentNumber)
          : draft.documentNumber.trim().replace(/\s+/g, "").toUpperCase(),
      documentType,
      gender: draft.gender,
      rg: isForeignDocument ? undefined : draft.rg?.trim(),
      expeditor: isForeignDocument ? undefined : draft.expeditor?.trim(),
      birthDate: draft.birthDate,
      mobilePhoneNumber: draft.mobilePhoneNumber?.trim(),
      profession: draft.profession?.trim() || "N/A",
      citizenship: draft.citizenship?.trim() || BRAZIL_PMS_COUNTRY,
      zipCode: address.zipCode
        ? onlyDigits(address.zipCode).length === 8
          ? onlyDigits(address.zipCode)
          : address.zipCode.trim()
        : "",
      street: address.street?.trim(),
      number: address.number?.trim(),
      neighborhood: address.neighborhood?.trim(),
      city: address.city?.trim(),
      state: address.state?.trim(),
      country: address.country?.trim() || BRAZIL_PMS_COUNTRY,
      fnrhId: null,
      ...(draft.profilePhotoUrl?.trim() ? { profilePhotoUrl: draft.profilePhotoUrl.trim() } : {}),
    };
  }

  function resetDraftForm() {
    setDraft(EMPTY);
    setUseMainGuestAddress(false);
    setErrors({});
    setEditingPhotoIndex(null);
  }

  function add() {
    const companion = buildCompanionFromDraft();
    if (!companion) return;

    onChange([...dependents, companion]);
    resetDraftForm();
  }

  function handleContinue() {
    let nextDependents = dependents;
    if (adding && dependents.length < max && draftHasMinimumData()) {
      const companion = buildCompanionFromDraft();
      if (!companion) return;
      nextDependents = [...dependents, companion];
      onChange(nextDependents);
      if (!selfService) resetDraftForm();
    }
    onContinue(nextDependents);
  }

  function updateDependentPhoto(index: number, photoUrl: string) {
    onChange(
      dependents.map((dependent, i) =>
        i === index
          ? {
              ...dependent,
              profilePhotoUrl: photoUrl || undefined,
              ...(photoUrl ? {} : { profilePhotoId: undefined }),
            }
          : dependent,
      ),
    );
  }

  function field(
    name: keyof Dependent,
    label: string,
    props: React.ComponentProps<typeof Input> = {},
    disabled = false,
  ) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={`dep-${name}`}>{label}</Label>
        <Input
          id={`dep-${name}`}
          className="tap-safe"
          value={String(draft[name] ?? "")}
          disabled={disabled}
          onChange={(event) => setDraftField(name, event.target.value)}
          aria-invalid={Boolean(errors[name])}
          {...props}
        />
        {errors[name] && <p className="text-xs text-destructive">{errors[name]}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {selfService ? null : (
        <header className="space-y-1">
          <h2 className="font-display text-2xl">
            {isPostCheckin ? t("checkin.companions.postTitle") : t("checkin.companions.title")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isPostCheckin
              ? t("checkin.companions.postBody", {
                  count: guestsQuantity,
                  remaining: Math.max(0, max - dependents.length),
                })
              : t("checkin.companions.body", { count: guestsQuantity })}
          </p>
        </header>
      )}

      {localizer && !selfService && max > dependents.length ? (
        <CompanionInviteLink localizer={localizer} pendingMainCheckin={!isPostCheckin} />
      ) : null}

      {selfService && saving ? (
        <div
          className="flex items-center gap-3 rounded-2xl border border-border bg-card p-5 text-sm text-foreground shadow-card"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-5 shrink-0 animate-spin text-primary" aria-hidden />
          <p>{t("checkin.companions.selfPageSubmitting")}</p>
        </div>
      ) : null}

      {dependents.length > 0 && (
        <ul className="space-y-2">
          {dependents.map((dependent, index) => {
            const locked = index < readOnlyCount;
            return (
              <li
                key={`${dependent.documentNumber}-${index}`}
                className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{dependent.name}</p>
                  <p className="font-code text-xs text-muted-foreground">
                    {dependent.documentType} · {dependent.documentNumber}
                  </p>
                  {dependent.email ? (
                    <p className="truncate text-xs text-muted-foreground">{dependent.email}</p>
                  ) : null}
                  {locked ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {t("checkin.companions.alreadyRegistered")}
                    </p>
                  ) : null}
                </div>
                {!locked ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={t("checkin.companions.removeAria", { name: dependent.name })}
                    onClick={() => {
                      onChange(dependents.filter((_, i) => i !== index));
                      if (editingPhotoIndex === index) setEditingPhotoIndex(null);
                    }}
                  >
                    <Trash2 className="size-4 text-destructive" aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {showInboxPhotos && dependents.length > 0 ? (
        <section className="space-y-3">
          <header className="space-y-1">
            <h3 className="font-display text-lg">{t("checkin.companions.inboxPhotoTitle")}</h3>
            <p className="text-sm text-muted-foreground">{t("checkin.companions.inboxPhotoHint")}</p>
          </header>
          <ul className="space-y-3">
            {dependents.map((dependent, index) => {
              const locked = index < readOnlyCount;
              const editingPhoto = editingPhotoIndex === index;
              const needsInboxPhoto = showInboxPhotos && companionNeedsInboxPhoto(dependent);
              const companionKey = `${dependent.documentNumber || dependent.name}-${index}`;
              return (
                <li
                  key={`photo-${dependent.documentNumber}-${index}`}
                  className="rounded-xl border border-border bg-card p-4"
                >
                  <p className="mb-3 text-sm font-medium">{dependent.name}</p>
                  {locked && needsInboxPhoto && onSaveCompanionInboxPhoto ? (
                    <CompanionInboxPhotoTile
                      companion={dependent}
                      companionKey={companionKey}
                      saving={companionInboxPhotoSavingKey === companionKey}
                      faceValidationEnabled={faceValidationEnabled}
                      onValidateSelfie={onValidateSelfie}
                      onSave={(photoBase64) =>
                        onSaveCompanionInboxPhoto(dependent, photoBase64, companionKey)
                      }
                      captureId={`companion-photo-${index}`}
                      activeCaptureId={activeCaptureId}
                      onRequestCapture={onRequestCapture}
                      onReleaseCapture={onReleaseCapture}
                    />
                  ) : locked ? null : editingPhoto ? (
                    <SelfieCapture
                      compact
                      title={t("checkin.photos.selfie")}
                      value={dependent.profilePhotoUrl ?? null}
                      photoGuidance="new"
                      validationEnabled={faceValidationEnabled}
                      onValidate={(photo) => validateCompanionPhoto(photo, dependent.documentNumber)}
                      captureId={`companion-photo-${index}`}
                      activeCaptureId={activeCaptureId}
                      onRequestCapture={onRequestCapture}
                      onReleaseCapture={onReleaseCapture}
                      onCapture={(value) => updateDependentPhoto(index, value)}
                    />
                  ) : dependent.profilePhotoUrl ? (
                    <div className="space-y-2">
                      <div className="relative aspect-square max-w-[140px] overflow-hidden rounded-xl border border-border bg-muted">
                        <img
                          src={dependent.profilePhotoUrl}
                          alt={dependent.name}
                          className="size-full object-cover"
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="tap-safe"
                        onClick={() => setEditingPhotoIndex(index)}
                      >
                        {t("checkin.companions.inboxPhotoChange")}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="tap-safe"
                      onClick={() => setEditingPhotoIndex(index)}
                    >
                      {t("checkin.companions.inboxPhotoAdd")}
                    </Button>
                  )}
                  {editingPhoto ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="tap-safe mt-2 h-8 text-xs"
                      onClick={() => setEditingPhotoIndex(null)}
                    >
                      {t("common.back")}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {adding && dependents.length < max && (
        <div
          className={cn(
            "space-y-5",
            !selfService && "rounded-2xl border border-border bg-card p-5 shadow-card",
            selfService && formLocked && "pointer-events-none",
          )}
          aria-busy={selfService && saving ? true : undefined}
        >
          <section className={cn("space-y-4", selfService && "rounded-2xl border border-border bg-card p-5 shadow-card")}>
            <h3 className="font-display text-lg">{t("guest.personalData")}</h3>
            {field("name", `${t("guest.fullName")} *`, { autoComplete: "name" })}
            {field("email", `${t("guest.email")} *`, {
              type: "email",
              inputMode: "email",
              autoComplete: "email",
            })}
            <div className="space-y-1.5">
              <Label htmlFor="dep-birthDate">{`${t("guest.birthDate")} *`}</Label>
              <BirthDateInput
                id="dep-birthDate"
                value={String(draft.birthDate ?? "")}
                onChange={(value) => setDraftField("birthDate", value)}
                aria-invalid={Boolean(errors["birthDate"])}
                placeholder={t("guest.birthDatePlaceholder")}
              />
              {errors["birthDate"] && (
                <p className="text-xs text-destructive">{errors["birthDate"]}</p>
              )}
            </div>
            <PhoneWithDialCodeInput
              id="dep-mobilePhoneNumber"
              label={t("guest.mobilePhone")}
              value={String(draft.mobilePhoneNumber ?? "")}
              defaultCallingCode={defaultCallingCodeForGuest({
                foreign: isForeignDocument,
              })}
              required
              error={errors["mobilePhoneNumber"]}
              onChange={(value) => setDraftField("mobilePhoneNumber", value)}
            />
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="dep-type">{t("guest.documentType")} *</Label>
                <Select
                  value={draft.documentType}
                  onValueChange={(value) => setDraftField("documentType", value)}
                >
                  <SelectTrigger id="dep-type" className="tap-safe w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CPF">{t("guest.cpf")}</SelectItem>
                    <SelectItem value="RG">{t("guest.rg")}</SelectItem>
                    <SelectItem value="PASSPORT">{t("guest.passport")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dep-gender">{t("common.gender")} *</Label>
                <Select
                  value={draft.gender}
                  onValueChange={(value) => setDraftField("gender", value)}
                >
                  <SelectTrigger id="dep-gender" className="tap-safe w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {buildGenderSelectOptions(t).map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors["gender"] && (
                  <p className="text-xs text-destructive">{errors["gender"]}</p>
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-doc">{t("guest.documentNumber")} *</Label>
              <Input
                id="dep-doc"
                className="tap-safe font-code"
                inputMode={isForeignDocument ? "text" : "numeric"}
                value={draft.documentNumber}
                onChange={(event) =>
                  setDraftField(
                    "documentNumber",
                    isForeignDocument ? event.target.value : maskCpf(event.target.value),
                  )
                }
              />
              {errors["documentNumber"] && (
                <p className="text-xs text-destructive">{errors["documentNumber"]}</p>
              )}
            </div>
            {!isForeignDocument ? (
              <>
                {field("rg", `${t("guest.rg")} *`)}
                {field("expeditor", `${t("guest.issuingAgency")} *`, { placeholder: "SSP/SP" })}
              </>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="dep-citizenship">{`${t("guest.citizenship")} *`}</Label>
              <SearchableSelect
                id="dep-citizenship"
                options={countryOptions}
                value={String(draft.citizenship ?? "")}
                placeholder={countriesLoading ? t("common.loading") : t("common.select")}
                maxResults={300}
                onChange={(value) => setDraftField("citizenship", value)}
              />
              {errors["citizenship"] && (
                <p className="text-xs text-destructive">{errors["citizenship"]}</p>
              )}
            </div>
            {field("profession", `${t("common.profession")} *`)}
          </section>

          {showInboxPhotos ? (
            <section className={cn("space-y-3", selfService && "rounded-2xl border border-border bg-card p-5 shadow-card")}>
              <header className="space-y-1">
                <h3 className="font-display text-lg">{t("checkin.companions.inboxPhotoTitle")}</h3>
                <p className="text-sm text-muted-foreground">{t("checkin.companions.inboxPhotoHint")}</p>
              </header>
              <SelfieCapture
                compact
                title={t("checkin.photos.selfie")}
                value={draft.profilePhotoUrl ?? null}
                photoGuidance="new"
                validationEnabled={faceValidationEnabled}
                onValidate={(photo) => validateCompanionPhoto(photo, draft.documentNumber)}
                captureId="companion-draft-photo"
                activeCaptureId={activeCaptureId}
                onRequestCapture={onRequestCapture}
                onReleaseCapture={onReleaseCapture}
                onCapture={(value) =>
                  setDraft((current) => ({
                    ...current,
                    profilePhotoUrl: value || undefined,
                    ...(value ? {} : { profilePhotoId: undefined }),
                  }))
                }
              />
            </section>
          ) : null}

          <section className={cn("space-y-4", selfService && "rounded-2xl border border-border bg-card p-5 shadow-card")}>
            <h3 className="font-display text-lg">{t("guest.addressSection")}</h3>
            <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/30 p-3">
              <Checkbox
                id="dep-same-address"
                checked={useMainGuestAddress}
                onCheckedChange={(value) => setUseMainGuestAddress(value === true)}
              />
              <Label htmlFor="dep-same-address" className="cursor-pointer text-sm font-normal leading-snug">
                {t("checkin.companions.useMainGuestAddress")}
              </Label>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-zipCode">
                {isForeignDocument ? `${t("guest.zipCodeIntl")} *` : `${t("guest.zipCode")} *`}
              </Label>
              <Input
                id="dep-zipCode"
                className="tap-safe font-code"
                inputMode={isForeignDocument ? "text" : "numeric"}
                autoComplete="postal-code"
                disabled={useMainGuestAddress}
                value={String(draft.zipCode ?? "")}
                onChange={(event) =>
                  isForeignDocument
                    ? setDraftField("zipCode", event.target.value)
                    : void handleCep(event.target.value)
                }
                placeholder={isForeignDocument ? "10001" : "00000-000"}
              />
              {errors["zipCode"] && <p className="text-xs text-destructive">{errors["zipCode"]}</p>}
            </div>
            {field("street", `${t("guest.street")} *`, {}, useMainGuestAddress)}
            <div className="grid grid-cols-2 gap-3">
              {field("number", `${t("guest.streetNumber")} *`, {}, useMainGuestAddress)}
              {field("neighborhood", `${t("guest.neighborhood")} *`, {}, useMainGuestAddress)}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field("city", `${t("guest.city")} *`, {}, useMainGuestAddress)}
              {field("state", `${t("guest.state")} *`, {}, useMainGuestAddress)}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dep-country">{`${t("guest.country")} *`}</Label>
              <SearchableSelect
                id="dep-country"
                options={countryOptions}
                value={String(draft.country ?? "")}
                placeholder={countriesLoading ? t("common.loading") : t("common.select")}
                maxResults={300}
                disabled={useMainGuestAddress}
                onChange={(value) => setDraftField("country", value)}
              />
              {errors["country"] && <p className="text-xs text-destructive">{errors["country"]}</p>}
            </div>
          </section>

          {selfService ? null : (
          <Button
            type="button"
            className="tap-safe w-full border-transparent bg-accent font-semibold text-accent-foreground shadow-md shadow-accent/30 hover:bg-accent/90"
            disabled={countriesLoading}
            onClick={add}
          >
            <Plus className="size-4" aria-hidden /> {t("checkin.companions.add")}
          </Button>
          )}
        </div>
      )}

      {!adding && dependents.length < max && (
        <Button
          type="button"
          className="tap-safe w-full border-transparent bg-accent font-semibold text-accent-foreground shadow-md shadow-accent/30 hover:bg-accent/90"
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" aria-hidden /> {t("checkin.companions.yesRegister")}
        </Button>
      )}

      {selfService && readOnly ? null : (
      <div className="flex gap-3">
        {selfService ? null : (
          <Button type="button" variant="outline" className="tap-safe" disabled={saving} onClick={onBack}>
            {t("common.back")}
          </Button>
        )}
        <Button
          type="button"
          className="tap-safe flex-1"
          disabled={
            formLocked ||
            (selfService
              ? dependents.length === 0 && !draftHasMinimumData()
              : isPostCheckin && dependents.length <= readOnlyCount && !canSavePhotoOnly)
          }
          onClick={handleContinue}
        >
          {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
          {selfService
            ? saving
              ? t("checkin.companions.selfPageSubmitting")
              : t("checkin.companions.selfPageSubmit")
            : isPostCheckin
              ? t("checkin.companions.postSave")
              : dependents.length > 0
                ? t("common.continue")
                : t("checkin.companions.noContinue")}
        </Button>
      </div>
      )}
    </div>
  );
}
