import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/admin-auth";
import { checkIn } from "../../../lib/checkin";
import { getEventById } from "../../../lib/event";

// POST { code, event } -> { result: "OK" | "ALREADY_IN" | "INVALID", ... }
// `code` is the scanned QR text (the ticket link) or a code typed by hand.
// `event` is the id of the event this door is for.
export const POST: APIRoute = async ({ request, cookies }) => {
  const auth = requireAdmin(cookies);
  if ("response" in auth) return auth.response;

  const body = await request.json().catch(() => ({}));
  const event = await getEventById(String(body.event ?? ""));
  if (!event) return Response.json({ result: "INVALID", reason: "Pick an event first." }, { status: 400 });

  return Response.json(await checkIn(String(body.code ?? ""), auth.admin, event.id), {
    headers: { "Cache-Control": "no-store" },
  });
};
