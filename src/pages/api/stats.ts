import type { APIRoute } from "astro";
import { getStats } from "../../lib/booking";
import { getLiveEventBySlug } from "../../lib/event";

// GET /api/stats?event=<slug>  ->  { capacity, reserved, remaining }
export const GET: APIRoute = async ({ url }) => {
  const event = await getLiveEventBySlug(url.searchParams.get("event") ?? "");
  if (!event) return Response.json({ error: "Event not found" }, { status: 404 });
  return Response.json(await getStats(event.id), { headers: { "Cache-Control": "no-store" } });
};
