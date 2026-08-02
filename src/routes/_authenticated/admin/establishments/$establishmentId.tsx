import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  adminDeleteExtraField,
  adminGetContact,
  adminGetEstablishment,
  adminGetSettings,
  adminGetTerms,
  adminGetTermsHistoryEntry,
  adminListExtraFields,
  adminSaveContact,
  adminSaveExtraField,
  adminSaveSettings,
  adminSaveTerms,
  type ExtraField,
} from "@/lib/api/admin.functions";
import { EstablishmentTermsEditor } from "@/components/admin/EstablishmentTermsEditor";
import { AdminShell, useAdminAccount } from "@/components/admin/AdminShell";
import { PhoneDisplay } from "@/components/checkin/PhoneDisplay";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cloneDefaultSections, type TermsSection } from "@/lib/establishment-terms";
import { useI18n } from "@/lib/i18n/context";
import { maskPhone } from "@/lib/validators";

export const Route = createFileRoute("/_authenticated/admin/establishments/$establishmentId")({
  head: () => ({ meta: [{ title: "Configurar estabelecimento | Painel administrativo" }] }),
  component: EstablishmentConfigPage,
});

function EstablishmentConfigPage() {
  const { establishmentId } = Route.useParams();
  const { t } = useI18n();
  const account = useAdminAccount();
  const getTerms = useServerFn(adminGetTerms);
  const saveTerms = useServerFn(adminSaveTerms);
  const getTermsHistory = useServerFn(adminGetTermsHistoryEntry);
  const getContact = useServerFn(adminGetContact);
  const saveContact = useServerFn(adminSaveContact);
  const getEstablishment = useServerFn(adminGetEstablishment);
  const listFields = useServerFn(adminListExtraFields);
  const saveField = useServerFn(adminSaveExtraField);
  const deleteField = useServerFn(adminDeleteExtraField);
  const getSettings = useServerFn(adminGetSettings);
  const saveSettings = useServerFn(adminSaveSettings);

  const [termsSections, setTermsSections] = useState<TermsSection[]>(cloneDefaultSections());
  const [termsVersion, setTermsVersion] = useState(0);
  const [termsIsDefault, setTermsIsDefault] = useState(true);
  const [termsUpdatedAt, setTermsUpdatedAt] = useState<string | null>(null);
  const [termsHistory, setTermsHistory] = useState<
    { id: string; version: number; createdAt: string; editedBy: string | null }[]
  >([]);
  const [savingTerms, setSavingTerms] = useState(false);
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [fields, setFields] = useState<ExtraField[]>([]);
  const [establishmentName, setEstablishmentName] = useState("");
  const [newField, setNewField] = useState({
    label: "",
    fieldType: "text" as ExtraField["fieldType"],
    required: false,
  });
  const [requireBirthDateConfirmation, setRequireBirthDateConfirmation] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void Promise.all([
      getEstablishment({ data: { establishmentId } }),
      getTerms({ data: { establishmentId } }),
      getContact({ data: { establishmentId } }),
      listFields({ data: { establishmentId } }),
      getSettings({ data: { establishmentId } }),
    ])
      .then(([establishment, terms, contact, extra, settings]) => {
        setEstablishmentName(establishment?.name ?? establishmentId);
        setTermsSections(terms.sections);
        setTermsVersion(terms.version);
        setTermsIsDefault(terms.isDefault);
        setTermsUpdatedAt(terms.updatedAt);
        setTermsHistory(terms.history);
        setPhone(contact.phone ?? "");
        setWhatsapp(contact.whatsapp ?? "");
        setFields(extra.fields);
        setRequireBirthDateConfirmation(settings.settings.requireBirthDateConfirmation);
      })
      .finally(() => setLoading(false));
  }, [establishmentId, getEstablishment, getTerms, getContact, listFields, getSettings]);

  if (account && account.role !== "admin") {
    return (
      <AdminShell title={t("common.establishment")} account={account}>
        <p className="text-sm text-muted-foreground">{t("errors.accessRestricted")}</p>
      </AdminShell>
    );
  }

  async function handleSaveTerms(sections: TermsSection[]) {
    setSavingTerms(true);
    try {
      const result = await saveTerms({
        data: { establishmentId, establishmentName: establishmentName || undefined, sections },
      });
      setTermsVersion(result.version);
      setTermsIsDefault(false);
      setTermsUpdatedAt(new Date().toISOString());
      const refreshed = await getTerms({ data: { establishmentId } });
      setTermsHistory(refreshed.history);
      toast.success(t("admin.establishmentConfig.termsSaved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("admin.establishmentConfig.termsSaveFailed"));
    } finally {
      setSavingTerms(false);
    }
  }

  async function handleLoadHistory(historyId: string) {
    const entry = await getTermsHistory({ data: { establishmentId, historyId } });
    return entry.sections;
  }

  async function handleSaveContact() {
    if (!phone.trim() && !whatsapp.trim()) {
      toast.error(t("admin.establishmentConfig.contactRequired"));
      return;
    }
    await saveContact({
      data: { establishmentId, establishmentName: establishmentName || undefined, phone, whatsapp },
    });
    toast.success(t("admin.establishmentConfig.contactSaved"));
  }

  async function handleAddField() {
    if (!newField.label.trim()) return;
    await saveField({
      data: { establishmentId, ...newField, sortOrder: fields.length },
    });
    const updated = await listFields({ data: { establishmentId } });
    setFields(updated.fields);
    setNewField({ label: "", fieldType: "text", required: false });
    toast.success(t("admin.establishmentConfig.fieldAdded"));
  }

  async function handleSaveSettings() {
    setSavingSettings(true);
    try {
      await saveSettings({
        data: { establishmentId, requireBirthDateConfirmation },
      });
      toast.success(t("admin.establishmentConfig.settingsSaved"));
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : t("admin.establishmentConfig.settingsSaveFailed"),
      );
    } finally {
      setSavingSettings(false);
    }
  }

  const pageTitle =
    establishmentName || t("admin.establishmentConfig.titleFallback", { id: establishmentId });

  return (
    <AdminShell title={pageTitle} account={account}>
      <p className="mb-4 font-code text-xs text-muted-foreground">
        {t("admin.establishmentsPage.establishmentId")}: {establishmentId}
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
      ) : (
        <Tabs defaultValue="terms">
          <TabsList>
            <TabsTrigger value="terms">{t("admin.establishmentConfig.tabTerms")}</TabsTrigger>
            <TabsTrigger value="contact">{t("admin.establishmentConfig.tabContact")}</TabsTrigger>
            <TabsTrigger value="checkin">{t("admin.establishmentConfig.tabCheckin")}</TabsTrigger>
            <TabsTrigger value="fields">{t("admin.establishmentConfig.tabFields")}</TabsTrigger>
          </TabsList>

          <TabsContent value="terms" className="mt-6">
            <EstablishmentTermsEditor
              establishmentName={establishmentName}
              sections={termsSections}
              version={termsVersion}
              isDefault={termsIsDefault}
              updatedAt={termsUpdatedAt}
              history={termsHistory}
              saving={savingTerms}
              onChange={setTermsSections}
              onSave={handleSaveTerms}
              onLoadHistory={handleLoadHistory}
            />
          </TabsContent>

          <TabsContent value="contact" className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">{t("admin.establishmentConfig.contactBody")}</p>
            <div className="space-y-2">
              <Label htmlFor="phone">{t("admin.establishmentConfig.supportPhone")}</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(maskPhone(e.target.value))}
                placeholder="+55 (11) 99999-9999"
              />
              {phone.trim() ? (
                <p className="text-xs text-muted-foreground">
                  {t("common.preview")}: <PhoneDisplay phone={phone} className="inline-flex" />
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="whatsapp">{t("common.whatsapp")}</Label>
              <Input
                id="whatsapp"
                value={whatsapp}
                onChange={(e) => setWhatsapp(maskPhone(e.target.value))}
                placeholder="+55 (11) 99999-9999"
              />
              {whatsapp.trim() ? (
                <p className="text-xs text-muted-foreground">
                  {t("common.preview")}: <PhoneDisplay phone={whatsapp} className="inline-flex" />
                </p>
              ) : null}
            </div>
            <Button onClick={() => void handleSaveContact()}>{t("admin.establishmentConfig.saveContact")}</Button>
          </TabsContent>

          <TabsContent value="checkin" className="mt-6 space-y-4">
            <p className="text-sm text-muted-foreground">{t("admin.establishmentConfig.checkinBody")}</p>
            <label className="flex items-start gap-3 rounded-xl border border-border p-4">
              <Checkbox
                checked={requireBirthDateConfirmation}
                onCheckedChange={(checked) => setRequireBirthDateConfirmation(checked === true)}
                className="mt-0.5"
              />
              <span className="space-y-1">
                <span className="block text-sm font-medium">
                  {t("admin.establishmentConfig.requireBirthDateConfirmation")}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t("admin.establishmentConfig.requireBirthDateConfirmationHint")}
                </span>
              </span>
            </label>
            <Button disabled={savingSettings} onClick={() => void handleSaveSettings()}>
              {t("admin.establishmentConfig.saveCheckinSettings")}
            </Button>
          </TabsContent>

          <TabsContent value="fields" className="mt-6 space-y-4">
            {fields.map((field) => (
              <div
                key={field.id}
                className="flex items-center justify-between rounded-lg border border-border p-3"
              >
                <div>
                  <p className="font-medium">{field.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {field.fieldType} ·{" "}
                    {field.required ? t("common.required") : t("common.optional")}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() =>
                    void deleteField({ data: { id: field.id } }).then(() =>
                      listFields({ data: { establishmentId } }).then((r) => setFields(r.fields)),
                    )
                  }
                >
                  {t("common.remove")}
                </Button>
              </div>
            ))}

            <div className="rounded-xl border border-dashed border-border p-4 space-y-3">
              <p className="text-sm font-medium">{t("admin.establishmentConfig.newField")}</p>
              <Input
                placeholder={t("common.label")}
                value={newField.label}
                onChange={(e) => setNewField((c) => ({ ...c, label: e.target.value }))}
              />
              <Select
                value={newField.fieldType}
                onValueChange={(v) =>
                  setNewField((c) => ({ ...c, fieldType: v as ExtraField["fieldType"] }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">{t("admin.establishmentConfig.fieldText")}</SelectItem>
                  <SelectItem value="select">{t("admin.establishmentConfig.fieldSelect")}</SelectItem>
                  <SelectItem value="checkbox">{t("admin.establishmentConfig.fieldCheckbox")}</SelectItem>
                  <SelectItem value="date">{t("admin.establishmentConfig.fieldDate")}</SelectItem>
                  <SelectItem value="phone">{t("admin.establishmentConfig.fieldPhone")}</SelectItem>
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={newField.required}
                  onCheckedChange={(c) => setNewField((f) => ({ ...f, required: c === true }))}
                />
                {t("admin.establishmentConfig.fieldRequired")}
              </label>
              <Button onClick={() => void handleAddField()}>{t("admin.establishmentConfig.addField")}</Button>
            </div>
          </TabsContent>
        </Tabs>
      )}
    </AdminShell>
  );
}
