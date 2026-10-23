import {
  isLocalHostHostHeader,
  serializeEmbedSessionCookie,
  verifyEmbedSessionToken,
} from "backend-lib/src/embedSession";
import { FastifyInstance } from "fastify";

const UNAUTHORIZED_EMBED_PAGE = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="initial-scale=1, width=device-width" />
    <title>401 - Embed link invalid or expired</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
          Helvetica, Arial, sans-serif;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
        color: #637381;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>401</h1>
      <p>This embed link is invalid or expired. Request a new link.</p>
    </main>
  </body>
</html>`;

/**
 * Token-authed, chrome-free embed page route.
 *
 * `GET /embed/<component>?token=...` verifies the HMAC embed token; on
 * success it sets the HttpOnly `embed_session` cookie holding the same
 * signed token, then redirects (preserving path and query) to the
 * chrome-free dashboard page under /dashboard/embed/<component>, which the
 * embed pages' cookie-carrying XHRs work against unchanged. An invalid or
 * expired token renders a 401 page.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export default async function embedPageController(fastify: FastifyInstance) {
  fastify.route({
    method: ["GET", "HEAD"],
    url: "/*",
    handler: async (request, reply) => {
      const { token } = request.query as { token?: unknown };
      if (typeof token !== "string" || token.length === 0) {
        request.log.info({ url: request.url }, "embed page token missing");
        return reply
          .status(401)
          .type("text/html; charset=utf-8")
          .send(UNAUTHORIZED_EMBED_PAGE);
      }
      const verified = verifyEmbedSessionToken(token);
      if (verified.isErr()) {
        request.log.info(
          {
            url: request.url,
            error: verified.error,
          },
          "embed page token rejected",
        );
        return reply
          .status(401)
          .type("text/html; charset=utf-8")
          .send(UNAUTHORIZED_EMBED_PAGE);
      }
      const { exp } = verified.value;
      reply.header(
        "Set-Cookie",
        serializeEmbedSessionCookie({
          token,
          expiresAtMs: exp * 1000,
          secure: !isLocalHostHostHeader(request.headers.host),
        }),
      );
      const target = request.url.replace(/^\/embed(?=\/|$)/, "/dashboard/embed");
      return reply.redirect(302, target);
    },
  });
}
