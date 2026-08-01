"use client";
// Keeps the "right window" live (price lever + order confirmation) via a 2s server re-render,
// matching the app's polling cadence (Doc 4 A1). No new API surface needed.
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function Refresher({ ms = 2000 }: { ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), ms);
    return () => clearInterval(id);
  }, [router, ms]);
  return null;
}
