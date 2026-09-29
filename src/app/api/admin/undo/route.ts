import { requireAdmin } from "@/lib/admin-auth";
import { undoCheckIn } from "@/lib/checkin";

// POST { code } -> the guest, back to "not arrived"
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const guest = await undoCheckIn(String(body.code ?? ""));
  if (!guest) return Response.json({ error: "Ticket isn't checked in." }, { status: 409 });
  return Response.json({ ok: true, guest });
}
