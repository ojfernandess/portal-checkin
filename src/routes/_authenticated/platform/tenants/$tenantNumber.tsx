import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import {
  PlatformCard,
  PlatformSection,
  PlatformShell,
  PlatformTableWrap,
  usePlatformAccount,
} from "@/components/admin/PlatformShell";
import { TenantLogoEditor } from "@/components/admin/TenantLogoEditor";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { buildTenantLoginUrl } from "@/lib/api/auth.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  platformAddTenantMember,
  platformGetTenant,
  platformListTenantMembers,
  platformRemoveTenantMember,
  platformSaveTenantInboxConfig,
  platformSaveTenantZepirisConfig,
  platformSaveTenantPmsConfig,
  platformSaveTenantLogo,
  platformUpdateTenant,
  platformUpdateTenantFeatures,
  type PlatformTenantMember,
  type PlatformTenantStatus,
} from "@/lib/api/platform.functions";
import { INBOX_MODULE_KEYS, DEFAULT_INBOX_MODULES, type InboxModuleKey, type InboxModules } from "@/lib/inbox/modules";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/platform/tenants/$tenantNumber")({
  head: () => ({ meta: [{ title: "Super Admin | Empresa" }] }),
  component: PlatformTenantDetailPage,
});

const FEATURE_LABELS: Record<string, string> = {
  pms_vivakey: "PMS Vivakey",
  portaria_inbox: "Portaria Inbox",
  zepiris_photo_validation: "Validação inteligente de fotos",
};

const TOKEN_FIELDS = [
  { key: "reservations", label: "Reservations (vkr_loc_…)" },
  { key: "hub", label: "Hub / Check-in (vkr_chk_…)" },
  { key: "admin", label: "Admin" },
  { key: "checkouts", label: "Check-outs" },
  { key: "created", label: "Reservas criadas" },
  { key: "api", label: "API (fallback)" },
] as const;

const INBOX_MODULE_LABEL_KEYS: Record<InboxModuleKey, string> = {
  portfolio: "admin.inbox.modulePortfolio",
  units: "admin.inbox.moduleUnits",
  stays: "admin.inbox.moduleStays",
  guests: "admin.inbox.moduleGuests",
  readers: "admin.inbox.moduleReaders",
};

