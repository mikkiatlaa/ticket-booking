import { connection } from "next/server";
import { getStats } from "@/lib/booking";

export async function GET() {
  await connection();
  return Response.json(await getStats(), { headers: { "Cache-Control": "no-store" } });
}
