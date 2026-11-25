import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import {
  adminGetWhatsAppChatStatus,
  adminListWhatsAppTemplates,
  adminPreviewWhatsAppCheckinTemplate,
} from "@/lib/api/admin.functions";
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
import { suggestWhatsAppVariableKeys, WHATSAPP_TEMPLATE_VARIABLE_KEYS } from "@/lib/whatsapp-chat/variables";
import type { WhatsAppChatTemplate, WhatsAppInboxType } from "@/lib/whatsapp-chat/types";
import { useI18n } from "@/lib/i18n/context";

type Props = {
  mode?: "guest" | "governance";
  establishmentId: string;
  establishmentName: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  templateId: string | null;
  onTemplateChange: (template: WhatsAppChatTemplate | null) => void;
  variableKeys: string[];
  onVariableKeysChange: (keys: string[]) => void;
  variableCount: number;
  onVariableCountChange: (count: number) => void;
  sendToWa: boolean;
  onSendToWaChange: (value: boolean) => void;
  inboxType: WhatsAppInboxType;
  onInboxTypeChange: (value: WhatsAppInboxType) => void;
  phones?: string[];
  onPhonesChange?: (phones: string[]) => void;
};

export function EstablishmentWhatsAppPanel({
  mode = "guest",
  establishmentId,
  establishmentName,
  enabled,
  onEnabledChange,
  templateId,
  onTemplateChange,
  variableKeys,
  onVariableKeysChange,
  variableCount,
  onVariableCountChange,
  sendToWa,
  onSendToWaChange,
  inboxType,
  onInboxTypeChange,
  phones = [],
  onPhonesChange,
}: Props) {
  const { t } = useI18n();
  const getStatus = useServerFn(adminGetWhatsAppChatStatus);
  const listTemplates = useServerFn(adminListWhatsAppTemplates);
  const previewTemplate = useServerFn(adminPreviewWhatsAppCheckinTemplate);

  const [configured, setConfigured] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templates, setTemplates] = useState<WhatsAppChatTemplate[]>([]);
  const [preview, setPreview] = useState("");
  const [previewParams, setPreviewParams] = useState<string[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState("");

  const isGovernance = mode === "governance";

  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === templateId) ?? null,
    [templates, templateId],
  );

  useEffect(() => {
    void getStatus()
      .then((status) => setConfigured(status.configured))
      .finally(() => setLoadingStatus(false));
  }, [getStatus]);

  async function handleLoadTemplates() {
    setLoadingTemplates(true);
    try {
      const result = await listTemplates();
      setTemplates(result.templates);
      if (result.templates.length === 0) {
        toast.message(t("admin.establishmentConfig.whatsappNoTemplates"));
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("admin.establishmentConfig.whatsappTemplatesFailed"),
      );
    } finally {
      setLoadingTemplates(false);
    }
  }

  useEffect(() => {
    if (!configured || templates.length > 0) return;
    void handleLoadTemplates();
  }, [configured]);

  useEffect(() => {
    if (!selectedTemplate) {
      setPreview("");
      setPreviewParams([]);
      return;
    }

    const count = selectedTemplate.bodyVariableCount;
    if (variableCount !== count) onVariableCountChange(count);

    let keys = variableKeys;
    if (keys.length !== count) {
      keys = suggestWhatsAppVariableKeys(count, isGovernance ? "governance" : "guest");
      onVariableKeysChange(keys);
    }

    setLoadingPreview(true);
    void previewTemplate({
      data: {
        establishmentId,
        templateBody: selectedTemplate.body,
        variableKeys: keys,
      },
    })
      .then((result) => {
        setPreview(result.preview);
        setPreviewParams(result.parameters);
      })
      .catch(() => {
        setPreview("");
        setPreviewParams([]);
      })
      .finally(() => setLoadingPreview(false));
  }, [selectedTemplate?.id, selectedTemplate?.body, variableKeys.join("|"), establishmentId]);

  function handleSelectTemplate(id: string) {
    const template = templates.find((item) => item.id === id) ?? null;
    onTemplateChange(template);
    if (template) {
      const suggested = suggestWhatsAppVariableKeys(
        template.bodyVariableCount,
        isGovernance ? "governance" : "guest",
      );
      onVariableKeysChange(suggested);
      onVariableCountChange(template.bodyVariableCount);
    }
  }

  function updateVariableKey(index: number, value: string) {
    const next = [...variableKeys];
    next[index] = value;
    onVariableKeysChange(next);
  }

  function addPhone() {
    if (!onPhonesChange) return;
    const digits = phoneDraft.replace(/\D/g, "");
    if (digits.length < 10) {
      toast.error(t("admin.establishmentConfig.whatsappGovernancePhoneInvalid"));
      return;
    }
    if (phones.includes(digits)) {
      setPhoneDraft("");
      return;
    }
    if (phones.length >= 10) {
      toast.error(t("admin.establishmentConfig.whatsappGovernancePhoneLimit"));
      return;
    }
    onPhonesChange([...phones, digits]);
    setPhoneDraft("");
  }

  function removePhone(phone: string) {
    onPhonesChange?.(phones.filter((item) => item !== phone));
  }

  if (loadingStatus) {
    return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;
  }

  if (!configured) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        {t("admin.establishmentConfig.whatsappNotConfigured")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          {isGovernance
            ? t("admin.establishmentConfig.whatsappGovernanceBody")
            : t("admin.establishmentConfig.whatsappBody")}
        </p>
        {!isGovernance ? (
          <>
            <p>{t("admin.establishmentConfig.whatsappVariableHint")}</p>
            <pre className="overflow-x-auto rounded-lg border border-border bg-muted/30 p-3 text-xs leading-relaxed whitespace-pre-wrap">
              {t("admin.establishmentConfig.whatsappTemplateLayoutHint")}
            </pre>
          </>
        ) : (
          <p>{t("admin.establishmentConfig.whatsappGovernanceHint")}</p>
        )}
      </div>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
        <Checkbox checked={enabled} onCheckedChange={(checked) => onEnabledChange(checked === true)} />
        <span className="text-sm">
          {isGovernance
            ? t("admin.establishmentConfig.whatsappGovernanceEnable")
            : t("admin.establishmentConfig.whatsappEnable")}
        </span>
      </label>

      {isGovernance ? (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          <Label>{t("admin.establishmentConfig.whatsappGovernancePhones")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("admin.establishmentConfig.whatsappGovernancePhonesHint")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              value={phoneDraft}
              onChange={(e) => setPhoneDraft(e.target.value)}
              placeholder="5511999999999"
              className="max-w-xs"
            />
            <Button type="button" variant="outline" onClick={addPhone}>
              <Plus className="mr-1 size-4" />
              {t("admin.establishmentConfig.whatsappGovernanceAddPhone")}
            </Button>
          </div>
          {phones.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.establishmentConfig.whatsappGovernancePhonesEmpty")}
            </p>
          ) : (
            <ul className="space-y-2">
              {phones.map((phone) => (
                <li
                  key={phone}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span className="font-code">{phone}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => removePhone(phone)}>
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-card p-4">
        <div className="min-w-[12rem] flex-1 space-y-2">
          <Label htmlFor={`whatsapp-inbox-type-${mode}`}>
            {t("admin.establishmentConfig.whatsappInboxType")}
          </Label>
          <Select
            value={inboxType}
            onValueChange={(value) => onInboxTypeChange(value as WhatsAppInboxType)}
          >
            <SelectTrigger id={`whatsapp-inbox-type-${mode}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ai">{t("admin.establishmentConfig.whatsappInboxTypeAi")}</SelectItem>
              <SelectItem value="human">
                {t("admin.establishmentConfig.whatsappInboxTypeHuman")}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            {t("admin.establishmentConfig.whatsappInboxTypeHint")}
          </p>
        </div>

        <label className="flex min-w-[14rem] items-start gap-3 pb-1">
          <Checkbox
            checked={sendToWa}
            onCheckedChange={(checked) => onSendToWaChange(checked === true)}
          />
          <span className="space-y-1 text-sm">
            <span className="block">{t("admin.establishmentConfig.whatsappSendToWa")}</span>
            <span className="block text-xs text-muted-foreground">
              {t("admin.establishmentConfig.whatsappSendToWaHint")}
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1 space-y-2">
            <Label>{t("admin.establishmentConfig.whatsappTemplate")}</Label>
            <Select value={templateId ?? ""} onValueChange={handleSelectTemplate}>
              <SelectTrigger>
                <SelectValue placeholder={t("admin.establishmentConfig.whatsappTemplatePlaceholder")} />
              </SelectTrigger>
              <SelectContent>
                {templates.map((template) => (
                  <SelectItem key={template.id} value={template.id}>
                    {template.name}
                    {template.providerTemplateId ? "" : ` (${t("admin.establishmentConfig.whatsappDraftLabel")})`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" variant="outline" disabled={loadingTemplates} onClick={() => void handleLoadTemplates()}>
            {loadingTemplates ? t("common.loading") : t("admin.establishmentConfig.whatsappReloadTemplates")}
          </Button>
        </div>

        {selectedTemplate ? (
          <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">{selectedTemplate.name}</p>
            <p className="mt-2 whitespace-pre-wrap">{selectedTemplate.body}</p>
            {selectedTemplate.providerTemplateId ? (
              <p className="mt-2 font-code text-[11px]">
                Meta: {selectedTemplate.providerTemplateId} · {selectedTemplate.templateLanguage ?? "pt_BR"}
              </p>
            ) : (
              <p className="mt-2 text-amber-700">{t("admin.establishmentConfig.whatsappDraftWarning")}</p>
            )}
          </div>
        ) : null}
      </div>

      {selectedTemplate && selectedTemplate.bodyVariableCount > 0 ? (
        <div className="space-y-3">
          <Label>{t("admin.establishmentConfig.whatsappVariableMapping")}</Label>
          <div className="space-y-2">
            {Array.from({ length: selectedTemplate.bodyVariableCount }).map((_, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[80px_1fr] sm:items-center">
                <span className="font-code text-xs text-muted-foreground">{`{{${index + 1}}}`}</span>
                <Select
                  value={variableKeys[index] ?? ""}
                  onValueChange={(value) => updateVariableKey(index, value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t("admin.establishmentConfig.whatsappVariablePlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    {WHATSAPP_TEMPLATE_VARIABLE_KEYS.map((key) => (
                      <SelectItem key={key} value={key}>
                        <span className="font-code">{`{${key}}`}</span>
                        <span className="text-muted-foreground">
                          {" — "}
                          {t(`admin.establishmentConfig.whatsappVar.${key}` as never)}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectedTemplate ? (
        <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-medium text-foreground">
            {t("admin.establishmentConfig.whatsappPreviewTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("admin.establishmentConfig.whatsappPreviewHint", { establishment: establishmentName })}
          </p>
          {loadingPreview ? (
            <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
          ) : (
            <>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{preview || "—"}</p>
              {previewParams.length > 0 ? (
                <ul className="mt-3 space-y-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  {previewParams.map((value, index) => (
                    <li key={index} className="whitespace-pre-wrap">
                      <span className="font-code">{`{{${index + 1}}}`}</span>:
                      <span className="mt-0.5 block pl-4 text-foreground">{value}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
