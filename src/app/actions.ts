"use server";

import { redirect } from "next/navigation";
import { getTicket, reserveTicket } from "@/lib/booking";
import { sendTicketEmail } from "@/lib/email";
import { getBaseUrl } from "@/lib/url";

export type ReserveState =
  | { error: string; soldOut?: boolean; values: { name: string; email: string } }
  | undefined;

export async function reserveAction(_prev: ReserveState, formData: FormData): Promise<ReserveState> {
  const values = {
    name: String(formData.get("name") ?? ""),
    email: String(formData.get("email") ?? ""),
  };
  // Honeypot: humans never see this field, simple bots fill it in.
  if (formData.get("website")) return { error: "Something went wrong. Please try again.", values };

  const result = await reserveTicket({
    ...values,
    idempotencyKey: String(formData.get("idempotencyKey") ?? ""),
  });

  if (!result.ok) return { error: result.message, soldOut: result.reason === "SOLD_OUT", values };

  const { ticket, replayed } = result;
  if (!replayed) {
    await sendTicketEmail(ticket, `${await getBaseUrl()}/ticket/${ticket.code}`);
  }
  redirect(`/ticket/${ticket.code}`);
}

export async function resendEmailAction(formData: FormData) {
  const ticket = await getTicket(String(formData.get("code") ?? ""));
  // Only retry emails that actually failed — this isn't an open mail relay.
  if (!ticket || ticket.email_status !== "FAILED") return;
  await sendTicketEmail(ticket, `${await getBaseUrl()}/ticket/${ticket.code}`);
  redirect(`/ticket/${ticket.code}`);
}
