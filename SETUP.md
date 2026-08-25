# Setup — Welcome Inn (Web Check-in)

Portal de check-in hoteleiro com painel administrativo, construído com **TanStack Start**, **React 19**, **Supabase** e integração **TecHospitality**.

## Pré-requisitos

- Node.js 20+ (ou 22+)
- npm (ou Bun)
- Conta Supabase com projeto configurado
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
| `SUPABASE_URL` | Sim | URL do projeto Supabase |
| `SUPABASE_PUBLISHABLE_KEY` | Sim | Chave publishable (anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sim | Service role (operações admin no servidor) |
| `VITE_SUPABASE_URL` | Sim | Mesma URL (client-side) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim | Mesma publishable key |
| `TECHOSPITALITY_RESERVATIONS_TOKEN` | Sim* | Token para `/api/reservations/*` e busca por localizador |
| `TECHOSPITALITY_HUB_TOKEN` | Sim* | Token para `/api/reservations/hub/*` |
| `TECHOSPITALITY_ADMIN_TOKEN` | Não | Opcional; listagem de reservas no painel (não usado para estabelecimentos) |
| `TECHOSPITALITY_API_TOKEN` | Não | Fallback global se os tokens acima estiverem vazios |

**Importante (Cloudflare Workers):** em `npm run dev`, o servidor roda no runtime Wrangler. Copie os tokens TecHospitality também para **`.dev.vars`** (mesmos valores do `.env`). Sem isso, a busca por localizador retorna *Invalid token*.

```bash
cp .dev.vars.example .dev.vars
# Edite .dev.vars com os tokens reais vkr_loc_ e vkr_chk_
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

## Banco de dados (Supabase)

Aplique as migrations em ordem:

```bash
# Com Supabase CLI
supabase db push

# Ou execute manualmente no SQL Editor:
# supabase/migrations/*.sql
```

Tabelas criadas:

- `profiles`, `user_roles` — equipe do painel
- `establishments` — cadastro local de hotéis (establishmentId da API TecHospitality)
- `establishment_terms`, `establishment_terms_history` — termos por hotel
- `establishment_contacts` — telefone/WhatsApp de suporte
- `establishment_extra_fields` — campos personalizados
- `audit_logs` — log de auditoria administrativa
- `rate_limit_buckets` — rate limiting da busca por localizador

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
2. **Repositório:** `https://github.com/ojfernandess/portal-checkin.git`, branch **`main`**.
3. **Porta interna:** `3000` (variáveis `PORT`, `HOST=0.0.0.0`, `NITRO_HOST=0.0.0.0`).
4. **Build args** (obrigatórios para o bundle do cliente):
   - `VITE_SUPABASE_PROJECT_ID`
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`
   - `GIT_COMMIT` — use o SHA do commit (ex.: `$GIT_SHA` do webhook) para forçar rebuild sem cache Docker
   - `BUILD_DATE` — opcional, timestamp ISO do deploy
5. **Environment** (runtime — servidor):
   - Supabase: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - TecHospitality: `TECHOSPITALITY_BASE_URL`, tokens (`RESERVATIONS`, `HUB`, `CHECKOUTS`, `CREATED`, …)
   - AWS S3: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_S3_BUCKET`, …

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

### Variáveis VITE vs runtime

| Momento | Variáveis |
|---------|-----------|
| **Build** (ARG) | `VITE_SUPABASE_*` — embutidas no JS do browser |
| **Runtime** (ENV) | Supabase service role, TecHospitality, AWS — só no servidor |

Se alterar `VITE_*`, faça **rebuild** da imagem.

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

Depois do deploy correto, habilite **Portaria Inbox** no Super Admin (`/platform/tenants`) e aplique as migrations multi-tenant no Supabase de produção.

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
Hóspede (/)  →  checkin.functions.ts  →  TecHospitality API (proxy server-side)
Admin        →  admin.functions.ts    →  Supabase + TecHospitality
Termos       →  establishment_terms   →  Supabase (por establishmentId)
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
| `npm run lint` | ESLint |
| `npm run format` | Prettier |