function PlatformTenantDetailPage() {
  const { tenantNumber: tenantNumberParam } = Route.useParams();
  const publicNumber = useMemo(() => Number(tenantNumberParam), [tenantNumberParam]);
  const { t } = useI18n();
  const account = usePlatformAccount();

  const getFn = useServerFn(platformGetTenant);
  const updateFn = useServerFn(platformUpdateTenant);
  const featuresFn = useServerFn(platformUpdateTenantFeatures);
  const pmsFn = useServerFn(platformSaveTenantPmsConfig);
  const inboxFn = useServerFn(platformSaveTenantInboxConfig);
  const zepirisFn = useServerFn(platformSaveTenantZepirisConfig);
  const saveLogoFn = useServerFn(platformSaveTenantLogo);
  const membersFn = useServerFn(platformListTenantMembers);
  const addMemberFn = useServerFn(platformAddTenantMember);
  const removeMemberFn = useServerFn(platformRemoveTenantMember);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [displayNumber, setDisplayNumber] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [legalName, setLegalName] = useState("");
  const [taxId, setTaxId] = useState("");
  const [status, setStatus] = useState<PlatformTenantStatus>("active");
  const [panelLogoUrl, setPanelLogoUrl] = useState<string | null>(null);

  const [features, setFeatures] = useState<{ featureKey: string; enabled: boolean }[]>([]);

  const [pmsEnabled, setPmsEnabled] = useState(true);
  const [pmsBaseUrl, setPmsBaseUrl] = useState("");
  const [pmsTokens, setPmsTokens] = useState<Record<string, string>>({});
  const [pmsMasked, setPmsMasked] = useState<Record<string, string>>({});

  const [inboxClientId, setInboxClientId] = useState("");
  const [inboxClientSecret, setInboxClientSecret] = useState("");
  const [inboxBaseUrl, setInboxBaseUrl] = useState("");
  const [inboxHasSecret, setInboxHasSecret] = useState(false);
  const [inboxMaskedClientId, setInboxMaskedClientId] = useState<string | null>(null);
  const [inboxModules, setInboxModules] = useState<InboxModules>({
    portfolio: true,
    units: true,
    stays: true,
    guests: true,
    readers: false,
  });

  const [zepirisOperational, setZepirisOperational] = useState(false);
  const [zepirisGloballyEnabled, setZepirisGloballyEnabled] = useState(false);
  const [zepirisApiKeyConfigured, setZepirisApiKeyConfigured] = useState(false);
  const [zepirisPhotoguardTenantConfigured, setZepirisPhotoguardTenantConfigured] = useState(false);
  const [zepirisTenant, setZepirisTenant] = useState("");
  const [zepirisProvider, setZepirisProvider] = useState("zepiris");
  const [zepirisVersion, setZepirisVersion] = useState("1.0.0");
  const [zepirisFaceDetection, setZepirisFaceDetection] = useState(true);
  const [zepirisBlurCheck, setZepirisBlurCheck] = useState(true);
  const [zepirisSpoofCheck, setZepirisSpoofCheck] = useState(true);
  const [zepirisNsfwCheck, setZepirisNsfwCheck] = useState(false);
  const [zepirisMaxAttempts, setZepirisMaxAttempts] = useState(5);
  const [zepirisTimeoutMs, setZepirisTimeoutMs] = useState(10000);
  const [zepirisUnavailablePolicy, setZepirisUnavailablePolicy] = useState<"BLOCK" | "FALLBACK">("BLOCK");

  const [members, setMembers] = useState<PlatformTenantMember[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<"admin" | "reception">("reception");

  const loginUrl = useMemo(() => {
    if (!slug.trim()) return "";
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return buildTenantLoginUrl(slug, origin);
  }, [slug]);

  useEffect(() => {
    let cancelled = false;

    async function fetchTenant() {
      if (!Number.isInteger(publicNumber) || publicNumber <= 0) {
        throw new Error(t("platform.tenantDetail.loadError"));
      }

      setLoading(true);
      setError(null);
      setInboxClientId("");
      setInboxClientSecret("");
      setInboxBaseUrl("");
      setInboxHasSecret(false);
      setInboxMaskedClientId(null);
      setInboxModules({ ...DEFAULT_INBOX_MODULES });

      const [detail, membersResult] = await Promise.all([
        getFn({ data: { publicNumber } }),
        membersFn({ data: { publicNumber } }),
      ]);

      if (cancelled) return;

      setDisplayNumber(detail.tenant.publicNumber);
      setName(detail.tenant.name);
      setSlug(detail.tenant.slug);
      setLegalName(detail.tenant.legalName ?? "");
      setTaxId(detail.tenant.taxId ?? "");
      setStatus(detail.tenant.status);
      setPanelLogoUrl(detail.tenant.panelLogoUrl ?? null);
      setFeatures(detail.features);
      setPmsEnabled(detail.pms.enabled);
      setPmsBaseUrl(detail.pms.baseUrl);
      setPmsTokens({});
      setPmsMasked(detail.pms.masked);
      setInboxClientId("");
      setInboxClientSecret("");
      setInboxBaseUrl(detail.inbox.baseUrl);
      setInboxHasSecret(detail.inbox.hasClientSecret);
      setInboxMaskedClientId(detail.inbox.maskedClientId);
      setInboxModules(detail.inbox.modules);
      setZepirisOperational(detail.zepiris.operational);
      setZepirisGloballyEnabled(detail.zepiris.globallyEnabled);
      setZepirisApiKeyConfigured(detail.zepiris.apiKeyConfigured);
      setZepirisPhotoguardTenantConfigured(detail.zepiris.photoguardTenantConfigured);
      setZepirisTenant(detail.zepiris.config.zepirisTenant ?? "");
      setZepirisProvider(detail.zepiris.provider);
      setZepirisVersion(detail.zepiris.version);
      setZepirisFaceDetection(detail.zepiris.config.faceDetection);
      setZepirisBlurCheck(detail.zepiris.config.blurCheck);
      setZepirisSpoofCheck(detail.zepiris.config.spoofCheck);
      setZepirisNsfwCheck(detail.zepiris.config.nsfwCheck);
      setZepirisMaxAttempts(detail.zepiris.config.maxAttempts);
      setZepirisTimeoutMs(detail.zepiris.config.timeoutMs);
      setZepirisUnavailablePolicy(detail.zepiris.config.unavailablePolicy);
      setMembers(membersResult.members);
    }

    void fetchTenant()
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t("platform.tenantDetail.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [getFn, membersFn, publicNumber, t]);

  async function load(): Promise<void> {
    if (!Number.isInteger(publicNumber) || publicNumber <= 0) {
      throw new Error(t("platform.tenantDetail.loadError"));
    }

    const [detail, membersResult] = await Promise.all([
      getFn({ data: { publicNumber } }),
      membersFn({ data: { publicNumber } }),
    ]);

    setDisplayNumber(detail.tenant.publicNumber);
    setName(detail.tenant.name);
    setSlug(detail.tenant.slug);
    setLegalName(detail.tenant.legalName ?? "");
    setTaxId(detail.tenant.taxId ?? "");
    setStatus(detail.tenant.status);
    setPanelLogoUrl(detail.tenant.panelLogoUrl ?? null);
    setFeatures(detail.features);
    setPmsEnabled(detail.pms.enabled);
    setPmsBaseUrl(detail.pms.baseUrl);
    setPmsTokens({});
    setPmsMasked(detail.pms.masked);
    setInboxClientId("");
    setInboxClientSecret("");
    setInboxBaseUrl(detail.inbox.baseUrl);
    setInboxHasSecret(detail.inbox.hasClientSecret);
    setInboxMaskedClientId(detail.inbox.maskedClientId);
    setInboxModules(detail.inbox.modules);
    setZepirisOperational(detail.zepiris.operational);
    setZepirisGloballyEnabled(detail.zepiris.globallyEnabled);
    setZepirisApiKeyConfigured(detail.zepiris.apiKeyConfigured);
    setZepirisPhotoguardTenantConfigured(detail.zepiris.photoguardTenantConfigured);
    setZepirisTenant(detail.zepiris.config.zepirisTenant ?? "");
    setZepirisProvider(detail.zepiris.provider);
    setZepirisVersion(detail.zepiris.version);
    setZepirisFaceDetection(detail.zepiris.config.faceDetection);
    setZepirisBlurCheck(detail.zepiris.config.blurCheck);
    setZepirisSpoofCheck(detail.zepiris.config.spoofCheck);
    setZepirisNsfwCheck(detail.zepiris.config.nsfwCheck);
    setZepirisMaxAttempts(detail.zepiris.config.maxAttempts);
    setZepirisTimeoutMs(detail.zepiris.config.timeoutMs);
    setZepirisUnavailablePolicy(detail.zepiris.config.unavailablePolicy);
    setMembers(membersResult.members);
  }

  async function handleSaveLogo() {
    setSaving(true);
    try {
      await saveLogoFn({ data: { publicNumber, panelLogoUrl } });
      toast.success(t("admin.branding.saved"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveGeneral() {
    setSaving(true);
    try {
      await updateFn({
        data: {
          publicNumber,
          name: name.trim(),
          slug: slug.trim(),
          legalName: legalName.trim() || null,
          taxId: taxId.trim() || null,
          status,
        },
      });
      toast.success(t("platform.tenantDetail.saved"));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFeatures() {
    setSaving(true);
    try {
      await featuresFn({ data: { publicNumber, features } });
      toast.success(t("platform.tenantDetail.featuresSaved"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSavePms() {
    setSaving(true);
    try {
      await pmsFn({
        data: {
          publicNumber,
          enabled: pmsEnabled,
          baseUrl: pmsBaseUrl.trim() || undefined,
          tokens: pmsTokens,
          mergeTokens: true,
        },
      });
      toast.success(t("platform.tenantDetail.pmsSaved"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInbox() {
    setSaving(true);
    try {
      await inboxFn({
        data: {
          publicNumber,
          inboxClientId: inboxClientId.trim() || null,
          inboxClientSecret: inboxClientSecret.trim() || undefined,
          clearInboxClientSecret: inboxClientSecret === "__CLEAR__",
          inboxBaseUrl: inboxBaseUrl.trim() || null,
          inboxModules,
        },
      });
      toast.success(t("platform.tenantDetail.inboxSaved"));
      setInboxClientSecret("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveZepiris() {
    setSaving(true);
    try {
      await zepirisFn({
        data: {
          publicNumber,
          faceDetection: zepirisFaceDetection,
          blurCheck: zepirisBlurCheck,
          spoofCheck: zepirisSpoofCheck,
          nsfwCheck: zepirisNsfwCheck,
          zepirisTenant: zepirisTenant.trim() || undefined,
          maxAttempts: zepirisMaxAttempts,
          timeoutMs: zepirisTimeoutMs,
          unavailablePolicy: zepirisUnavailablePolicy,
        },
      });
      toast.success(t("platform.tenantDetail.zepirisSaved"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  const inboxFeatureEnabled = features.some(
    (feature) => feature.featureKey === "portaria_inbox" && feature.enabled,
  );

  const zepirisFeatureEnabled = features.some(
    (feature) => feature.featureKey === "zepiris_photo_validation" && feature.enabled,
  );

  async function handleAddMember() {
    if (!memberEmail.trim()) {
      toast.error(t("platform.tenantDetail.memberEmailRequired"));
      return;
    }
    setSaving(true);
    try {
      await addMemberFn({
        data: { publicNumber, email: memberEmail.trim(), role: memberRole },
      });
      toast.success(t("platform.tenantDetail.memberAdded"));
      setMemberEmail("");
      const result = await membersFn({ data: { publicNumber } });
      setMembers(result.members);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    setSaving(true);
    try {
      await removeMemberFn({ data: { publicNumber, userId } });
      toast.success(t("platform.tenantDetail.memberRemoved"));
      setMembers((current) => current.filter((member) => member.userId !== userId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <PlatformShell account={account}>
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="mr-2 size-5 animate-spin" aria-hidden />
          {t("common.loading")}
        </div>
      </PlatformShell>
    );
  }

  if (error) {
    return (
      <PlatformShell account={account}>
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link to="/platform/tenants">{t("common.back")}</Link>
        </Button>
      </PlatformShell>
    );
  }

  return (
    <PlatformShell
      title={name}
      subtitle={displayNumber != null ? `#${displayNumber} · ${slug}` : slug}
      account={account}
      breadcrumbs={[
        { label: t("platform.dashboard"), to: "/platform/dashboard" },
        { label: t("platform.tenants"), to: "/platform/tenants" },
        { label: name },
      ]}
    >
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">{t("platform.tenantDetail.tabGeneral")}</TabsTrigger>
          <TabsTrigger value="features">{t("platform.tenantDetail.tabFeatures")}</TabsTrigger>
          <TabsTrigger value="pms">{t("platform.tenantDetail.tabPms")}</TabsTrigger>
          <TabsTrigger value="inbox">{t("platform.tenantDetail.tabInbox")}</TabsTrigger>
          <TabsTrigger value="zepiris">{t("platform.tenantDetail.tabZepiris")}</TabsTrigger>
          <TabsTrigger value="members">{t("platform.tenantDetail.tabMembers")}</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <PlatformSection title={t("platform.tenantDetail.generalTitle")}>
            <PlatformCard className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <ReadOnlyField
                  label={t("platform.tenantsPage.companyId")}
                  value={displayNumber != null ? String(displayNumber) : "—"}
                />
                <Field label={t("common.name")} value={name} onChange={setName} />
                <Field label={t("platform.tenantsPage.slug")} value={slug} onChange={setSlug} />
                <ReadOnlyField
                  label={t("platform.tenantDetail.loginUrl")}
                  value={loginUrl || "—"}
                />
                <Field label={t("platform.tenantsPage.legalName")} value={legalName} onChange={setLegalName} />
                <Field label={t("platform.tenantsPage.taxId")} value={taxId} onChange={setTaxId} />
              </div>
              <TenantLogoEditor
                logoUrl={panelLogoUrl}
                tenantName={name}
                onLogoUrlChange={setPanelLogoUrl}
                onSave={handleSaveLogo}
                saving={saving}
              />
              <div className="space-y-2">
                <Label>{t("platform.tenantsPage.status")}</Label>
                <Select value={status} onValueChange={(value) => setStatus(value as PlatformTenantStatus)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("platform.tenantStatus.active")}</SelectItem>
                    <SelectItem value="inactive">{t("platform.tenantStatus.inactive")}</SelectItem>
                    <SelectItem value="suspended">{t("platform.tenantStatus.suspended")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={saving} onClick={() => void handleSaveGeneral()}>
                {saving ? t("common.loading") : t("common.save")}
              </Button>
            </PlatformCard>
          </PlatformSection>
        </TabsContent>

        <TabsContent value="features">
          <PlatformSection title={t("platform.tenantDetail.featuresTitle")} description={t("platform.tenantDetail.featuresHint")}>
            <PlatformCard className="space-y-4">
              {features.map((feature, index) => (
                <div key={feature.featureKey} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">{FEATURE_LABELS[feature.featureKey] ?? feature.featureKey}</p>
                    <p className="text-xs text-muted-foreground">{feature.featureKey}</p>
                  </div>
                  <Switch
                    checked={feature.enabled}
                    onCheckedChange={(checked) => {
                      setFeatures((current) =>
                        current.map((row, rowIndex) =>
                          rowIndex === index ? { ...row, enabled: checked } : row,
                        ),
                      );
                    }}
                  />
                </div>
              ))}
              <Button disabled={saving} onClick={() => void handleSaveFeatures()}>
                {saving ? t("common.loading") : t("common.save")}
              </Button>
            </PlatformCard>
          </PlatformSection>
        </TabsContent>

        <TabsContent value="pms">
          <PlatformSection title={t("platform.tenantDetail.pmsTitle")} description={t("platform.tenantDetail.pmsHint")}>
            <PlatformCard className="space-y-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-medium">{t("platform.tenantDetail.pmsEnabled")}</p>
                  <p className="text-xs text-muted-foreground">{t("platform.tenantDetail.pmsEnabledHint")}</p>
                </div>
                <Switch checked={pmsEnabled} onCheckedChange={setPmsEnabled} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pms-base-url">{t("platform.tenantDetail.pmsBaseUrl")}</Label>
                <Input
                  id="pms-base-url"
                  placeholder="https://backend.techospitality.com"
                  value={pmsBaseUrl}
                  onChange={(event) => setPmsBaseUrl(event.target.value)}
                />
              </div>
              <div className="space-y-4">
                {TOKEN_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`token-${field.key}`}>{field.label}</Label>
                    <Input
                      id={`token-${field.key}`}
                      type="password"
                      autoComplete="off"
                      placeholder={pmsMasked[field.key] || t("platform.tenantDetail.tokenPlaceholder")}
                      value={pmsTokens[field.key] ?? ""}
                      onChange={(event) =>
                        setPmsTokens((current) => ({ ...current, [field.key]: event.target.value }))
                      }
                    />
                  </div>
                ))}
              </div>
              <Button disabled={saving} onClick={() => void handleSavePms()}>
                {saving ? t("common.loading") : t("common.save")}
              </Button>
            </PlatformCard>
          </PlatformSection>
        </TabsContent>

        <TabsContent value="inbox">
          <PlatformSection
            title={t("platform.tenantDetail.inboxTitle")}
            description={t("platform.tenantDetail.inboxHint")}
          >
            {!inboxFeatureEnabled ? (
              <PlatformCard>
                <p className="text-sm text-muted-foreground">{t("platform.tenantDetail.inboxFeatureRequired")}</p>
              </PlatformCard>
            ) : (
              <PlatformCard className="space-y-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="inbox-client-id">{t("admin.inbox.clientId")}</Label>
                    <Input
                      id="inbox-client-id"
                      value={inboxClientId}
                      onChange={(event) => setInboxClientId(event.target.value)}
                      placeholder={inboxMaskedClientId || t("admin.inbox.clientIdConfigured")}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="inbox-client-secret">{t("admin.inbox.clientSecret")}</Label>
                    <Input
                      id="inbox-client-secret"
                      type="password"
                      autoComplete="off"
                      value={inboxClientSecret}
                      onChange={(event) => setInboxClientSecret(event.target.value)}
                      placeholder={inboxHasSecret ? t("admin.inbox.clientSecretKeep") : ""}
                    />
                    {inboxHasSecret ? (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setInboxClientSecret("__CLEAR__")}>
                        {t("admin.inbox.clearSecret")}
                      </Button>
                    ) : null}
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="inbox-base-url">{t("admin.inbox.baseUrl")}</Label>
                    <Input
                      id="inbox-base-url"
                      placeholder="https://inboxseg.com/api/v1/operator"
                      value={inboxBaseUrl}
                      onChange={(event) => setInboxBaseUrl(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-sm font-medium">{t("admin.inbox.modulesTitle")}</p>
                  <p className="text-xs text-muted-foreground">{t("platform.tenantDetail.inboxModulesHint")}</p>
                  {INBOX_MODULE_KEYS.map((key) => (
                    <div key={key} className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium">{t(INBOX_MODULE_LABEL_KEYS[key])}</p>
                        <p className="text-xs text-muted-foreground">{t(`admin.inbox.moduleHint.${key}`)}</p>
                      </div>
                      <Switch
                        checked={Boolean(inboxModules[key])}
                        onCheckedChange={(checked) =>
                          setInboxModules((current) => ({ ...current, [key]: checked }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <Button disabled={saving} onClick={() => void handleSaveInbox()}>
                  {saving ? t("common.loading") : t("common.save")}
                </Button>
              </PlatformCard>
            )}
          </PlatformSection>
        </TabsContent>

        <TabsContent value="zepiris">
          <PlatformSection
            title={t("platform.tenantDetail.zepirisTitle")}
            description={t("platform.tenantDetail.zepirisHint")}
          >
            {!zepirisFeatureEnabled ? (
              <PlatformCard>
                <p className="text-sm text-muted-foreground">{t("platform.tenantDetail.zepirisFeatureRequired")}</p>
              </PlatformCard>
            ) : (
              <PlatformCard className="space-y-6">
                <div className="grid gap-4 sm:grid-cols-2">
                  <ReadOnlyField label={t("platform.tenantDetail.zepirisProvider")} value={zepirisProvider} />
                  <ReadOnlyField label={t("platform.tenantDetail.zepirisVersion")} value={zepirisVersion} />
                  <div className="space-y-1 sm:col-span-2">
                    <p className="text-sm font-medium">{t("platform.tenantDetail.zepirisServiceStatus")}</p>
                    <div className="flex items-center gap-2 text-sm">
                      <span
                        className={
                          zepirisGloballyEnabled && zepirisOperational
                            ? "size-2 rounded-full bg-emerald-500"
                            : "size-2 rounded-full bg-red-500"
                        }
                        aria-hidden
                      />
                      <span>
                        {!zepirisGloballyEnabled
                          ? t("platform.tenantDetail.zepirisGloballyDisabled")
                          : !zepirisApiKeyConfigured
                            ? t("platform.tenantDetail.zepirisApiKeyMissing")
                            : !zepirisPhotoguardTenantConfigured
                              ? t("platform.tenantDetail.zepirisTenantMissing")
                              : zepirisOperational
                                ? t("platform.tenantDetail.zepirisOperational")
                                : t("platform.tenantDetail.zepirisUnavailable")}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label htmlFor="zepiris-tenant">{t("platform.tenantDetail.zepirisPhotoguardTenant")}</Label>
                    <Input
                      id="zepiris-tenant"
                      value={zepirisTenant}
                      onChange={(event) => setZepirisTenant(event.target.value)}
                      placeholder={t("platform.tenantDetail.zepirisPhotoguardTenantPlaceholder")}
                    />
                    <p className="text-xs text-muted-foreground">{t("platform.tenantDetail.zepirisPhotoguardTenantHint")}</p>
                  </div>
                </div>

                <div className="space-y-4 border-t border-border pt-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{t("platform.tenantDetail.zepirisFaceDetection")}</p>
                    <Switch checked={zepirisFaceDetection} onCheckedChange={setZepirisFaceDetection} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{t("platform.tenantDetail.zepirisBlurCheck")}</p>
                    <Switch checked={zepirisBlurCheck} onCheckedChange={setZepirisBlurCheck} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{t("platform.tenantDetail.zepirisSpoofCheck")}</p>
                    <Switch checked={zepirisSpoofCheck} onCheckedChange={setZepirisSpoofCheck} />
                  </div>
                  <div className="flex items-center justify-between gap-4">
                    <p className="font-medium">{t("platform.tenantDetail.zepirisNsfwCheck")}</p>
                    <Switch checked={zepirisNsfwCheck} onCheckedChange={setZepirisNsfwCheck} />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="zepiris-max-attempts">{t("platform.tenantDetail.zepirisMaxAttempts")}</Label>
                      <Input
                        id="zepiris-max-attempts"
                        type="number"
                        min={1}
                        max={20}
                        value={zepirisMaxAttempts}
                        onChange={(event) => setZepirisMaxAttempts(Number(event.target.value) || 5)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="zepiris-timeout">{t("platform.tenantDetail.zepirisTimeout")}</Label>
                      <Input
                        id="zepiris-timeout"
                        type="number"
                        min={1000}
                        max={30000}
                        step={500}
                        value={zepirisTimeoutMs}
                        onChange={(event) => setZepirisTimeoutMs(Number(event.target.value) || 10000)}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("platform.tenantDetail.zepirisUnavailablePolicy")}</Label>
                    <Select
                      value={zepirisUnavailablePolicy}
                      onValueChange={(value) => setZepirisUnavailablePolicy(value as "BLOCK" | "FALLBACK")}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BLOCK">{t("platform.tenantDetail.zepirisPolicyBlock")}</SelectItem>
                        <SelectItem value="FALLBACK">{t("platform.tenantDetail.zepirisPolicyFallback")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <Button disabled={saving} onClick={() => void handleSaveZepiris()}>
                  {saving ? t("common.loading") : t("common.save")}
                </Button>
              </PlatformCard>
            )}
          </PlatformSection>
        </TabsContent>

        <TabsContent value="members">
          <PlatformSection title={t("platform.tenantDetail.membersTitle")}>
            <PlatformCard className="mb-6 space-y-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <div className="space-y-2">
                  <Label htmlFor="member-email">{t("common.email")}</Label>
                  <Input
                    id="member-email"
                    type="email"
                    value={memberEmail}
                    onChange={(event) => setMemberEmail(event.target.value)}
                    placeholder="recepcao@hotel.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("platform.tenantDetail.memberRole")}</Label>
                  <Select value={memberRole} onValueChange={(value) => setMemberRole(value as "admin" | "reception")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t("admin.adminRole")}</SelectItem>
                      <SelectItem value="reception">{t("admin.receptionRole")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button disabled={saving} onClick={() => void handleAddMember()}>
                  <UserPlus className="size-4" aria-hidden />
                  {t("platform.tenantDetail.addMember")}
                </Button>
              </div>
            </PlatformCard>

            {members.length === 0 ? (
              <PlatformCard>
                <p className="text-sm text-muted-foreground">{t("platform.tenantDetail.membersEmpty")}</p>
              </PlatformCard>
            ) : (
              <PlatformTableWrap>
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-4 py-3 font-medium">{t("common.name")}</th>
                      <th className="px-4 py-3 font-medium">{t("common.email")}</th>
                      <th className="px-4 py-3 font-medium">{t("platform.tenantDetail.memberRole")}</th>
                      <th className="px-4 py-3 font-medium">{t("platform.tenantsPage.status")}</th>
                      <th className="px-4 py-3 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((member) => (
                      <tr key={member.userId} className="border-b last:border-0">
                        <td className="px-4 py-3">{member.fullName ?? "—"}</td>
                        <td className="px-4 py-3">{member.email}</td>
                        <td className="px-4 py-3">
                          {member.role === "admin" ? t("admin.adminRole") : t("admin.receptionRole")}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={member.status === "active" ? "default" : "secondary"}>{member.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            disabled={saving}
                            aria-label={t("platform.tenantDetail.removeMember")}
                            onClick={() => void handleRemoveMember(member.userId)}
                          >
                            <Trash2 className="size-4 text-destructive" aria-hidden />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </PlatformTableWrap>
            )}
          </PlatformSection>
        </TabsContent>
      </Tabs>
    </PlatformShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} readOnly className="bg-muted/40 font-mono tabular-nums" />
    </div>
  );
}
