import nodemailer from "nodemailer";
import QRCode from "qrcode";
import { setEmailStatus, type Ticket } from "./booking";
import { EVENT, formatEventDate } from "./event";

export function emailConfigured() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function ticketQr(ticketUrl: string) {
  return QRCode.toBuffer(ticketUrl, { width: 480, margin: 1 });
}

export function renderTicketEmail(ticket: Ticket, ticketUrl: string, qrSrc: string) {
  const number = String(ticket.ticket_number).padStart(3, "0");
  return `<!doctype html>
<html><body style="margin:0;background:#f4f4f5;font-family:Helvetica,Arial,sans-serif;color:#111">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
    <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#fff;border-radius:16px;overflow:hidden">
      <tr><td style="background:#111;color:#fff;padding:28px 28px 22px">
        <div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#a3e635">You're in · Ticket #${number}</div>
        <div style="font-size:26px;font-weight:800;margin-top:8px">${escapeHtml(EVENT.name)}</div>
        <div style="font-size:14px;color:#d4d4d8;margin-top:6px">${escapeHtml(formatEventDate(EVENT.startsAt))} · ${escapeHtml(EVENT.venue)}</div>
      </td></tr>
      <tr><td style="padding:28px" align="center">
        <p style="margin:0 0 20px;font-size:15px;text-align:left">Hi ${escapeHtml(ticket.name)}, your free ticket is confirmed. Show this QR code at the door.</p>
        <img src="${qrSrc}" width="240" height="240" alt="Ticket QR code" style="display:block;border:0">
        <div style="font-family:Menlo,monospace;font-size:18px;font-weight:700;letter-spacing:2px;margin-top:14px">${ticket.code}</div>
        <a href="${ticketUrl}" style="display:inline-block;margin-top:20px;background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:600">View ticket online</a>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

/**
 * Sends the confirmation email and records the outcome on the ticket.
 * Runs after the reservation has committed: a failed email never
 * un-books a ticket, it just leaves email_status = FAILED to retry later.
 */
export async function sendTicketEmail(ticket: Ticket, ticketUrl: string) {
  if (!emailConfigured()) {
    console.log(`[email] SMTP not configured — skipped email to ${ticket.email} (${ticketUrl})`);
    await setEmailStatus(ticket.code, "SKIPPED");
    return "SKIPPED" as const;
  }

  try {
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST ?? "smtp.gmail.com",
      port: Number(process.env.SMTP_PORT ?? 465),
      secure: Number(process.env.SMTP_PORT ?? 465) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({
      from: process.env.EMAIL_FROM ?? `${EVENT.name} <${process.env.SMTP_USER}>`,
      to: ticket.email,
      subject: `Your ticket for ${EVENT.name} (#${ticket.ticket_number})`,
      text: `Hi ${ticket.name}, your free ticket is confirmed.\n\nTicket: ${ticket.code}\nView it here: ${ticketUrl}`,
      html: renderTicketEmail(ticket, ticketUrl, "cid:ticket-qr"),
      // Inline attachment: Gmail blocks data: URLs in images.
      attachments: [{ filename: "ticket.png", content: await ticketQr(ticketUrl), cid: "ticket-qr" }],
    });
    await setEmailStatus(ticket.code, "SENT");
    return "SENT" as const;
  } catch (err) {
    console.error(`[email] failed for ${ticket.code}:`, err);
    await setEmailStatus(ticket.code, "FAILED", String((err as Error).message ?? err).slice(0, 500));
    return "FAILED" as const;
  }
}
