# API FNRH (portal → outro sistema)

Endpoint HTTP do portal para montar o JSON FNRH a partir do check-in salvo (`checkin_records`), buscando pelo **localizador**.

Não envia dados para API externa — só retorna o payload.

---

## Endpoint

| | |
|---|---|
| **Método** | `POST` |
| **Path** | `/api/fnrh/payload` |
| **Content-Type** | `application/json` |

## Autenticação

Token **por empresa**, gerado em Super Admin → Empresa → aba **FNRH**.

Envie em um dos headers:

```http
Authorization: Bearer {fnrhApiToken}
```

ou

```http
X-Api-Key: {fnrhApiToken}
```

Sem token válido → `401`. Token de outra empresa / empresa inativa → `401`.

O tenant é resolvido pelo token. Opcionalmente o body pode incluir `publicNumber` para validação cruzada (`403` se não bater).

## Request

```json
{
  "localizer": "ABC123456"
}
```

Opcional:

```json
{
  "localizer": "ABC123456",
  "publicNumber": 1
}
```

## Response (200)

```json
{
  "publicNumber": 1,
  "localizer": "ABC123456",
  "checkedInAt": "2026-11-03T18:00:00.000Z",
  "establishmentName": "Hotel Exemplo",
  "payload": { "reserva": {}, "dados_hospede": [] }
}
```

Erros comuns: `400` validação, `401` auth, `403` publicNumber, `404` check-in não encontrado.

## curl

```bash
curl -X POST 'https://{host}/api/fnrh/payload' \
  -H 'Authorization: Bearer {fnrhApiToken}' \
  -H 'Content-Type: application/json' \
  -d '{"localizer":"ABC123456"}'
```
