"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the server page periodically so new patient messages show up
// without a manual reload. Pauses while the coordinator is typing.
export function AutoRefresh({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      const active = document.activeElement;
      if (active instanceof HTMLTextAreaElement && active.value) return;
      router.refresh();
    }, intervalMs);
    return () => clearInterval(timer);
  }, [router, intervalMs]);
  return null;
}
