import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  adminGetWhatsAppChatStatus,
  adminListWhatsAppTemplates,
  adminPreviewWhatsAppCheckinTemplate,
} from "@/lib/api/admin.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { suggestWhatsAppVariableKeys, WHATSAPP_TEMPLATE_VARIABLE_KEYS } from "@/lib/whatsapp-chat/variables";
import type { WhatsAppChatTemplate } from "@/lib/whatsapp-chat/types";
import { useI18n } from "@/lib/i18n/context";

type Props = {
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
};

export function EstablishmentWhatsAppPanel({
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
      keys = suggestWhatsAppVariableKeys(count);
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
      const suggested = suggestWhatsAppVariableKeys(template.bodyVariableCount);
      onVariableKeysChange(suggested);
      onVariableCountChange(template.bodyVariableCount);
    }
  }

  function updateVariableKey(index: number, value: string) {
    const next = [...variableKeys];
    next[index] = value;
    onVariableKeysChange(next);
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
      <p className="text-sm text-muted-foreground">{t("admin.establishmentConfig.whatsappBody")}</p>

      <label className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
        <Checkbox checked={enabled} onCheckedChange={(checked) => onEnabledChange(checked === true)} />
        <span className="text-sm">{t("admin.establishmentConfig.whatsappEnable")}</span>
      </label>

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
                        {`{${key}}`}
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
                    <li key={index}>
                      <span className="font-code">{`{{${index + 1}}}`}</span>: {value}
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
