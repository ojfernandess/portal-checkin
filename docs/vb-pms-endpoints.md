# Endpoints PMS VB (Vinibarr)

Base URL padrão: `http://api.vinibarr.com.br/v1`  
(Configurável via `VB_PMS_BASE_URL` ou URL do PMS VB no tenant.)

Autenticação: header `X-Auth-IApi-Token`  
(Token do estabelecimento `vbApiToken`, token do tenant ou `VB_PMS_API_TOKEN`.)

O portal utiliza **4 endpoints** HTTP no VB. A referência Embratur/FNRH é local e não chama a API Vinibarr.

---

## 1. Buscar reserva por localizador

| | |
|---|---|
| **Método** | `GET` |
| **Path** | `/reservations/localizer/{localizer}` |
| **Uso** | Consultar a reserva pelo código localizador |

**Exemplo**

```http
GET /v1/reservations/localizer/ABC123
X-Auth-IApi-Token: {token}
Accept: application/json
```

---

## 2. Lookup do hóspede principal

| | |
|---|---|
| **Método** | `GET` |
| **Path** | `/reservations/hub/main-guest/lookup` |
| **Uso** | Pré-consulta de hóspede por documento e/ou e-mail |

**Query params** (conforme o fluxo):

- `documentNumber` — CPF ou outro documento
- `email` — e-mail do hóspede
- `documentType` — enviado quando o documento é passaporte (`PASSPORT`)

**Exemplo**

```http
GET /v1/reservations/hub/main-guest/lookup?documentNumber=12345678900
X-Auth-IApi-Token: {token}
Accept: application/json
```

---

## 3. Upload de foto (selfie ou documento)

| | |
|---|---|
| **Método** | `POST` |
| **Path** | `/reservations/hub/{localizer}/checkin/media` |
| **Uso** | Enviar selfie (`profile`) ou foto do documento (`document`) |

**Body (JSON)**

```json
{
  "data": "{base64 sem prefixo data:}",
  "type": "profile"
}
```

`type`: `profile` | `document`

**Exemplo**

```http
POST /v1/reservations/hub/ABC123/checkin/media
X-Auth-IApi-Token: {token}
Content-Type: application/json
Accept: application/json
```

Após o upload no VB, o portal espelha a foto no MinIO (armazenamento interno; não é endpoint VB).

---

## 4. Realizar check-in

| | |
|---|---|
| **Método** | `POST` |
| **Path** | `/reservations/hub/{localizer}/checkin` |
| **Uso** | Enviar check-in digital (hóspede principal, acompanhantes, Embratur, etc.) |

**Exemplo**

```http
POST /v1/reservations/hub/ABC123/checkin
X-Auth-IApi-Token: {token}
Content-Type: application/json
Accept: application/json
```

O body segue o payload de check-in digital do portal (`mode`, `mainGuest`, `dependents`, `embratur`, flags de validação, etc.).

---

## Resumo

| # | Método | Endpoint |
|---|--------|----------|
| 1 | `GET` | `/reservations/localizer/{localizer}` |
| 2 | `GET` | `/reservations/hub/main-guest/lookup` |
| 3 | `POST` | `/reservations/hub/{localizer}/checkin/media` |
| 4 | `POST` | `/reservations/hub/{localizer}/checkin` |

## Fora da API VB

| Recurso | Comportamento no portal |
|---------|-------------------------|
| Embratur / FNRH | Catálogo nativo (`getNativeEmbraturReference`), sem chamada HTTP ao Vinibarr |
