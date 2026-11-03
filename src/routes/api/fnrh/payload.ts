import { createFileRoute } from "@tanstack/react-router";
import { ZodError } from "zod";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Api-Key",
  "Access-Control-Max-Age": "86400",
};

function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: CORS_HEADERS,
  });
}

export const Route = createFileRoute("/api/fnrh/payload")({
  server: {
    handlers: {
      OPTIONS: async () =>
        new Response(null, {
          status: 204,
          headers: CORS_HEADERS,
        }),

      POST: async ({ request }) => {
        try {
          const {
            extractFnrhApiTokenFromRequest,
            resolveTenantByFnrhApiToken,
            getFnrhPayloadByTenantLocalizer,
            fnrhApiRequestSchema,
          } = await import("@/lib/fnrh-api.server");

          const token = extractFnrhApiTokenFromRequest(request);
          if (!token) {
            return jsonResponse(
              {
                error: "unauthorized",
                message:
                  "Informe o token no header Authorization: Bearer <token> ou X-Api-Key: <token>.",
              },
              401,
            );
          }

          const tenant = await resolveTenantByFnrhApiToken(token);
          if (!tenant) {
            return jsonResponse(
              {
                error: "unauthorized",
                message: "Token inválido ou empresa inativa.",
              },
              401,
            );
          }

          let rawBody: unknown;
          try {
            rawBody = await request.json();
          } catch {
            return jsonResponse(
              {
                error: "bad_request",
                message: "Body JSON inválido. Envie { \"localizer\": \"...\" }.",
              },
              400,
            );
          }

          const body = fnrhApiRequestSchema.parse(rawBody);

          if (
            body.publicNumber != null &&
            Number(body.publicNumber) !== Number(tenant.publicNumber)
          ) {
            return jsonResponse(
              {
                error: "forbidden",
                message: "publicNumber não corresponde à empresa do token.",
              },
              403,
            );
          }

          const result = await getFnrhPayloadByTenantLocalizer(
            tenant.id,
            body.localizer,
          );

          return jsonResponse({
            publicNumber: tenant.publicNumber,
            localizer: result.localizer,
            checkedInAt: result.checkedInAt,
            establishmentName: result.establishmentName,
            payload: result.payload,
          });
        } catch (error) {
          if (error instanceof ZodError) {
            return jsonResponse(
              {
                error: "validation_error",
                message: error.issues[0]?.message ?? "Request inválido.",
                issues: error.issues,
              },
              400,
            );
          }

          const message =
            error instanceof Error ? error.message : "Erro ao montar payload FNRH.";
          const notFound = /não encontrado/i.test(message);
          return jsonResponse(
            {
              error: notFound ? "not_found" : "internal_error",
              message,
            },
            notFound ? 404 : 500,
          );
        }
      },
    },
  },
});
