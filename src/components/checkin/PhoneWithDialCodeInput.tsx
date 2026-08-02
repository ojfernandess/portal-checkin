import { useEffect, useId, useMemo, useState } from "react";
import type { CountryCode } from "libphonenumber-js";
import { ChevronDown, Globe2 } from "lucide-react";
import { CountryFlag } from "@/components/checkin/CountryFlag";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n/context";
import {
  filterPhoneCountries,
  getCountryLabel,
  isoToCallingCode,
  resolveDialDigits,
} from "@/lib/phone-calling-codes";
import {
  formatPhoneWithDialCode,
  splitPhoneInput,
} from "@/lib/phone-display";
import { maskPhone, onlyDigits } from "@/lib/validators";

type Props = {
  id?: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  defaultCallingCode?: string;
  error?: string;
  required?: boolean;
};

export function PhoneWithDialCodeInput({
  id,
  label,
  value,
  onChange,
  defaultCallingCode = "55",
  error,
  required = false,
}: Props) {
  const { t, locale } = useI18n();
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const fallbackIso = (defaultCallingCode === "55" ? "BR" : "US") as CountryCode;

  const [dialDigits, setDialDigits] = useState(defaultCallingCode);
  const [national, setNational] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");

  const dialResolve = useMemo(
    () => resolveDialDigits(dialDigits, fallbackIso),
    [dialDigits, fallbackIso],
  );

  const effectiveCallingCode = dialResolve.complete
    ? dialResolve.callingCode
    : dialResolve.callingCode || defaultCallingCode;

  const displayIso = dialResolve.iso;

  useEffect(() => {
    const parts = splitPhoneInput(value, defaultCallingCode);
    setDialDigits(parts.callingCode);
    setNational(parts.iso === "BR" ? maskPhone(parts.nationalDigits) : parts.nationalDigits);
  }, [value, defaultCallingCode]);

  const countryOptions = useMemo(
    () => filterPhoneCountries(search, locale).slice(0, 120),
    [locale, search],
  );

  function emit(nextDialDigits: string, nextNational: string) {
    const resolved = resolveDialDigits(nextDialDigits, fallbackIso);
    const callingCode = resolved.complete
      ? resolved.callingCode
      : resolved.callingCode || defaultCallingCode;
    onChange(formatPhoneWithDialCode(callingCode, nextNational));
  }

  function handleDialDigitsChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    setDialDigits(digits);
    emit(digits, national);
  }

  function handleNationalChange(raw: string) {
    const iso = displayIso ?? fallbackIso;
    const nextNational =
      iso === "BR" ? maskPhone(raw) : raw.replace(/[^\d\s()-]/g, "");
    setNational(nextNational);
    emit(dialDigits, nextNational);
  }

  function selectCountry(iso: CountryCode) {
    const callingCode = isoToCallingCode(iso);
    setDialDigits(callingCode);
    setPickerOpen(false);
    setSearch("");
    emit(callingCode, national);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={inputId}>
        {label}
        {required ? " *" : ""}
      </Label>
      <div className="flex gap-2">
        <div className="flex shrink-0 items-stretch rounded-md border border-input bg-background shadow-sm">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="tap-safe h-auto gap-1 rounded-none rounded-l-md border-0 px-2 py-2"
                aria-label={t("guest.dialCodeSearch")}
              >
                {displayIso ? (
                  <CountryFlag iso={displayIso} size="md" />
                ) : (
                  <Globe2 className="size-5 text-muted-foreground" aria-hidden />
                )}
                <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(100vw-2rem,22rem)] p-0" align="start">
              <Command shouldFilter={false}>
                <CommandInput
                  placeholder={t("guest.dialCodeSearchPlaceholder")}
                  value={search}
                  onValueChange={setSearch}
                />
                <CommandList className="max-h-64">
                  <CommandEmpty>{t("guest.dialCodeSearchEmpty")}</CommandEmpty>
                  <CommandGroup>
                    {countryOptions.map((entry) => (
                      <CommandItem
                        key={entry.iso}
                        value={entry.iso}
                        onSelect={() => selectCountry(entry.iso)}
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <CountryFlag iso={entry.iso} />
                          <span className="truncate">{getCountryLabel(entry.iso, locale)}</span>
                        </span>
                        <span className="font-code text-muted-foreground">+{entry.callingCode}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <div className="flex items-center border-l border-input px-2">
            <span className="text-sm text-muted-foreground">+</span>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="tel-country-code"
              aria-label={t("guest.dialCode")}
              value={dialDigits}
              onChange={(event) => handleDialDigitsChange(event.target.value)}
              placeholder={defaultCallingCode}
              className="w-[3.25rem] bg-transparent py-2 font-code text-sm outline-none placeholder:text-muted-foreground"
              maxLength={4}
            />
          </div>
        </div>
        <Input
          id={inputId}
          className="tap-safe min-w-0 flex-1"
          inputMode="tel"
          autoComplete="tel-national"
          value={national}
          onChange={(event) => handleNationalChange(event.target.value)}
          placeholder={
            displayIso === "BR" || (!displayIso && defaultCallingCode === "55")
              ? "(11) 90000-0000"
              : t("guest.mobilePhoneNationalPlaceholder")
          }
          aria-invalid={Boolean(error)}
        />
      </div>
      <p className="text-xs text-muted-foreground">{t("guest.mobilePhoneDdiHint")}</p>
      {dialResolve.ambiguous && dialDigits ? (
        <p className="text-xs text-muted-foreground">{t("guest.dialCodeAmbiguous")}</p>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      {value.trim() && onlyDigits(national).length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("common.preview")}: {formatPhoneWithDialCode(effectiveCallingCode, national)}
        </p>
      ) : null}
    </div>
  );
}
