import { adminEnabled, login, logout } from "@/lib/admin-auth";

// POST { pin, name } -> sets the admin cookie
export async function POST(req: Request) {
  if (!adminEnabled()) {
    return Response.json({ error: "Admin is off: set ADMIN_PIN (6+ characters)." }, { status: 503 });
  }
  const body = await req.json().catch(() => ({}));
  const ok = await login({ pin: String(body.pin ?? ""), name: String(body.name ?? "") });
  if (!ok) {
    // Slow down PIN guessing.
    await new Promise((r) => setTimeout(r, 1000));
    return Response.json({ error: "Wrong PIN or missing name." }, { status: 401 });
  }
  return Response.json({ ok: true });
}

// DELETE -> logs out
export async function DELETE() {
  await logout();
  return Response.json({ ok: true });
}
