import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  birthDateToDisplayBr,
  birthDateToIso,
  isCompleteBirthDateInput,
  maskBirthDateBr,
} from "@/lib/birth-date";
import { cn } from "@/lib/utils";

type Props = {
  id: string;
  value: string;
  onChange: (isoOrEmpty: string) => void;
  className?: string;
  "aria-invalid"?: boolean;
  autoComplete?: string;
  disabled?: boolean;
  placeholder?: string;
};

/**
 * Campo de data de nascimento digitável (DD/MM/AAAA).
 * Emite valor ISO (yyyy-mm-dd) quando completo e válido; string vazia quando limpo.
 */
export function BirthDateInput({
  id,
  value,
  onChange,
  className,
  disabled,
  placeholder = "DD/MM/AAAA",
  ...rest
}: Props) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => birthDateToDisplayBr(value));

  useEffect(() => {
    if (!focused) {
      setDraft(birthDateToDisplayBr(value));
    }
  }, [value, focused]);

  function handleChange(raw: string) {
    const masked = maskBirthDateBr(raw);
    setDraft(masked);

    if (!masked) {
      onChange("");
      return;
    }

    if (!isCompleteBirthDateInput(masked)) return;

    const iso = birthDateToIso(masked);
    onChange(iso ?? "");
  }

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete={rest.autoComplete ?? "bday"}
      placeholder={placeholder}
      disabled={disabled}
      className={cn("tap-safe font-code", className)}
      value={draft}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        const iso = birthDateToIso(draft);
        if (iso) {
          onChange(iso);
          setDraft(birthDateToDisplayBr(iso));
        } else if (!draft.trim()) {
          onChange("");
        } else if (isCompleteBirthDateInput(draft)) {
          onChange("");
        }
      }}
      onChange={(event) => handleChange(event.target.value)}
      aria-invalid={rest["aria-invalid"]}
      maxLength={10}
    />
  );
}
