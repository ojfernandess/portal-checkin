import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AdminShell, useAdminAccount } from "@/components/admin/AdminShell";
import { TurnstileWidget, type TurnstileWidgetRef } from "@/components/TurnstileWidget";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";
import {
  adminCreateStaff,
  adminDeleteStaff,
  adminListStaff,
  type StaffMember,
} from "@/lib/api/admin.functions";
import { getTurnstileConfig } from "@/lib/api/turnstile.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/context";

export const Route = createFileRoute("/_authenticated/admin/users")({
  head: () => ({
    meta: [
      { title: "Equipe do painel | Check-in Hoteleiro" },
      {
        name: "description",
        content: "Crie e gerencie as contas de administradores e recepcionistas do hotel.",
      },
      { property: "og:title", content: "Equipe do painel | Check-in Hoteleiro" },
      {
        property: "og:description",
        content: "Crie e gerencie as contas de administradores e recepcionistas do hotel.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AdminUsersPage,
});

function AdminUsersPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const account = useAdminAccount();
  const listStaff = useServerFn(adminListStaff);
  const createStaff = useServerFn(adminCreateStaff);
  const deleteStaff = useServerFn(adminDeleteStaff);
  const fetchTurnstileConfig = useServerFn(getTurnstileConfig);
  const turnstileRef = useRef<TurnstileWidgetRef>(null);

  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [turnstileEnabled, setTurnstileEnabled] = useState(false);
  const [turnstileSiteKey, setTurnstileSiteKey] = useState<string | null>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"admin" | "reception">("reception");

  const handleTurnstileToken = useCallback((token: string | null) => {
    setTurnstileToken(token);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listStaff();
      setStaff(result.staff);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.usersPage.loadError"));
    } finally {
      setLoading(false);
    }
  }, [listStaff, t]);

  useEffect(() => {
    if (account && account.role !== "admin") navigate({ to: "/admin/dashboard", replace: true });
    else if (account) {
      void load();
      void fetchTurnstileConfig().then((config) => {
        setTurnstileEnabled(config.enabled);
        setTurnstileSiteKey(config.siteKey ?? null);
      });
    }
  }, [account, fetchTurnstileConfig, load, navigate]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (turnstileEnabled && !turnstileToken) {
        throw new Error(t("auth.turnstileRequired"));
      }
      await createStaff({
        data: {
          fullName,
          email,
          password,
          role,
          turnstileToken: turnstileToken ?? undefined,
        },
      });
      setFullName("");
      setEmail("");
      setPassword("");
      setRole("reception");
      turnstileRef.current?.reset();
      await load();
    } catch (err) {
      turnstileRef.current?.reset();
      setError(err instanceof Error ? err.message : t("admin.usersPage.createError"));
      setLoading(false);
    }
  }

  async function handleDelete(userId: string) {
    setError(null);
    try {
      await deleteStaff({ data: { userId } });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("admin.usersPage.deleteError"));
    }
  }

  return (
    <AdminShell
      title={t("admin.usersPage.title")}
      subtitle={t("admin.usersPage.subtitle")}
      account={account}
    >
      <form
        onSubmit={handleCreate}
        className="rounded-xl border border-border bg-card p-5 shadow-sm"
      >
        <h2 className="font-display text-lg text-foreground">{t("admin.usersPage.newUser")}</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">{t("auth.fullName")}</Label>
            <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t("auth.email")}</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">{t("admin.usersPage.tempPassword")}</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("admin.usersPage.minPassword")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">{t("admin.usersPage.role")}</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as "admin" | "reception")}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-foreground"
            >
              <option value="reception">{t("admin.usersPage.reception")}</option>
              <option value="admin">{t("admin.usersPage.administrator")}</option>
            </select>
          </div>
        </div>

        {turnstileEnabled && turnstileSiteKey ? (
          <div className="mt-4 flex justify-start">
            <TurnstileWidget
              ref={turnstileRef}
              siteKey={turnstileSiteKey}
              onToken={handleTurnstileToken}
            />
          </div>
        ) : null}

        <Button
          type="submit"
          className="mt-5"
          disabled={
            loading ||
            !fullName ||
            !email ||
            password.length < 12 ||
            (turnstileEnabled && !turnstileToken)
          }
        >
          <UserPlus className="size-4" /> {t("admin.usersPage.createUser")}
        </Button>
      </form>

      {error ? (
        <div className="mt-6 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-6 space-y-3">
        {staff.map((member) => (
          <article
            key={member.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <div>
              <p className="text-foreground">{member.fullName ?? member.email}</p>
              <p className="text-xs text-muted-foreground">{member.email}</p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                {member.role === "admin"
                  ? t("admin.usersPage.administrator")
                  : t("admin.usersPage.reception")}
              </Badge>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void handleDelete(member.id)}
                aria-label={t("admin.usersPage.removeAria", { email: member.email })}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          </article>
        ))}
      </div>
    </AdminShell>
  );
}
