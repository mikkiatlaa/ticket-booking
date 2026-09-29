"use client";

import type QrScanner from "qr-scanner";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CheckInResult } from "@/lib/checkin";

type Shown = CheckInResult | { result: "ERROR"; reason: string };

// Bare scanner: camera + result box + manual entry. Style it however you like.
export function Scanner() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const busy = useRef(false);
  const last = useRef({ text: "", at: 0 });
  const [shown, setShown] = useState<Shown | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const submit = useCallback(async (text: string) => {
    const now = Date.now();
    // The same QR stays in view for a few seconds: only send it once.
    if (busy.current || (text === last.current.text && now - last.current.at < 4000)) return;
    busy.current = true;
    last.current = { text, at: now };
    try {
      const res = await fetch("/api/admin/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: text }),
      });
      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }
      const data: CheckInResult = await res.json();
      setShown(data);
      navigator.vibrate?.(data.result === "OK" ? 150 : [80, 60, 80]);
    } catch {
      setShown({ result: "ERROR", reason: "No connection — try again." });
    } finally {
      busy.current = false;
    }
  }, [router]);

  useEffect(() => {
    let scanner: QrScanner | undefined;
    let cancelled = false;
    (async () => {
      const { default: QrScannerLib } = await import("qr-scanner");
      if (cancelled || !videoRef.current) return;
      scanner = new QrScannerLib(videoRef.current, (r) => submit(r.data), {
        returnDetailedScanResult: true,
        preferredCamera: "environment",
        highlightScanRegion: true,
        maxScansPerSecond: 5,
      });
      try {
        await scanner.start();
      } catch (err) {
        setCameraError(`Camera unavailable: ${err}. Use the code box below.`);
      }
    })();
    return () => {
      cancelled = true;
      scanner?.destroy();
    };
  }, [submit]);

  async function undo(code: string) {
    await fetch("/api/admin/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    setShown(null);
    last.current = { text: "", at: 0 };
  }

  return (
    <main className="mx-auto w-full max-w-md space-y-4 p-4">
      <div className="relative overflow-hidden bg-black">
        <video ref={videoRef} playsInline muted className="block aspect-square w-full object-cover" />
      </div>
      {cameraError && <p className="text-danger">{cameraError}</p>}

      <ResultBox shown={shown} onUndo={undo} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const input = e.currentTarget.elements.namedItem("code") as HTMLInputElement;
          last.current = { text: "", at: 0 };
          submit(input.value);
          input.value = "";
        }}
        className="flex gap-2"
      >
        <input name="code" placeholder="Type code, e.g. ABCD-EFGH" className="flex-1 border border-line bg-card p-2" />
        <button className="border border-line px-3">Check in</button>
      </form>
    </main>
  );
}

function ResultBox({ shown, onUndo }: { shown: Shown | null; onUndo: (code: string) => void }) {
  if (!shown) return <p className="border border-line p-4 text-muted">Point the camera at a ticket QR code.</p>;

  if (shown.result === "OK") {
    return (
      <div className="bg-green-600 p-4 text-white">
        <p className="text-2xl font-bold">✅ Welcome, {shown.guest.name}</p>
        <p>{shown.guest.ticket_id}</p>
        <button onClick={() => onUndo(shown.guest.code)} className="mt-2 underline">Undo</button>
      </div>
    );
  }
  if (shown.result === "ALREADY_IN") {
    const at = new Date(shown.guest.checked_in_at!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    return (
      <div className="bg-amber-500 p-4 text-black">
        <p className="text-2xl font-bold">⚠️ Already inside</p>
        <p>
          {shown.guest.name} · {shown.guest.ticket_id} · scanned {at} by {shown.guest.checked_in_by}
        </p>
      </div>
    );
  }
  return (
    <div className="bg-red-600 p-4 text-white">
      <p className="text-2xl font-bold">❌ Not valid</p>
      <p>{shown.reason}</p>
    </div>
  );
}
