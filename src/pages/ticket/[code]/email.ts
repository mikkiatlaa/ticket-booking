import type { APIRoute } from "astro";
import QRCode from "qrcode";
import { getTicket } from "../../../lib/booking";
import { renderTicketEmail } from "../../../lib/email";
import { getEventById } from "../../../lib/event";
import { getBaseUrl } from "../../../lib/url";

// Shows the confirmation email in the browser: handy while email sending is not set up.
export const GET: APIRoute = async ({ params, request }) => {
  const ticket = await getTicket(params.code ?? "");
  const event = ticket && (await getEventById(ticket.event_id));
  if (!ticket || !event) return new Response("Not found", { status: 404 });

  const ticketUrl = `${getBaseUrl(request)}/ticket/${ticket.code}`;
  const qr = await QRCode.toDataURL(ticketUrl, { width: 480, margin: 1 });
  return new Response(renderTicketEmail(ticket, event, ticketUrl, qr), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
};
