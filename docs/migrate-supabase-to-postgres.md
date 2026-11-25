# Migrar dados: Supabase → Postgres próprio

Passo a passo para copiar o banco do projeto Supabase para o Postgres do EasyPanel (ou local), compatível com o schema em `db/migrations/001_init.sql`.

## 1) EasyPanel já instala o Postgres?

| Tipo de app no EasyPanel | Postgres sobe automaticamente? |
|--------------------------|--------------------------------|
| **Docker Compose** (`docker-compose.yml`) | **Sim** — serviço `postgres` + volume `welcome_inn_pg` |
| **Dockerfile** só | **Não** — só sobe o app Node; crie um Postgres separado e aponte `DATABASE_URL` |

Observações importantes:

- Subir o container **não** aplica o schema. Rode `npm run db:migrate` (ou o script abaixo) no banco alvo.
- Defina `POSTGRES_PASSWORD` / `AUTH_JWT_SECRET` no EasyPanel (não use defaults em produção).
- Com Compose, `DATABASE_URL` interno típico (hostname = nome do serviço):  
  `postgresql://welcome:SENHA@postgres:5432/welcome_inn`  
  Também funciona `@db:5432` (alias). **Não** use host de fora do Compose se o app roda no mesmo stack.

## 2) Pré-requisitos

1. App já deployado (ou Postgres local) com `DATABASE_URL` apontando para o Postgres **alvo**.
2. Schema aplicado no alvo:

```bash
DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB npm run db:migrate
```

3. Connection string **direta** do Supabase (não a URL da API REST):
   - Supabase Dashboard → **Project Settings** → **Database**
   - **Connection string** → URI
   - Prefira conexão **direct** / porta **5432** (Session mode). Pooler 6543 também costuma funcionar para leitura.

Exemplo:

```text
postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-....pooler.supabase.com:5432/postgres
```

4. Node 20+ e dependências do repo (`npm install`).

## 3) Variáveis

```bash
# Origem (Supabase Postgres)
SUPABASE_DATABASE_URL="postgresql://postgres....@...:5432/postgres"

# Destino (EasyPanel / Docker / local)
DATABASE_URL="postgresql://welcome:SENHA@HOST:5432/welcome_inn"
```

### Importante: só colocar na env **não** importa

`SUPABASE_DATABASE_URL` sozinha não faz nada no deploy. É preciso **uma** destas opções:

**A) EasyPanel / Docker (recomendado uma vez)** — no Environment do serviço `welcome-inn`:

```env
DATABASE_URL=postgresql://welcome:SENHA@postgres:5432/welcome_inn
SUPABASE_DATABASE_URL=postgresql://postgres....@...:5432/postgres
MIGRATE_FROM_SUPABASE_ON_BOOT=1
```

1. Redeploy e abra os **logs** do container `welcome-inn`.
2. Procure: `Importing data from Supabase…`, contagens por tabela, e `Done.`
3. Depois do sucesso, mude para `MIGRATE_FROM_SUPABASE_ON_BOOT=0` (evita reimport em todo restart).

O entrypoint sempre roda `db:migrate` (schema). O dump de dados só roda com a flag `=1`.

**B) Manual** (máquina com acesso aos dois bancos):

```bash
npm run db:migrate-from-supabase
```

Opcionais:

| Variável | Efeito |
|----------|--------|
| `MIGRATE_FROM_SUPABASE_ON_BOOT=1` | Roda o import ao subir o container |
| `MIGRATE_DRY_RUN=1` | Só lê/conta; não grava no destino |
| `MIGRATE_TRUNCATE=1` | Apaga tabelas do destino antes de importar (**destrutivo**) |
| `MIGRATE_SKIP_RATE_LIMIT=1` | Não copia `rate_limit_buckets` |

## 4) Dry-run (recomendado)

```bash
SUPABASE_DATABASE_URL="..." DATABASE_URL="..." MIGRATE_DRY_RUN=1 npm run db:migrate-from-supabase
```

