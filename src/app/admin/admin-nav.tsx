"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function AdminNav({ admin }: { admin: string }) {
  const router = useRouter();
  async function logout() {
    await fetch("/api/admin/login", { method: "DELETE" });
    router.replace("/admin/login");
  }

  return (
    <nav className="flex items-center gap-4 border-b border-line px-4 py-3 text-sm">
      <Link href="/admin/scan" className="underline">Scan</Link>
      <Link href="/admin/guests" className="underline">Guests</Link>
      <span className="ml-auto text-muted">{admin}</span>
      <button onClick={logout} className="underline">Log out</button>
    </nav>
  );
}
