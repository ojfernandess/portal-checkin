# Endpoints PMS VB (Vinibarr)

Base URL padrão: `http://api.vinibarr.com.br/v1`  
(Configurável via `VB_PMS_BASE_URL` ou URL do PMS VB no tenant.)

Autenticação: header `X-Auth-IApi-Token`  
(Token do estabelecimento `vbApiToken`, token do tenant ou `VB_PMS_API_TOKEN`.)

**ID VB ≠ ID do portal:** o `data.establishment.establishmentId` do Vinibarr é o ID interno do VB (ex.: `1` = Vivapp Rock Blue Ocean). No portal, o mesmo hotel pode ter outro ID (ex.: `33`). Em Admin → Estabelecimento, cadastre o campo **ID do estabelecimento no VB** (`vbEstablishmentId`) para o portal vincular a reserva ao hotel e ao token corretos.

O portal utiliza **4 endpoints** HTTP no VB. A referência Embratur/FNRH é local e não chama a API Vinibarr.

---

## 1. Buscar reserva por localizador

| | |
|---|---|
| **Método** | `GET` |
| **Path** | `/reservations/localizer/{localizer}` |
| **Uso** | Consultar a reserva pelo código localizador |

No bloco `checkin`, o VB pode retornar `preCheckin` (boolean). Quando `true`, o hóspede concluiu o **pré check-in** digital (status ainda “Reserva Confirmada”); no dia/hora de entrada o VB promove para “Hospedada” com `validatedCheckin: true`. O portal mostra textos de pré check-in e sincroniza a Inbox também nesse caso. Com `preCheckin: false` (ex.: já “Hospedada”), o fluxo permanece o de check-in completo.

**Opção Super Admin (empresa):** em Integração PMS → PMS VB, “Dados completos do hóspede indicam check-in já realizado”. Quando ativa, se no `guest` estiverem **todos** preenchidos — `name`, `email`, `phone`, `documentNumber`, `documentType` (≠ `0`), `profilePhotoUrl` e `documentPhotoUrl` (URL, caminho `uploads/...` **ou** rótulo `JPEG`/`WEBP`) — o portal trata como check-in concluído. Se **qualquer** campo estiver vazio ou `documentType` for `0`, segue o fluxo normal. Desligada (padrão), o comportamento atual não muda.

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

- `documentNumber` — CPF (somente dígitos) ou outro documento
- `email` — e-mail do hóspede
- `documentType` — código numérico VB (`2` CPF, `5` RG, `7` PASSPORT)

Quando o hóspede **não** existe, o VB responde **HTTP 404** com `{ "found": false, "mainGuest": { …vazio } }`. O portal trata isso como “não encontrado”, não como erro.

**Exemplo**

```http
GET /v1/reservations/hub/main-guest/lookup?documentNumber=12345678900&documentType=2
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

**Importante — token do hotel dono:** o `GET /localizer` e o `POST /checkin/media` podem responder OK com o token de **outro** hotel do mesmo ecossistema VB. O `POST /checkin` exige o `X-Auth-IApi-Token` do estabelecimento dono (`data.establishment.establishmentId`). Se o token for de outro hotel, o VB responde **404** `{ sucesso: false, mensagem: "Reserva não encontrada." }`.

O portal só vincula a reserva a um estabelecimento quando o `establishmentId` do PMS coincide com o **ID VB cadastrado** (`vbEstablishmentId`) de um hotel **com PMS VB ativo e token**. Caso contrário, a busca falha com mensagem de configuração (ID VB não mapeado, VB inativo, etc.), em vez de seguir até o check-in com token errado.

Se o VB responder **500 Slim Application Error** com `$cnpj ... null given` em `checkinReserva`, o token/hotel estão corretos no portal, mas o **cadastro do estabelecimento no Vinibarr está sem CNPJ**. Isso precisa ser corrigido no VB (não no payload do portal).

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
