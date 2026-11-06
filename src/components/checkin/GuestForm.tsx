import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
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
import { getEmbraturReference } from "@/lib/api/checkin.functions";
import type { MainGuest } from "@/lib/api/types";
import { birthDateToIso } from "@/lib/birth-date";
import { normalizeEmbratur } from "@/lib/embratur";
import {
  BRAZIL_PMS_COUNTRY,
  matchPmsCountryValue,
  toPmsCountryOptions,
} from "@/lib/guest-countries";
import { buildGenderSelectOptions, hasGenderSelection } from "@/lib/guest-gender";
import { useI18n } from "@/lib/i18n/context";
import {
  defaultCallingCodeForGuest,
  isValidPhoneWithDialCode,
  splitPhoneInput,
} from "@/lib/phone-display";
import { validateGuestState } from "@/lib/guest-state";
import { fetchViaCep, isValidEmail, maskCep, maskCpf } from "@/lib/validators";

type Props = {
  foreign: boolean;
  initial: MainGuest;
  onSubmit: (guest: MainGuest) => void;
  onBack: () => void;
  /** Necessário para carregar países via catálogo nativo quando o hotel usa só PMS VB. */
  establishmentId?: string | null;
};

export function GuestForm({ foreign, initial, onSubmit, onBack, establishmentId }: Props) {
  const { t } = useI18n();
  const loadReference = useServerFn(getEmbraturReference);
  const [guest, setGuest] = useState<MainGuest>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [countryOptions, setCountryOptions] = useState<
    ReturnType<typeof toPmsCountryOptions>
  >([]);
  const [countriesLoading, setCountriesLoading] = useState(true);

  const genderOptions = buildGenderSelectOptions(t);

  useEffect(() => {
    let active = true;
    setCountriesLoading(true);
    void loadReference({
      data: {
        ...(establishmentId?.trim() ? { establishmentId: establishmentId.trim() } : {}),
      },
    })
      .then((raw) => {
        if (!active) return;
        const options = toPmsCountryOptions(normalizeEmbratur(raw).countries);
        setCountryOptions(options);
        setGuest((current) => {
          const citizenship = matchPmsCountryValue(current.citizenship, options);
          const country = matchPmsCountryValue(current.country, options);
          return {
            ...current,
            citizenship:
              citizenship ||
              (!foreign ? BRAZIL_PMS_COUNTRY : current.citizenship || ""),
            country: country || (!foreign ? BRAZIL_PMS_COUNTRY : current.country || ""),
          };
        });
      })
      .catch((error) => {
        console.error("[GuestForm] Falha ao carregar países:", error);
      })
      .finally(() => {
        if (active) setCountriesLoading(false);
      });

    return () => {
      active = false;
    };
  }, [establishmentId, foreign, loadReference]);

  function set(field: string, value: string) {
    setGuest((current) => ({ ...current, [field]: value }));
  }

  async function handleCep(value: string) {
    set("zipCode", maskCep(value));
    const address = await fetchViaCep(value);
    if (address) {
      setGuest((current) => ({
        ...current,
        street: address.logradouro ?? current.street,
        neighborhood: address.bairro ?? current.neighborhood,
        city: address.localidade ?? current.city,
        state: address.uf ?? current.state,
        country: current.country || BRAZIL_PMS_COUNTRY,
      }));
    }
  }

  function stateValidationMessage(value: string | undefined): string | null {
    const result = validateGuestState(value, { foreign });
    if (result.ok) return null;
    if (result.reason === "missing") return t("guest.validation.state");
    if (result.reason === "invalid_uf") return t("guest.validation.stateUf");
    return foreign
      ? t("guest.validation.stateAbbrevForeign")
      : t("guest.validation.stateAbbrev");
  }

  function validateAddress(next: Record<string, string>) {
    const zipKey = foreign ? "zipCodeIntl" : "zipCode";
    if (!guest.zipCode?.trim()) next["zipCode"] = t(`guest.validation.${zipKey}`);
    if (!guest.street?.trim()) next["street"] = t("guest.validation.street");
    if (!guest.number?.trim()) next["number"] = t("guest.validation.streetNumber");
    if (!guest.neighborhood?.trim()) next["neighborhood"] = t("guest.validation.neighborhood");
    if (!guest.city?.trim()) next["city"] = t("guest.validation.city");
    const stateError = stateValidationMessage(guest.state);
    if (stateError) next["state"] = stateError;
    if (!guest.country?.trim()) next["country"] = t("guest.validation.country");
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!guest.name?.trim()) next["name"] = t("guest.validation.fullName");
    if (!guest.email || !isValidEmail(guest.email)) next["email"] = t("guest.validation.email");
    if (!birthDateToIso(guest.birthDate)) next["birthDate"] = t("guest.validation.birthDate");
    if (!hasGenderSelection(guest.gender)) next["gender"] = t("guest.validation.gender");
    if (!guest.documentNumber?.trim()) next["documentNumber"] = t("guest.validation.document");
    if (!guest.citizenship?.trim()) {
      next["citizenship"] = foreign
        ? t("guest.validation.originCountry")
        : t("guest.validation.citizenship");
    }
    const phoneFallback = defaultCallingCodeForGuest({ foreign });
    const phoneParts = splitPhoneInput(guest.mobilePhoneNumber ?? "", phoneFallback);
    if (!isValidPhoneWithDialCode(phoneParts.callingCode, phoneParts.nationalDigits)) {
      next["mobilePhoneNumber"] = t("guest.validation.phone");
    }
    if (!foreign && !guest.rg?.trim()) next["rg"] = t("guest.validation.rg");
    if (!foreign && !guest.expeditor?.trim()) next["expeditor"] = t("guest.validation.expeditor");
    if (!guest.profession?.trim()) next["profession"] = t("guest.validation.profession");
    validateAddress(next);
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    const stateResult = validateGuestState(guest.state, { foreign });
    onSubmit({
      ...guest,
      state: stateResult.ok ? stateResult.normalized : guest.state,
      birthDate: birthDateToIso(guest.birthDate) ?? guest.birthDate,
      documentType: foreign ? "PASSPORT" : (guest.documentType ?? "CPF"),
      citizenship:
        matchPmsCountryValue(
          guest.citizenship ?? (foreign ? "" : BRAZIL_PMS_COUNTRY),
          countryOptions,
        ) || (foreign ? "" : BRAZIL_PMS_COUNTRY),
      country:
        matchPmsCountryValue(
          guest.country ?? guest.citizenship ?? (foreign ? "" : BRAZIL_PMS_COUNTRY),
          countryOptions,
        ) || (foreign ? "" : BRAZIL_PMS_COUNTRY),
    });
  }

  function field(name: string, label: string, props: React.ComponentProps<typeof Input> = {}) {
    return (
      <div className="space-y-1.5">
        <Label htmlFor={name}>{label}</Label>
        <Input
          id={name}
          className="tap-safe"
          value={String(guest[name] ?? "")}
          onChange={(event) => set(name, event.target.value)}
          aria-invalid={Boolean(errors[name])}
          {...props}
        />
        {errors[name] && <p className="text-xs text-destructive">{errors[name]}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-display text-lg">{t("guest.personalData")}</h3>
        {field("name", `${t("guest.fullName")} *`, { autoComplete: "name" })}
        {field("email", `${t("guest.email")} *`, { type: "email", inputMode: "email", autoComplete: "email" })}
        <PhoneWithDialCodeInput
          id="mobilePhoneNumber"
          label={t("guest.mobilePhone")}
          value={String(guest.mobilePhoneNumber ?? "")}
          defaultCallingCode={defaultCallingCodeForGuest({ foreign })}
          required
          error={errors["mobilePhoneNumber"]}
          onChange={(value) => set("mobilePhoneNumber", value)}
        />
        <div className="space-y-1.5">
          <Label htmlFor="birthDate">{`${t("guest.birthDate")} *`}</Label>
          <BirthDateInput
            id="birthDate"
            value={String(guest.birthDate ?? "")}
            onChange={(value) => set("birthDate", value)}
            aria-invalid={Boolean(errors["birthDate"])}
            placeholder={t("guest.birthDatePlaceholder")}
          />
          {errors["birthDate"] && <p className="text-xs text-destructive">{errors["birthDate"]}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="gender">{`${t("common.gender")} *`}</Label>
          <Select value={String(guest.gender ?? "")} onValueChange={(value) => set("gender", value)}>
            <SelectTrigger id="gender" className="tap-safe w-full">
              <SelectValue placeholder={t("common.select")} />
            </SelectTrigger>
            <SelectContent>
              {genderOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors["gender"] && <p className="text-xs text-destructive">{errors["gender"]}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="citizenship">
            {foreign ? `${t("guest.originCountry")} *` : `${t("guest.citizenship")} *`}
          </Label>
          <SearchableSelect
            id="citizenship"
            options={countryOptions}
            value={String(guest.citizenship ?? "")}
            placeholder={countriesLoading ? t("common.loading") : t("common.select")}
            maxResults={300}
            onChange={(value) => set("citizenship", value)}
          />
          {errors["citizenship"] && <p className="text-xs text-destructive">{errors["citizenship"]}</p>}
        </div>
        {field("profession", `${t("common.profession")} *`)}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-display text-lg">{t("guest.documentSection")}</h3>
        {foreign ? (
          field("documentNumber", `${t("guest.passportNumber")} *`, {
            className: "tap-safe font-code uppercase",
          })
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="documentType">{`${t("guest.documentType")} *`}</Label>
              <Select
                value={String(guest.documentType ?? "CPF")}
                onValueChange={(value) => set("documentType", value)}
              >
                <SelectTrigger id="documentType" className="tap-safe w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="CPF">{t("guest.cpf")}</SelectItem>
                  <SelectItem value="RG">{t("guest.rg")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="documentNumber">{`${t("guest.documentNumber")} *`}</Label>
              <Input
                id="documentNumber"
                className="tap-safe font-code"
                inputMode="numeric"
                value={String(guest.documentNumber ?? "")}
                onChange={(event) =>
                  set(
                    "documentNumber",
                    guest.documentType === "RG" ? event.target.value : maskCpf(event.target.value),
                  )
                }
              />
              {errors["documentNumber"] && (
                <p className="text-xs text-destructive">{errors["documentNumber"]}</p>
              )}
            </div>
            {field("rg", `${t("guest.rg")} *`)}
            {field("expeditor", `${t("guest.issuingAgency")} *`, { placeholder: "SSP/SP" })}
          </>
        )}
        {foreign && errors["documentNumber"] && (
          <p className="text-xs text-destructive">{errors["documentNumber"]}</p>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-card">
        <h3 className="font-display text-lg">{t("guest.addressSection")}</h3>
        <div className="space-y-1.5">
          <Label htmlFor="zipCode">
            {foreign ? `${t("guest.zipCodeIntl")} *` : `${t("guest.zipCode")} *`}
          </Label>
          <Input
            id="zipCode"
            className="tap-safe font-code"
            inputMode={foreign ? "text" : "numeric"}
            autoComplete="postal-code"
            value={String(guest.zipCode ?? "")}
            onChange={(event) =>
              foreign ? set("zipCode", event.target.value) : void handleCep(event.target.value)
            }
            placeholder={foreign ? "10001" : "00000-000"}
          />
          {errors["zipCode"] && <p className="text-xs text-destructive">{errors["zipCode"]}</p>}
        </div>
        {field("street", `${t("guest.street")} *`)}
        <div className="grid grid-cols-2 gap-3">
          {field("number", `${t("guest.streetNumber")} *`)}
          {field("neighborhood", `${t("guest.neighborhood")} *`)}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field("city", `${t("guest.city")} *`)}
          <div className="space-y-1.5">
            <Label htmlFor="state">{`${t("guest.state")} *`}</Label>
            <Input
              id="state"
              className="tap-safe font-code uppercase"
              autoComplete="address-level1"
              maxLength={40}
              placeholder={foreign ? t("guest.statePlaceholderForeign") : t("guest.statePlaceholder")}
              value={String(guest.state ?? "")}
              onChange={(event) => {
                const next = event.target.value.toUpperCase().replace(/[^A-ZÀ-ÿ\s]/gi, "");
                set("state", next.slice(0, 40));
              }}
              onBlur={() => {
                const result = validateGuestState(guest.state, { foreign });
                if (result.ok) set("state", result.normalized);
              }}
              aria-invalid={Boolean(errors.state)}
            />
            {errors.state ? (
              <p className="text-xs text-destructive">{errors.state}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {foreign ? t("guest.stateHintForeign") : t("guest.stateHint")}
              </p>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="country">{`${t("guest.country")} *`}</Label>
          <SearchableSelect
            id="country"
            options={countryOptions}
            value={String(guest.country ?? "")}
            placeholder={countriesLoading ? t("common.loading") : t("common.select")}
            maxResults={300}
            onChange={(value) => set("country", value)}
          />
          {errors["country"] && <p className="text-xs text-destructive">{errors["country"]}</p>}
        </div>
      </section>

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="tap-safe" onClick={onBack}>
          {t("common.back")}
        </Button>
        <Button type="submit" className="tap-safe flex-1" disabled={countriesLoading}>
          {t("common.continue")}
        </Button>
      </div>
    </form>
  );
}
