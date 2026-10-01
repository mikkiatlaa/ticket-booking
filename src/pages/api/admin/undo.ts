import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/admin-auth";
import { undoCheckIn } from "../../../lib/checkin";

// POST { code } -> the guest, back to "not arrived"
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = requireAdmin(cookies);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const guest = await undoCheckIn(String(body.code ?? ""));
  if (!guest) return Response.json({ error: "Ticket isn't checked in." }, { status: 409 });
  return Response.json({ ok: true, guest });
};
