import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import type { InboxUnitMapping } from "@/lib/establishment-settings";
import { useI18n } from "@/lib/i18n/context";

export type InboxManagedUnitOption = {
  id: number;
  display_name: string;
  status: string;
  enterprise?: { name?: string };
  apartment?: { identifier?: string; block?: { name?: string } };
};

type Props = {
  inboxEnabled: boolean;
  inboxManagedUnitId: number | null;
  inboxUnitMappings: InboxUnitMapping[];
  units: InboxManagedUnitOption[];
  unitsLoading: boolean;
  inboxConfigured: boolean;
  saving: boolean;
  onChangeEnabled: (value: boolean) => void;
  onChangeManagedUnitId: (value: number | null) => void;
  onChangeMappings: (value: InboxUnitMapping[]) => void;
  onSave: () => void;
  onRefreshUnits: () => void;
};

function formatUnitLabel(unit: InboxManagedUnitOption): string {
  const enterprise = unit.enterprise?.name?.trim();
  const block = unit.apartment?.block?.name?.trim();
  const identifier = unit.apartment?.identifier?.trim();
  const parts = [enterprise, block, identifier, unit.display_name].filter(Boolean);
  return `#${unit.id} — ${parts.join(" · ")}`;
}

export function EstablishmentInboxPanel({
  inboxEnabled,
  inboxManagedUnitId,
  inboxUnitMappings,
  units,
  unitsLoading,
  inboxConfigured,
  saving,
  onChangeEnabled,
  onChangeManagedUnitId,
  onChangeMappings,
  onSave,
  onRefreshUnits,
}: Props) {
  const { t } = useI18n();
  const [mappingMatch, setMappingMatch] = useState("");
  const [mappingUnitId, setMappingUnitId] = useState<string>("");

  useEffect(() => {
    if (!mappingUnitId && units.length > 0) {
      setMappingUnitId(String(units[0]!.id));
    }
  }, [mappingUnitId, units]);

  function addMapping() {
    const match = mappingMatch.trim();
    const managedUnitId = Number(mappingUnitId);
    if (!match || !Number.isInteger(managedUnitId) || managedUnitId <= 0) return;
    if (inboxUnitMappings.some((item) => item.match === match && item.managedUnitId === managedUnitId)) {
      return;
    }
    onChangeMappings([...inboxUnitMappings, { match, managedUnitId }]);
    setMappingMatch("");
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">{t("admin.establishmentConfig.inboxBody")}</p>

      {!inboxConfigured ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-100">
          {t("admin.establishmentConfig.inboxNotConfigured")}
        </div>
      ) : null}

      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <Checkbox
          checked={inboxEnabled}
          onCheckedChange={(checked) => onChangeEnabled(checked === true)}
          className="mt-0.5"
          disabled={!inboxConfigured}
        />
        <span className="space-y-1">
          <span className="block text-sm font-medium">{t("admin.establishmentConfig.inboxEnabled")}</span>
          <span className="block text-xs text-muted-foreground">
            {t("admin.establishmentConfig.inboxEnabledHint")}
          </span>
        </span>
      </label>

      <div className="space-y-2 rounded-xl border border-border p-4">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="inbox-managed-unit">{t("admin.establishmentConfig.inboxDefaultUnit")}</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={unitsLoading || !inboxConfigured}
            onClick={onRefreshUnits}
          >
            {unitsLoading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            {t("admin.establishmentConfig.inboxRefreshUnits")}
          </Button>
        </div>
        <Select
          value={inboxManagedUnitId != null ? String(inboxManagedUnitId) : ""}
          onValueChange={(value) => onChangeManagedUnitId(value ? Number(value) : null)}
          disabled={!inboxConfigured || !inboxEnabled}
        >
          <SelectTrigger id="inbox-managed-unit" className="w-full">
            <SelectValue placeholder={t("admin.establishmentConfig.inboxSelectUnit")} />
          </SelectTrigger>
          <SelectContent>
            {units.map((unit) => (
              <SelectItem key={unit.id} value={String(unit.id)}>
                {formatUnitLabel(unit)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{t("admin.establishmentConfig.inboxDefaultUnitHint")}</p>
      </div>

      <div className="space-y-3 rounded-xl border border-border p-4">
        <div className="space-y-1">
          <p className="text-sm font-medium">{t("admin.establishmentConfig.inboxUnitMappings")}</p>
          <p className="text-xs text-muted-foreground">{t("admin.establishmentConfig.inboxUnitMappingsHint")}</p>
        </div>

        {inboxUnitMappings.length > 0 ? (
          <ul className="space-y-2">
            {inboxUnitMappings.map((mapping, index) => (
              <li
                key={`${mapping.match}-${mapping.managedUnitId}-${index}`}
                className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-medium">{mapping.match}</span>
                  <span className="text-muted-foreground"> → #{mapping.managedUnitId}</span>
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={t("common.remove")}
                  onClick={() =>
                    onChangeMappings(inboxUnitMappings.filter((_, itemIndex) => itemIndex !== index))
                  }
                >
                  <Trash2 className="size-4" aria-hidden />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t("admin.establishmentConfig.inboxUnitMappingsEmpty")}</p>
        )}

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <Input
            value={mappingMatch}
            onChange={(event) => setMappingMatch(event.target.value)}
            placeholder={t("admin.establishmentConfig.inboxMappingMatchPlaceholder")}
            disabled={!inboxConfigured || !inboxEnabled}
          />
          <Select
            value={mappingUnitId}
            onValueChange={setMappingUnitId}
            disabled={!inboxConfigured || !inboxEnabled || units.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("admin.establishmentConfig.inboxSelectUnit")} />
            </SelectTrigger>
            <SelectContent>
              {units.map((unit) => (
                <SelectItem key={`map-${unit.id}`} value={String(unit.id)}>
                  {formatUnitLabel(unit)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="outline"
            onClick={addMapping}
            disabled={!inboxConfigured || !inboxEnabled}
          >
            <Plus className="size-4" aria-hidden />
            {t("admin.establishmentConfig.inboxAddMapping")}
          </Button>
        </div>
      </div>

      <Button disabled={saving || !inboxConfigured} onClick={onSave}>
        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {t("admin.establishmentConfig.saveInboxSettings")}
      </Button>
    </div>
  );
}
