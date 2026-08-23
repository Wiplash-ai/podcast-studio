import { useEffect, useState } from "react";

export function useTransientMessage(durationMs = 6_000) {
  const [notice, setNotice] = useState<{ key: number; text: string } | null>(null);

  function setMessage(value: string | null) {
    setNotice(value ? { key: Date.now() + Math.random(), text: value } : null);
  }

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, notice]);

  return [notice?.text ?? null, setMessage] as const;
}
