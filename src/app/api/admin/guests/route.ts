import { requireAdmin } from "@/lib/admin-auth";
import { listGuests } from "@/lib/checkin";

// GET -> { counts, inside: Guest[], notArrived: Guest[] }
export async function GET() {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  return Response.json(await listGuests(), { headers: { "Cache-Control": "no-store" } });
}
