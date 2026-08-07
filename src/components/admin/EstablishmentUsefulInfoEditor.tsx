import { ArrowDown, ArrowUp, Plus, Trash2, Wifi } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  UsefulInfoVariablePicker,
  UsefulInfoVariablesLegend,
} from "@/components/admin/UsefulInfoVariablePicker";
import { useI18n } from "@/lib/i18n/context";
import {
  MAX_USEFUL_INFO_ITEMS,
  type UsefulInfoItem,
  type UsefulInfoItemKind,
} from "@/lib/establishment-settings";

type Props = {
  items: UsefulInfoItem[];
  saving: boolean;
  onChange: (items: UsefulInfoItem[]) => void;
  onSave: () => void;
};

type ActiveField = "value" | "secret";

const KIND_OPTIONS: UsefulInfoItemKind[] = [
  "wifi",
  "access",
  "amenity",
  "parking",
  "hours",
  "info",
  "custom",
];

function createItem(kind: UsefulInfoItemKind, sortOrder: number, title = ""): UsefulInfoItem {
  return {
    id: crypto.randomUUID(),
    kind,
    title,
    value: "",
    secret: null,
    sortOrder,
  };
}

function insertAtCursor(
  element: HTMLInputElement | HTMLTextAreaElement | null,
  token: string,
  currentValue: string,
): string {
  if (!element) return currentValue ? `${currentValue} ${token}` : token;
  const start = element.selectionStart ?? currentValue.length;
  const end = element.selectionEnd ?? currentValue.length;
  const next = `${currentValue.slice(0, start)}${token}${currentValue.slice(end)}`;
  requestAnimationFrame(() => {
    const cursor = start + token.length;
    element.focus();
    element.setSelectionRange(cursor, cursor);
  });
  return next;
}

