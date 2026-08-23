import type { PorchcastCompanionSnapshot } from "@wiplash/podcast-contracts";

import {
  PORCHCAST_APP_ORIGIN,
  defaultWidgetPreferences,
  normalizeRecentPorches,
  normalizeWidgetPreferences,
  parseCompanionStateMessage,
  upsertRecentPorch,
  type RecentPorch,
  type WidgetPreferences,
} from "./model";

declare const __PORCHCAST_WIDGET_CSS__: string;
declare const __PORCHCAST_MARK_DATA_URL__: string;

const RECENTS_KEY = "porchcast.recentPorches.v1";
const PREFERENCES_KEY = "porchcast.widgetPreferences.v1";
const INSTALL_KEY = "__porchcastCompanionInstalledV1";

type CompanionWindow = Window & typeof globalThis & {
  [INSTALL_KEY]?: true;
};

type ActionIcon = "account" | "book" | "home";

const companionWindow = window as CompanionWindow;

if (!companionWindow[INSTALL_KEY]) {
  companionWindow[INSTALL_KEY] = true;
  let host: HTMLElement | null = null;
  let currentState: PorchcastCompanionSnapshot | null = null;
  let recentPorches: RecentPorch[] = [];
  let preferences: WidgetPreferences = defaultWidgetPreferences;

  function element<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    className?: string,
    text?: string,
  ): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function send(message: object): void {
    void chrome.runtime.sendMessage(message);
  }

  function statusLabel(state: PorchcastCompanionSnapshot | null): string {
    if (!state?.porch) {
      return state?.account.state === "ready" || state?.account.state === "degraded"
        ? "Wiplash account connected"
        : "Ready when you are";
    }
    return {
      attention: "Needs attention",
      live: "Live Porch",
      ready: "Recording ready",
      recording: "Recording",
      rendering: "Preparing recordings",
      unknown: "Status unavailable",
    }[state.status];
  }

  function lifecycleLabel(value: string): string {
    return value === "finalizing" ? "Preparing" : value.charAt(0).toUpperCase() + value.slice(1);
  }

  function formatDuration(seconds: number | null): string {
    if (seconds === null) return "Duration pending";
    const hours = Math.floor(seconds / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);
    return hours ? `${hours}h ${minutes}m` : `${Math.max(1, minutes)}m`;
  }

  function relativeVisit(value: string): string {
    const elapsed = Math.max(0, Date.now() - Date.parse(value));
    const minutes = Math.floor(elapsed / 60_000);
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  function clampPosition(x: number, y: number): { x: number; y: number } {
    const width = host?.offsetWidth || 348;
    const height = host?.offsetHeight || 440;
    return {
      x: Math.max(12, Math.min(x, window.innerWidth - width - 12)),
      y: Math.max(12, Math.min(y, window.innerHeight - height - 12)),
    };
  }

  function applyPosition(): void {
    if (!host) return;
    const fallback = { x: window.innerWidth - host.offsetWidth - 24, y: 88 };
    const next = clampPosition(preferences.x ?? fallback.x, preferences.y ?? fallback.y);
    host.style.left = `${next.x}px`;
    host.style.top = `${next.y}px`;
    host.style.right = "auto";
    preferences = { ...preferences, ...next };
  }

  async function savePreferences(next: WidgetPreferences): Promise<void> {
    preferences = next;
    await chrome.storage.local.set({ [PREFERENCES_KEY]: next });
  }

  function actionIcon(name: ActionIcon): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("viewBox", "0 0 24 24");
    const paths = {
      account: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4.5 21c.8-4.7 3.3-7 7.5-7s6.7 2.3 7.5 7"],
      book: ["M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z", "M12 12v5m-2.5-2.5h5"],
      home: ["m3.5 11 8.5-7 8.5 7", "M6 10v10h12V10", "M10 20v-6h4v6"],
    }[name];
    for (const data of paths) {
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", data);
      svg.append(path);
    }
    return svg;
  }

  function makeAction(
    label: string,
    icon: ActionIcon,
    action: () => void,
    primary = false,
  ): HTMLButtonElement {
    const button = element("button", primary ? "pc-action pc-primary" : "pc-action");
    button.type = "button";
    button.title = label;
    button.setAttribute("aria-label", label);
    button.dataset.tooltip = label;
    button.append(actionIcon(icon));
    button.addEventListener("click", action);
    return button;
  }

  function updateState(state: PorchcastCompanionSnapshot): void {
    if (currentState && state.revision < currentState.revision) return;
    currentState = state;
    if (state.porch) {
      recentPorches = upsertRecentPorch(recentPorches, state.porch, new Date().toISOString());
      void chrome.storage.local.set({ [RECENTS_KEY]: recentPorches });
    }
    if (host) render();
  }

  function render(): void {
    if (!host) return;
    const root = host.shadowRoot;
    if (!root) return;
    root.replaceChildren();
    const style = element("style");
    style.textContent = __PORCHCAST_WIDGET_CSS__;
    root.append(style);

    const panel = element("section", `pc-panel${preferences.collapsed ? " pc-collapsed" : ""}`);
    panel.setAttribute("aria-label", "Porchcast companion");
    const header = element("header", "pc-header");
    header.tabIndex = 0;
    header.setAttribute("aria-label", "Move Porchcast companion with arrow keys");
    const brand = element("div", "pc-brand");
    const mark = element("span", "pc-mark");
    mark.setAttribute("aria-hidden", "true");
    const markImage = element("img");
    markImage.alt = "";
    markImage.src = __PORCHCAST_MARK_DATA_URL__;
    mark.append(markImage);
    const brandCopy = element("span");
    brandCopy.append(element("strong", undefined, "Porchcast"), element("small", undefined, statusLabel(currentState)));
    brand.append(mark, brandCopy);
    const headerActions = element("div", "pc-header-actions");
    const collapse = element("button", "pc-icon", preferences.collapsed ? "+" : "−");
    collapse.type = "button";
    collapse.title = preferences.collapsed ? "Expand companion" : "Collapse companion";
    collapse.setAttribute("aria-label", collapse.title);
    collapse.addEventListener("click", () => {
      void savePreferences({ ...preferences, collapsed: !preferences.collapsed }).then(render);
    });
    const close = element("button", "pc-icon", "×");
    close.type = "button";
    close.title = "Close companion";
    close.setAttribute("aria-label", close.title);
    close.addEventListener("click", () => {
      host?.remove();
      host = null;
    });
    headerActions.append(collapse, close);
    header.append(brand, headerActions);
    panel.append(header);

    if (!preferences.collapsed) {
      const body = element("div", "pc-body");
      if (currentState?.porch) {
        const current = element("article", "pc-current");
        const eyebrow = element("span", "pc-eyebrow", `${currentState.porch.role} · Current Porch`);
        const title = element("h2", undefined, currentState.porch.title);
        const status = element("p", `pc-status pc-${currentState.status}`);
        status.append(element("i"), document.createTextNode(statusLabel(currentState)));
        current.append(eyebrow, title, status);
        body.append(current);
      } else {
        body.append(element("p", "pc-intro", "Keep a Porch close while you work in another tab. Camera, microphone, and recording stay in the secure Porchcast page."));
      }

      const accountState = currentState?.account.state ?? "checking";
      const signedIn = accountState === "ready" || accountState === "degraded";
      const recents = element("section", "pc-recents");
      const recentsHeading = element("div", "pc-section-heading");
      recentsHeading.append(element("strong", undefined, signedIn ? "Your Porches" : "Recent Porches"));
      const visiblePorches = signedIn
        ? (currentState?.account.porches ?? []).slice(0, 4)
        : recentPorches.slice(0, 4);
      if (!signedIn && recentPorches.length > 0) {
        const clear = element("button", "pc-text-button", "Clear");
        clear.type = "button";
        clear.addEventListener("click", () => {
          void chrome.storage.local.set({ [RECENTS_KEY]: [] }).then(() => {
            recentPorches = [];
            render();
          });
        });
        recentsHeading.append(clear);
      }
      recents.append(recentsHeading);
      if (visiblePorches.length === 0) {
        recents.append(element("p", "pc-empty", signedIn
          ? "Your saved Porches will appear here."
          : "Your recent Porches will appear after you join them."));
      } else {
        const list = element("div", "pc-porch-list");
        for (const porch of visiblePorches) {
          const button = element("button", "pc-porch");
          button.type = "button";
          const copy = element("span");
          const detail = "updatedAt" in porch
            ? lifecycleLabel(porch.lifecycleState)
            : `${porch.role} · ${relativeVisit(porch.lastVisitedAt)}`;
          copy.append(element("strong", undefined, porch.title), element("small", undefined, detail));
          button.append(copy, element("i", undefined, "↗"));
          button.addEventListener("click", () => send({ type: "porchcast:open-porch", porchId: porch.id }));
          list.append(button);
        }
        recents.append(list);
      }
      body.append(recents);

      if (signedIn) {
        const recordings = element("section", "pc-library");
        const recordingsHeading = element("div", "pc-section-heading");
        const recordingItems = currentState?.account.recordings ?? [];
        recordingsHeading.append(
          element("strong", undefined, "Your Recordings"),
          element("span", "pc-count", String(recordingItems.length)),
        );
        recordings.append(recordingsHeading);
        if (recordingItems.length === 0) {
          recordings.append(element("p", "pc-empty", accountState === "degraded"
            ? "Recordings could not refresh. Open your account to retry."
            : "Cloud recordings will appear here after you stop and save."));
        } else {
          const list = element("div", "pc-recording-list");
          for (const recording of recordingItems.slice(0, 3)) {
            const button = element("button", "pc-recording");
            button.type = "button";
            const copy = element("span");
            copy.append(
              element("strong", undefined, recording.name),
              element("small", undefined, `${recording.porchTitle} · ${formatDuration(recording.durationSeconds)}`),
            );
            button.append(
              copy,
              element("i", `pc-recording-state pc-${recording.lifecycleState}`, lifecycleLabel(recording.lifecycleState)),
            );
            button.addEventListener("click", () => send({
              type: "porchcast:open-recording",
              porchId: recording.porchId,
            }));
            list.append(button);
          }
          recordings.append(list);
        }
        body.append(recordings);
      } else if (accountState === "unavailable") {
        body.append(element("p", "pc-account-note", "Wiplash account sync is unavailable. Open sign in to retry."));
      }

      const actions = element("div", "pc-actions");
      const accountLabel = signedIn ? "Open account" : "Sign in";
      actions.append(
        makeAction("Book a Porch", "book", () => send({ type: "porchcast:open-destination", destination: "book" }), true),
        makeAction("Open Porchcast", "home", () => send({ type: "porchcast:open-destination", destination: "app" })),
        makeAction(accountLabel, "account", () => send({ type: "porchcast:open-destination", destination: "account" })),
      );
      body.append(actions);
      const footer = element("footer", "pc-footer");
      footer.append(document.createTextNode("Produced by "));
      const producer = element("a", undefined, "Wiplash.ai");
      producer.href = "https://wiplash.ai";
      producer.target = "_blank";
      producer.rel = "noopener noreferrer";
      footer.append(producer);
      body.append(footer);
      panel.append(body);
    }
    root.append(panel);
    window.requestAnimationFrame(applyPosition);

    let drag: { pointerId: number; startX: number; startY: number; x: number; y: number } | null = null;
    header.addEventListener("pointerdown", (event) => {
      if (event.target instanceof HTMLButtonElement || !host) return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: host.offsetLeft,
        y: host.offsetTop,
      };
      header.setPointerCapture(event.pointerId);
      panel.classList.add("pc-dragging");
    });
    header.addEventListener("pointermove", (event) => {
      if (!drag || drag.pointerId !== event.pointerId || !host) return;
      const next = clampPosition(drag.x + event.clientX - drag.startX, drag.y + event.clientY - drag.startY);
      host.style.left = `${next.x}px`;
      host.style.top = `${next.y}px`;
      preferences = { ...preferences, ...next };
    });
    const stopDrag = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      drag = null;
      panel.classList.remove("pc-dragging");
      void savePreferences(preferences);
    };
    header.addEventListener("pointerup", stopDrag);
    header.addEventListener("pointercancel", stopDrag);
    header.addEventListener("keydown", (event) => {
      if (!host || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
      event.preventDefault();
      const amount = event.shiftKey ? 24 : 8;
      const next = clampPosition(
        host.offsetLeft + (event.key === "ArrowLeft" ? -amount : event.key === "ArrowRight" ? amount : 0),
        host.offsetTop + (event.key === "ArrowUp" ? -amount : event.key === "ArrowDown" ? amount : 0),
      );
      host.style.left = `${next.x}px`;
      host.style.top = `${next.y}px`;
      void savePreferences({ ...preferences, ...next });
    });
  }

  async function mountWidget(): Promise<void> {
    if (host?.isConnected) return;
    const stored = await chrome.storage.local.get([RECENTS_KEY, PREFERENCES_KEY]);
    recentPorches = normalizeRecentPorches(stored[RECENTS_KEY]);
    preferences = normalizeWidgetPreferences(stored[PREFERENCES_KEY]);
    const cached = await new Promise<unknown>((resolve) => {
      chrome.runtime.sendMessage({ type: "porchcast:get-state" }, (response) => {
        void chrome.runtime.lastError;
        resolve(response && typeof response === "object" && "state" in response
          ? (response as { state: unknown }).state
          : null);
      });
    });
    const cachedMessage = parseCompanionStateMessage(cached);
    if (cachedMessage) currentState = cachedMessage.payload;
    host = document.createElement("div");
    host.id = "porchcast-companion-root";
    host.style.position = "fixed";
    host.style.zIndex = "2147483647";
    host.attachShadow({ mode: "open" });
    document.documentElement.append(host);
    render();
  }

  function receivePageState(event: MessageEvent<unknown>): void {
    if (event.source !== window || event.origin !== PORCHCAST_APP_ORIGIN) return;
    const message = parseCompanionStateMessage(event.data);
    if (!message) return;
    updateState(message.payload);
    send({ type: "porchcast:publish-state", state: message });
  }

  window.addEventListener("message", receivePageState);
  window.addEventListener("resize", applyPosition);
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!message || typeof message !== "object" || !("type" in message)) return;
    if ((message as { type: string }).type === "porchcast:state-broadcast") {
      const state = parseCompanionStateMessage((message as { state?: unknown }).state);
      if (state) updateState(state.payload);
      return;
    }
    if ((message as { type: string }).type !== "porchcast:toggle-widget") return;
    if (host?.isConnected) {
      host.remove();
      host = null;
    } else {
      void mountWidget();
    }
    sendResponse({ ok: true });
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (RECENTS_KEY in changes) recentPorches = normalizeRecentPorches(changes[RECENTS_KEY]?.newValue);
    if (PREFERENCES_KEY in changes) preferences = normalizeWidgetPreferences(changes[PREFERENCES_KEY]?.newValue);
    if (host) render();
  });
  if (window.location.origin === PORCHCAST_APP_ORIGIN) {
    window.postMessage({
      protocol: "porchcast-companion",
      version: 1,
      source: "porchcast-extension",
      type: "state_request",
    }, window.location.origin);
  }
}
