"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// Bare admin login — style it however you like.
export default function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.get("name"), pin: form.get("pin") }),
    });
    if (res.ok) {
      router.replace("/admin/scan");
      return;
    }
    setError((await res.json().catch(() => null))?.error ?? "Login failed");
    setPending(false);
  }

  return (
    <main className="mx-auto w-full max-w-sm p-6">
      <h1 className="text-xl font-bold">Admin login</h1>
      <form onSubmit={onSubmit} className="mt-4 space-y-3">
        <label className="block">
          Your name (shown on tickets you scan)
          <input name="name" required maxLength={40} className="mt-1 block w-full border border-line bg-card p-2" />
        </label>
        <label className="block">
          PIN
          <input name="pin" type="password" required className="mt-1 block w-full border border-line bg-card p-2" />
        </label>
        {error && <p className="text-danger">{error}</p>}
        <button disabled={pending} className="w-full border border-line p-2">
          {pending ? "Checking…" : "Log in"}
        </button>
      </form>
    </main>
  );
}
