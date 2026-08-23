import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { useRegisterSW } from "virtual:pwa-register/react";

export type PwaNotice = "offline" | "offline-room" | "update" | "ready" | null;

export function selectPwaNotice({
  needRefresh,
  offlineReady,
  online,
  reloadSafe,
}: {
  needRefresh: boolean;
  offlineReady: boolean;
  online: boolean;
  reloadSafe: boolean;
}): PwaNotice {
  if (!online) return reloadSafe ? "offline" : "offline-room";
  if (!reloadSafe) return null;
  if (needRefresh) return "update";
  if (offlineReady) return "ready";
  return null;
}

export function PwaStatus({
  reloadSafe,
  roomHeaderSelector,
}: {
  reloadSafe: boolean;
  roomHeaderSelector?: string;
}) {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [roomNoticeTop, setRoomNoticeTop] = useState<number | null>(null);
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error("Porchcast could not prepare its offline shell.", error);
    },
  });
  const notice = selectPwaNotice({ needRefresh, offlineReady, online, reloadSafe });

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useLayoutEffect(() => {
    if (!roomHeaderSelector) {
      setRoomNoticeTop(null);
      return;
    }
    const header = document.querySelector<HTMLElement>(roomHeaderSelector);
    if (!header) {
      setRoomNoticeTop(null);
      return;
    }
    const updatePosition = () => setRoomNoticeTop(header.getBoundingClientRect().bottom + 12);
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(header);
    window.addEventListener("resize", updatePosition);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updatePosition);
    };
  }, [roomHeaderSelector]);

  if (notice === "offline" || notice === "offline-room") {
    return (
      <aside
        aria-live="polite"
        className={`pwa-status pwa-status-offline${notice === "offline-room" ? " pwa-status-in-room" : ""}`}
        role="status"
        style={notice === "offline-room" && roomNoticeTop !== null
          ? { "--pwa-room-top": `${roomNoticeTop}px` } as CSSProperties
          : undefined}
      >
        <span>Offline</span>
        <p>{notice === "offline"
          ? "Cached pages remain available. Porches and Cloud recording need a connection."
          : "Cloud features are reconnecting."}</p>
      </aside>
    );
  }

  // Never put a reload or dismissal decision over an active room. Workbox keeps
  // the update waiting; the prompt appears when the room becomes safe to leave.
  if (!notice) return null;

  if (notice === "update") {
    return (
      <aside aria-live="polite" className="pwa-status pwa-status-update" role="status">
        <span>Update ready</span>
        <p>Reload to use the latest Porchcast version.</p>
        <button
          onClick={() => void updateServiceWorker(true)}
          type="button"
        >Reload Porchcast</button>
      </aside>
    );
  }

  if (notice === "ready") {
    return (
      <aside aria-live="polite" className="pwa-status pwa-status-ready" role="status">
        <span>Ready offline</span>
        <p>Porchcast can reopen its app shell without a connection.</p>
        <button onClick={() => setOfflineReady(false)} type="button">Dismiss</button>
      </aside>
    );
  }

  return null;
}
