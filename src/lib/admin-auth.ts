import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

// Admins log in with a shared PIN (ADMIN_PIN env var) plus their own name,
// which is recorded on every ticket they scan. The session is a signed
// cookie: "name.expiry.signature" — no database table needed.

const COOKIE = "admin_session";
const SESSION_HOURS = 12;

function pin() {
  const value = process.env.ADMIN_PIN ?? "";
  // Too short to be safe on a public site: treat admin as switched off.
  return value.length >= 6 ? value : null;
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function adminEnabled() {
  return pin() !== null;
}

export async function login(input: { pin: string; name: string }) {
  const secret = pin();
  const name = input.name.trim().slice(0, 40);
  if (!secret || !name || !safeEqual(input.pin, secret)) return false;

  const expires = Date.now() + SESSION_HOURS * 3600_000;
  const payload = `${Buffer.from(name).toString("base64url")}.${expires}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload, secret)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
  return true;
}

export async function logout() {
  (await cookies()).delete(COOKIE);
}

/** Returns the logged-in admin's name, or null. */
export async function getAdmin(): Promise<string | null> {
  const secret = pin();
  const value = (await cookies()).get(COOKIE)?.value;
  if (!secret || !value) return null;

  const [name64, expires, signature] = value.split(".");
  if (!name64 || !expires || !signature) return null;
  if (!safeEqual(signature, sign(`${name64}.${expires}`, secret))) return null;
  if (Number(expires) < Date.now()) return null;
  return Buffer.from(name64, "base64url").toString();
}

/** For API routes: the admin's name, or a ready-made 401 response. */
export async function requireAdmin(): Promise<{ admin: string } | { response: Response }> {
  const admin = await getAdmin();
  if (admin) return { admin };
  return { response: Response.json({ error: "Not logged in" }, { status: 401 }) };
}
