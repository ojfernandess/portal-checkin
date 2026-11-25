# Setup — Welcome Inn (Web Check-in)

Portal de check-in hoteleiro com painel administrativo, construído com **TanStack Start**, **React 19**, **Postgres** (auth JWT própria) e integração **TecHospitality**.

## Pré-requisitos

- Node.js 20+ (ou 22+)
- npm (ou Bun)
- Postgres 16+ (local via Docker Compose ou VPS)
- Token da API TecHospitality

## Instalação

```bash
git clone <url-do-repositorio>
cd welcome-on-tap-main
npm install
```

## Variáveis de ambiente

Copie `.env` e preencha:

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | Connection string Postgres |
| `AUTH_JWT_SECRET` | Sim | Segredo JWT (≥ 16 caracteres) |
| `AUTH_JWT_TTL` | Não | Validade do token (padrão `7d`) |
| `TECHOSPITALITY_RESERVATIONS_TOKEN` | Sim* | Token para `/api/reservations/*` e busca por localizador |
| `TECHOSPITALITY_HUB_TOKEN` | Sim* | Token para `/api/reservations/hub/*` |
| `TECHOSPITALITY_ADMIN_TOKEN` | Não | Opcional; listagem de reservas no painel |
| `TECHOSPITALITY_API_TOKEN` | Não | Fallback global se os tokens acima estiverem vazios |

**Importante:** em `npm run dev`, copie também `DATABASE_URL`, `AUTH_JWT_SECRET` e os tokens TecHospitality para **`.dev.vars`**.

```bash
cp .dev.vars.example .dev.vars
# Edite .dev.vars com DATABASE_URL, AUTH_JWT_SECRET e tokens vkr_loc_ / vkr_chk_
```

\* Pelo menos um token de grupo **ou** o fallback global deve estar preenchido.

### Tokens TecHospitality por grupo

A API usa Bearer tokens distintos por grupo de endpoints. O proxy em `techospitality.server.ts` seleciona automaticamente:

| Variável | Scope | Endpoints |
|----------|-------|-----------|
| `TECHOSPITALITY_RESERVATIONS_TOKEN` | `reservations` | `GET /api/reservations`, `GET /api/reservations/localizer/{id}` |
| `TECHOSPITALITY_HUB_TOKEN` | `hub` | `GET .../main-guest/lookup`, `GET .../embratur-reference`, `POST .../checkin/media`, `POST .../checkin` |
| `TECHOSPITALITY_ADMIN_TOKEN` | `admin` | Opcional — reservas no painel admin |
| `TECHOSPITALITY_API_TOKEN` | fallback | Usado quando o token do grupo não está definido |

Exemplo `.env`:

```env
TECHOSPITALITY_RESERVATIONS_TOKEN=token_reservas_aqui
TECHOSPITALITY_HUB_TOKEN=token_hub_checkin_aqui
TECHOSPITALITY_ADMIN_TOKEN=token_admin_aqui
# Opcional — atalho se todos os grupos usarem o mesmo token:
# TECHOSPITALITY_API_TOKEN=token_unico_aqui
```

Ordem de resolução: **token do grupo → fallback global**. Erros 401/403 registram qual scope falhou (sem expor o token).

## Banco de dados (Postgres)

```bash
# Sobe o Postgres local
docker compose up -d postgres

# Aplica o schema limpo (db/migrations)
npm run db:migrate
```

O schema consolidado está em `db/migrations/001_init.sql` (sem dependência do Supabase Auth).
As migrations históricas em `supabase/migrations/` ficam só como referência.

Tabelas principais:

- `auth_users`, `profiles`, `user_roles` — identidade e equipe
- `tenants`, `tenant_memberships`, `platform_admins` — multi-tenant
- `establishments`, termos, contatos, settings, extra fields
- `checkin_records`, `checkin_sessions`, `guest_portal_photos`
- `audit_logs`, `rate_limit_buckets`

