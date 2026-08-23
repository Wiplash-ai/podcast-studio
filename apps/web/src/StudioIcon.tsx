export type StudioIconName =
  | "bookmark"
  | "camera"
  | "chat"
  | "download"
  | "hangup"
  | "info"
  | "invite"
  | "layout"
  | "microphone"
  | "picture-in-picture"
  | "screen"
  | "settings";

export function StudioIcon({ name }: { name: StudioIconName }) {
  return (
    <svg aria-hidden="true" className="control-icon" viewBox="0 0 24 24">
      {name === "microphone" ? (
        <>
          <rect height="10" rx="3" width="6" x="9" y="3" />
          <path d="M6.5 11.5a5.5 5.5 0 0 0 11 0M12 17v4M9 21h6" />
        </>
      ) : null}
      {name === "camera" ? (
        <>
          <rect height="12" rx="2.5" width="14" x="3" y="6" />
          <path d="m17 10 4-2v8l-4-2" />
        </>
      ) : null}
      {name === "screen" ? (
        <>
          <rect height="13" rx="2.5" width="18" x="3" y="4" />
          <path d="M8 21h8M12 17v4" />
        </>
      ) : null}
      {name === "settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
        </>
      ) : null}
      {name === "info" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 10.5V17M12 7.2h.01" />
        </>
      ) : null}
      {name === "download" ? (
        <>
          <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
          <path d="M4 18v3h16v-3" />
        </>
      ) : null}
      {name === "hangup" ? (
        <path className="hangup-phone" d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 6a2 2 0 0 1 2-2Z" />
      ) : null}
      {name === "chat" ? <><path d="M4 5.5h16v11H9l-5 3v-14Z" /><path d="M8 10h8M8 13h5" /></> : null}
      {name === "invite" ? <><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.7-3.2 2.5-5 5.5-5s4.8 1.8 5.5 5M18 7v6M15 10h6" /></> : null}
      {name === "layout" ? <><rect height="14" rx="2" width="18" x="3" y="5" /><path d="M12 5v14" /></> : null}
      {name === "picture-in-picture" ? <><rect height="16" rx="2.5" width="20" x="2" y="4" /><rect height="6" rx="1.2" width="8" x="11" y="11" /></> : null}
      {name === "bookmark" ? <path d="M6 3.5h12v17L12 17l-6 3.5v-17Z" /> : null}
    </svg>
  );
}