Confira se as tabelas e contagens aparecem. Usuários **sem** `encrypted_password` no Supabase Auth serão listados como skip (não dão para logar com senha no app novo).

## 5) Import real

Banco destino **vazio** (só schema) — caso típico pós-`db:migrate`:

```bash
SUPABASE_DATABASE_URL="..." DATABASE_URL="..." npm run db:migrate-from-supabase
```

Se o destino já tiver dados de teste e você quiser **substituir**:

```bash
SUPABASE_DATABASE_URL="..." DATABASE_URL="..." MIGRATE_TRUNCATE=1 npm run db:migrate-from-supabase
```

O script faz:

1. `auth.users` → `auth_users` (reutiliza `encrypted_password` bcrypt do Supabase)
2. Copia tabelas de negócio em ordem de FK (`tenants`, `profiles`, establishments, check-ins, etc.)
3. Ajusta a sequence `tenants_public_number_seq`

## 6) O que **não** migra

- Storage do Supabase (arquivos). Fotos do portal já usam **MinIO/S3** — sem mudança.
- Edge Functions / secrets do dashboard Supabase.
- Usuários só com magic link / sem senha: a conta é importada, mas a senha precisa ser redefinida (hash placeholder).
- Políticas RLS / roles do Supabase Auth (o app novo autentica com JWT próprio).

## 7) Validação pós-migrate

1. Login em `/auth` com um e-mail/senha de staff que existia no Supabase.
2. Super Admin: tenants e memberships.
3. Lista de establishments e check-ins recentes.
4. Busca por localizador + submit de check-in.
5. Upload de foto (MinIO).

```bash
# contagens rápidas no destino
psql "$DATABASE_URL" -c "SELECT count(*) FROM auth_users;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM tenants;"
psql "$DATABASE_URL" -c "SELECT count(*) FROM checkin_records;"
```

## 8) Fluxo EasyPanel completo (resumo)

1. Deploy com **Docker Compose** (Postgres + app) **ou** Dockerfile + Postgres separado.
2. Env: `DATABASE_URL`, `AUTH_JWT_SECRET`, tokens TecHospitality, MinIO/S3. **Remova** `SUPABASE_*`.
3. Aplique schema: `npm run db:migrate` (máquina local/CI apontando para o host do EasyPanel, ou shell do container se disponível).
4. Rode `npm run db:migrate-from-supabase` com `SUPABASE_DATABASE_URL` + `DATABASE_URL`.
5. Redeploy do app se necessário e teste login.

## 9) Alternativa com `pg_dump` (avançado)

Se preferir dump SQL bruto (ainda precisa transformar `auth.users`):

```bash
# Só dados do schema public (não inclui auth.users)
pg_dump "$SUPABASE_DATABASE_URL" --data-only --schema=public \
  --exclude-table-data='schema_migrations' \
  -f supabase-public-data.sql

psql "$DATABASE_URL" -f supabase-public-data.sql
```

Depois rode o script só para auth, ou use o fluxo Node completo (recomendado), que já trata `auth.users` → `auth_users`.

## Troubleshooting

| Sintoma | Causa provável |
|---------|----------------|
| `password authentication failed` na origem | Senha do DB Supabase errada; use a do Database settings, não a anon key |
| `Tenant or user not found` / SSL | URI com SSL; o script já usa `rejectUnauthorized: false` na origem |
| `duplicate key` | Destino não estava vazio; use `MIGRATE_TRUNCATE=1` ou banco limpo |
| Login falha após migrate | Usuário sem `encrypted_password`; recrie a senha via bootstrap/admin ou crie usuário novo |
| App sobe mas tabelas vazias | Esqueceu `db:migrate` e/ou `db:migrate-from-supabase` |
| `password authentication failed for user "welcome"` (destino) | Senha em `DATABASE_URL` ≠ senha gravada no volume. Postgres só aplica `POSTGRES_PASSWORD` na **1ª** criação. Alinhe as duas senhas **ou** apague o volume `welcome_inn_pg` e suba de novo. |
