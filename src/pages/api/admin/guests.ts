import type { APIRoute } from "astro";
import { requireAdmin } from "../../../lib/admin-auth";
import { listGuests } from "../../../lib/checkin";
import { getEventBySlug } from "../../../lib/event";

// GET ?event=<slug> -> { counts, inside: Guest[], notArrived: Guest[] }
export const GET: APIRoute = async ({ url, cookies }) => {
  const auth = requireAdmin(cookies);
  if ("response" in auth) return auth.response;

  const event = await getEventBySlug(url.searchParams.get("event") ?? "");
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  return Response.json(await listGuests(event.id), { headers: { "Cache-Control": "no-store" } });
};
