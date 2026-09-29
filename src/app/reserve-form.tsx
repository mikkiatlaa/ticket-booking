"use client";

import { useActionState } from "react";
import { reserveAction, type ReserveState } from "./actions";

export function ReserveForm({ idempotencyKey, soldOut }: { idempotencyKey: string; soldOut: boolean }) {
  const [state, formAction, pending] = useActionState<ReserveState, FormData>(reserveAction, undefined);
  const closed = soldOut || state?.soldOut;

  if (closed) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-center">
        <p className="text-xl font-bold">Sold out</p>
        <p className="mt-1 text-sm text-muted">Every ticket has been claimed. See you next time.</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      {/* One key per page load: a double-click or retry returns the same ticket. */}
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      <div aria-hidden className="absolute -left-[9999px]">
        <label>
          Website <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="block">
        <span className="text-sm font-medium text-muted">Name</span>
        <input
          name="name"
          required
          maxLength={80}
          autoComplete="name"
          defaultValue={state?.values.name}
          placeholder="Your name"
          className="mt-1.5 w-full rounded-xl border border-line bg-card px-4 py-3.5 text-base outline-none placeholder:text-zinc-600 focus:border-accent"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-muted">Email</span>
        <input
          name="email"
          type="email"
          required
          maxLength={200}
          autoComplete="email"
          inputMode="email"
          defaultValue={state?.values.email}
          placeholder="you@example.com"
          className="mt-1.5 w-full rounded-xl border border-line bg-card px-4 py-3.5 text-base outline-none placeholder:text-zinc-600 focus:border-accent"
        />
      </label>

      {state?.error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-full bg-accent px-6 py-4 text-base font-bold text-black transition active:scale-[0.98] disabled:opacity-60"
      >
        {pending ? "Reserving your spot…" : "Get my free ticket"}
      </button>
      <p className="text-center text-xs text-muted">
        We&apos;ll email your ticket. One ticket per email address.
      </p>
    </form>
  );
}