Primeiro acesso: abra `/auth` e use o fluxo de bootstrap (primeiro admin da plataforma).

## Desenvolvimento

```bash
npm run dev
```

Acesse:

- Portal do hóspede: http://localhost:8080/
- Login admin: http://localhost:8080/auth
- Dashboard: http://localhost:8080/admin/dashboard

### Primeiro acesso admin

Se não existir nenhum usuário, a tela de login oferece **Criar conta de administrador**. O primeiro usuário recebe role `admin` automaticamente.

## Build de produção

```bash
npm run build
npm start
```

O build usa **Nitro** com preset **`node-server`** (Node.js). Saída em `.output/server/index.mjs`.

Para manter deploy na **Cloudflare Workers** (Lovable), use:

```bash
NITRO_PRESET=cloudflare-module npm run build
```

## Deploy — Docker / EasyPanel

### Arquivos

| Arquivo | Uso |
|---------|-----|
| `Dockerfile` | Imagem multi-stage (build + runtime Node 22) |
| `docker-compose.yml` | Referência local e EasyPanel |
| `.dockerignore` | Exclui `.env`, `node_modules`, etc. |

### Build local

```bash
docker compose build
docker compose up -d
```

App em `http://localhost:3000`.

### EasyPanel (recomendado)

1. **Novo app** → tipo **Docker Compose** ou **Dockerfile** (repositório Git).
2. **Repositório:** `https://github.com/ojfernandess/portal-checkin.git`, branch **`main-backend`** (ou a branch de deploy).
3. **Porta interna do serviço `welcome-inn`:** `3000` (o Compose **não** publica `0.0.0.0:3000` no host — o EasyPanel faz proxy pelo domínio). Se aparecer `Bind for 0.0.0.0:3000 failed: port is already allocated`, outro app já usa a 3000; com este Compose isso deixa de ser necessário.
4. **Build args:**
   - `GIT_COMMIT` — use o SHA do commit (ex.: `$GIT_SHA` do webhook) para forçar rebuild sem cache Docker
   - `BUILD_DATE` — opcional, timestamp ISO do deploy
5. **Environment** (runtime — servidor):
   - Postgres / auth: `DATABASE_URL`, `AUTH_JWT_SECRET` (e opcionalmente `AUTH_JWT_TTL`)
   - TecHospitality: `TECHOSPITALITY_BASE_URL`, tokens (`RESERVATIONS`, `HUB`, `CHECKOUTS`, `CREATED`, …)
   - MinIO / AWS S3: `AWS_*` ou `MINIO_*`
6. **Schema + dados:** `npm run db:migrate` e, se for trazer o Supabase, `npm run db:migrate-from-supabase` (ver [docs/migrate-supabase-to-postgres.md](docs/migrate-supabase-to-postgres.md)).

#### O deploy já instala o Postgres?

| Tipo no EasyPanel | Postgres automático? |
|-------------------|----------------------|
| **Docker Compose** (`docker-compose.yml`) | **Sim** — sobe o serviço `postgres` + volume persistente |
| **Dockerfile** apenas | **Não** — só o app Node; crie um Postgres no EasyPanel e configure `DATABASE_URL` |

O container Postgres **não** aplica o schema sozinho. Sempre rode `db:migrate` no destino. Em produção defina `POSTGRES_PASSWORD` e `AUTH_JWT_SECRET` fortes.

Não commite `.env` — configure tudo no painel do EasyPanel.

### Domínios (check-in vs admin)

Dois domínios apontam para o **mesmo** app Docker (porta 3000):

| Domínio | Uso |
|---------|-----|
| `checkin.audaar.com.br` | Portal do hóspede (`/`, `/LOCALIZADOR`) |
| `checkin.techospitality.com` | Login e painel (`/auth`, `/admin/*`) |

Variáveis de runtime (opcional — há defaults):

```env
PUBLIC_CHECKIN_ORIGIN=https://checkin.audaar.com.br
ADMIN_PANEL_ORIGIN=https://checkin.techospitality.com
```

