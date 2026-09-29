import { requireAdmin } from "@/lib/admin-auth";
import { checkIn } from "@/lib/checkin";

// POST { code } -> { result: "OK" | "ALREADY_IN" | "INVALID", ... }
// `code` can be the scanned QR text (the ticket link) or a typed-in code.
export async function POST(req: Request) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  return Response.json(await checkIn(String(body.code ?? ""), auth.admin));
}
