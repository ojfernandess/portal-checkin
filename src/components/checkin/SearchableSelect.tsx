import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useI18n } from "@/lib/i18n/context";
import type { EmbraturField } from "@/lib/api/types";

type Props = {
  options: EmbraturField[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  searchable?: boolean;
  maxResults?: number;
  id?: string;
  disabled?: boolean;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder,
  id,
  maxResults = 80,
  disabled = false,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    return list.slice(0, maxResults);
  }, [maxResults, options, query]);

  const selected = options.find((o) => o.value === value);

  return (
    <Popover open={open} onOpenChange={(next) => !disabled && setOpen(next)}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className="tap-safe w-full justify-between font-normal"
        >
          <span className={selected ? "" : "text-muted-foreground"}>{selected?.label ?? placeholder}</span>
          <ChevronDown className="size-4 opacity-60" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-2" align="start">
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("checkin.searchable.placeholder")}
          aria-label={t("checkin.searchable.aria")}
          className="mb-2"
        />
        <ul className="max-h-64 overflow-y-auto" role="listbox">
          {filtered.length === 0 && (
            <li className="px-2 py-3 text-sm text-muted-foreground">{t("errors.noResults")}</li>
          )}
          {filtered.map((option) => (
            <li key={option.value}>
              <button
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                  setQuery("");
                }}
                className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-2.5 text-left text-sm hover:bg-muted"
              >
                <span>{option.label}</span>
                {option.value === value && <Check className="size-4 text-accent" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