**No EasyPanel:** cadastre os dois domínios no mesmo serviço. **Remova** redirecionamentos globais no proxy (ex.: techospitality → audaar para todas as rotas). O app faz o redirect por path:

- `checkin.techospitality.com/` → `checkin.audaar.com.br/`
- `checkin.audaar.com.br/auth` ou `/admin` → `checkin.techospitality.com` (mesmo path)

Se o proxy redirecionar antes do Node, `/auth` no domínio audaar nunca chega à aplicação e o painel não abre no domínio correto.

### Variáveis de runtime

Auth e banco são só no servidor (`DATABASE_URL`, `AUTH_JWT_SECRET`). Tokens TecHospitality e MinIO/S3 também. Rebuild da imagem só é necessário quando o código muda (use `GIT_COMMIT` para invalidar cache).

### Smoke checklist (pós-migrate)

1. Login / bootstrap em `/auth`
2. Super Admin: criar tenant e membership
3. Busca por localizador no portal
4. Submit de check-in
5. Upload de foto (MinIO)
6. Inbox / VB configs por estabelecimento (se aplicável)

### Verificar se o deploy pegou o código novo

Após cada deploy, confira:

```bash
curl https://checkin.techospitality.com/api/build-info
```

Resposta esperada (commit recente de `main`):

```json
{
  "commit": "f7c091f",
  "builtAt": "2026-08-25T...",
  "features": { "inboxModule": true }
}
```

| Teste | Deploy antigo | Deploy novo |
|-------|---------------|-------------|
| `GET /api/build-info` | 404 ou `commit: unknown` | JSON com commit recente |
| `GET /admin/inbox` | **404** | 200 (redireciona para login se não autenticado) |
| JS `tenant-branding-cache-*.js` | `tenantAccount.` (v1) | `tenantAccount.v2.` |

Se `/admin/inbox` retorna **404**, o Easypanel ainda está servindo imagem antiga:

1. Confirme branch **`main`** e último commit no log de build do Easypanel.
2. **Redeploy** com **Clear build cache** / **Rebuild without cache**.
3. Passe `GIT_COMMIT` diferente a cada deploy (build arg).
4. Confirme que o serviço reiniciou (container novo, não só restart).

Depois do deploy correto, habilite **Portaria Inbox** no Super Admin (`/platform/tenants`). O schema multi-tenant já está em `db/migrations/001_init.sql`.

## Rotas principais

| Rota | Descrição |
|------|-----------|
| `/` | Wizard de check-in do hóspede |
| `/auth` | Login da equipe |
| `/admin/dashboard` | KPIs e check-ins recentes |
| `/admin/checkins` | Gestão de check-ins com filtros |
| `/admin/establishments` | Configuração por estabelecimento |
| `/admin/establishments/:id` | Termos, contato e campos extras |
| `/admin/audit` | Log de auditoria |
| `/admin/users` | Gestão de equipe (admin only) |

## Arquitetura

```
Hóspede (/)  →  checkin.functions.ts  →  TecHospitality / VB (proxy server-side)
Admin        →  admin.functions.ts    →  Postgres + TecHospitality
Termos       →  establishment_terms   →  Postgres (por establishmentId)
Fotos        →  s3.server.ts          →  MinIO / S3
```

## Segurança

- Tokens TecHospitality nunca expostos ao browser (proxy server-side por grupo)
- Rate limit: 10 buscas de localizador por IP/hora
- Senhas de staff: mínimo 12 caracteres
- Auditoria de alterações administrativas

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (Node / Docker) |
| `npm start` | Sobe o servidor `.output` (após build) |
| `npm run preview` | Preview Vite (dev) |
| `npm run db:migrate` | Aplica `db/migrations/*.sql` no Postgres (`DATABASE_URL`) |
| `npm run db:migrate-from-supabase` | Copia dados do Supabase Postgres → destino (`SUPABASE_DATABASE_URL` + `DATABASE_URL`) |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
