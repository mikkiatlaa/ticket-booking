import { headers } from "next/headers";

// The public address of the app. Set PUBLIC_URL when deployed; otherwise
// use whatever host the request came in on (localhost or your LAN IP).
export async function getBaseUrl() {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}