function UsefulInfoItemEditor({
  item,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  item: UsefulInfoItem;
  index: number;
  total: number;
  onUpdate: (patch: Partial<UsefulInfoItem>) => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  const { t } = useI18n();
  const valueRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const secretRef = useRef<HTMLInputElement>(null);
  const [activeField, setActiveField] = useState<ActiveField>("value");
  const showSecret = item.kind === "wifi" || item.kind === "access" || item.kind === "parking";
  const isLongText = item.kind === "access" || item.kind === "parking";

  function insertToken(token: string) {
    if (activeField === "secret") {
      onUpdate({ secret: insertAtCursor(secretRef.current, token, item.secret ?? "") || null });
      return;
    }
    onUpdate({ value: insertAtCursor(valueRef.current, token, item.value) });
  }

  return (
    <li className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-sm font-medium text-foreground">
          {t("admin.establishmentConfig.usefulInfoItemLabel", { n: index + 1 })}
        </p>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={t("admin.establishmentConfig.usefulInfoMoveUp")}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label={t("admin.establishmentConfig.usefulInfoMoveDown")}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label={t("common.remove")}
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>{t("admin.establishmentConfig.usefulInfoKindLabel")}</Label>
          <Select
            value={item.kind}
            onValueChange={(value) => onUpdate({ kind: value as UsefulInfoItemKind })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_OPTIONS.map((kind) => (
                <SelectItem key={kind} value={kind}>
                  {t(`admin.establishmentConfig.usefulInfoKind.${kind}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{t("admin.establishmentConfig.usefulInfoTitleLabel")}</Label>
          <Input
            value={item.title}
            onChange={(e) => onUpdate({ title: e.target.value })}
            placeholder={t("admin.establishmentConfig.usefulInfoTitlePlaceholder")}
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label>
            {item.kind === "wifi"
              ? t("admin.establishmentConfig.usefulInfoNetworkLabel")
              : item.kind === "access"
                ? t("admin.establishmentConfig.usefulInfoAccessStepsLabel")
                : item.kind === "parking"
                  ? t("admin.establishmentConfig.usefulInfoParkingDetailsLabel")
                  : t("admin.establishmentConfig.usefulInfoValueLabel")}
          </Label>
          {isLongText ? (
            <>
              <Textarea
                ref={valueRef as React.RefObject<HTMLTextAreaElement>}
                value={item.value}
                onFocus={() => setActiveField("value")}
                onChange={(e) => onUpdate({ value: e.target.value })}
                placeholder={
                  item.kind === "access"
                    ? t("admin.establishmentConfig.usefulInfoAccessStepsPlaceholder")
                    : t("admin.establishmentConfig.usefulInfoParkingDetailsPlaceholder")
                }
                rows={item.kind === "parking" ? 6 : 8}
                className="min-h-[9rem] resize-y text-sm leading-relaxed"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {item.kind === "access"
                  ? t("admin.establishmentConfig.usefulInfoAccessStepsHint")
                  : t("admin.establishmentConfig.usefulInfoParkingDetailsHint")}
              </p>
            </>
          ) : (
            <Input
              ref={valueRef as React.RefObject<HTMLInputElement>}
              value={item.value}
              onFocus={() => setActiveField("value")}
              onChange={(e) => onUpdate({ value: e.target.value })}
              placeholder={
                item.kind === "wifi"
                  ? t("admin.establishmentConfig.usefulInfoNetworkPlaceholder")
                  : t("admin.establishmentConfig.usefulInfoValuePlaceholder")
              }
            />
          )}
        </div>
        {showSecret ? (
          <div className="space-y-2 sm:col-span-2">
            <Label>
              {item.kind === "access"
                ? t("admin.establishmentConfig.usefulInfoAccessSecretLabel")
                : item.kind === "parking"
                  ? t("admin.establishmentConfig.usefulInfoParkingPriceLabel")
                  : t("admin.establishmentConfig.usefulInfoSecretLabel")}
            </Label>
            <Input
              ref={secretRef}
              value={item.secret ?? ""}
              onFocus={() => setActiveField("secret")}
              onChange={(e) =>
                onUpdate({ secret: e.target.value.trim() ? e.target.value : null })
              }
              placeholder={
                item.kind === "parking"
                  ? t("admin.establishmentConfig.usefulInfoParkingPricePlaceholder")
                  : t("admin.establishmentConfig.usefulInfoSecretPlaceholder")
              }
            />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <UsefulInfoVariablePicker onInsert={insertToken} />
        </div>
      </div>
    </li>
  );
}

export function EstablishmentUsefulInfoEditor({ items, saving, onChange, onSave }: Props) {
  const { t } = useI18n();

  function updateItem(id: string, patch: Partial<UsefulInfoItem>) {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }

  function removeItem(id: string) {
    onChange(
      items.filter((item) => item.id !== id).map((item, index) => ({ ...item, sortOrder: index })),
    );
  }

  function moveItem(id: string, direction: -1 | 1) {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) return;
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((item, sortOrder) => ({ ...item, sortOrder })));
  }

  function addTemplate(kind: UsefulInfoItemKind) {
    if (items.length >= MAX_USEFUL_INFO_ITEMS) return;
    onChange([
      ...items,
      createItem(kind, items.length, t(`admin.establishmentConfig.usefulInfoKind.${kind}`)),
    ]);
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">{t("admin.establishmentConfig.usefulInfoBody")}</p>
        <UsefulInfoVariablesLegend />
      </div>

      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 px-4 py-8 text-center">
          <Wifi className="mx-auto mb-3 size-8 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">{t("admin.establishmentConfig.usefulInfoEmpty")}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((item, index) => (
            <UsefulInfoItemEditor
              key={item.id}
              item={item}
              index={index}
              total={items.length}
              onUpdate={(patch) => updateItem(item.id, patch)}
              onRemove={() => removeItem(item.id)}
              onMove={(direction) => moveItem(item.id, direction)}
            />
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Select
          onValueChange={(value) => addTemplate(value as UsefulInfoItemKind)}
          disabled={items.length >= MAX_USEFUL_INFO_ITEMS}
        >
          <SelectTrigger className="w-full sm:w-60">
            <SelectValue placeholder={t("admin.establishmentConfig.usefulInfoAddTemplate")} />
          </SelectTrigger>
          <SelectContent>
            {KIND_OPTIONS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {t(`admin.establishmentConfig.usefulInfoKind.${kind}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={items.length >= MAX_USEFUL_INFO_ITEMS}
          onClick={() => addTemplate("custom")}
        >
          <Plus className="size-4" />
          {t("admin.establishmentConfig.usefulInfoAddCustom")}
        </Button>
      </div>

      <Button disabled={saving} onClick={onSave}>
        {t("admin.establishmentConfig.saveUsefulInfo")}
      </Button>
    </div>
  );
}
