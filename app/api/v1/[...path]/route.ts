import { ApiError } from "@/lib/api/errors";
import { apiRoute } from "@/lib/api/handler";

export const runtime = "nodejs";

/** Unknown /api/v1 paths answer with a problem+json 404 instead of the HTML not-found page. */
const notFound = apiRoute<{ path: string[] }>(async (ctx) => {
  throw new ApiError(404, "not_found", ctx.t.errors.apiRouteNotFound);
});

export { notFound as GET, notFound as POST, notFound as PUT, notFound as PATCH, notFound as DELETE };
