import type { PorchcastCompanionStateMessage } from "@wiplash/podcast-contracts";

import {
  destinationUrl,
  isPorchcastAppUrl,
  parseCompanionStateMessage,
  porchUrl,
} from "./model";

const STATE_KEY = "porchcast.companionState.v1";
let latestState: PorchcastCompanionStateMessage | null = null;

type ExtensionRequest =
  | { type: "porchcast:get-state" }
  | { type: "porchcast:publish-state"; state: unknown }
  | { type: "porchcast:open-destination"; destination: "account" | "app" | "book" }
  | { type: "porchcast:open-porch"; porchId: string }
  | { type: "porchcast:open-recording"; porchId: string };

async function loadState(): Promise<PorchcastCompanionStateMessage | null> {
  if (latestState) return latestState;
  try {
    const stored = await chrome.storage.session.get(STATE_KEY);
    latestState = parseCompanionStateMessage(stored[STATE_KEY]);
  } catch {
    // Firefox and older developer builds can continue with worker memory only.
  }
  return latestState;
}

async function publishState(state: PorchcastCompanionStateMessage): Promise<void> {
  latestState = state;
  try {
    await chrome.storage.session.set({ [STATE_KEY]: state });
  } catch {
    // Session storage is an optimization; never fall back to persistent account storage.
  }
  const tabs = await chrome.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined) return;
    await chrome.tabs.sendMessage(tab.id, {
      type: "porchcast:state-broadcast",
      state,
    }).catch(() => undefined);
  }));
}

async function injectAndToggle(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined) return;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["scripts/content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, { type: "porchcast:toggle-widget" });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "" });
  } catch {
    await chrome.action.setBadgeBackgroundColor({ color: "#7c3aed" });
    await chrome.action.setBadgeText({ tabId: tab.id, text: "!" });
    await chrome.action.setTitle({
      tabId: tab.id,
      title: "Porchcast cannot appear on this protected browser page",
    });
  }
}

chrome.action.onClicked.addListener((tab) => {
  void injectAndToggle(tab);
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== "object" || !("type" in message)) return;
  const request = message as ExtensionRequest;
  if (request.type === "porchcast:get-state") {
    void loadState().then((state) => sendResponse({ state }));
    return true;
  }
  if (request.type === "porchcast:publish-state") {
    if (!isPorchcastAppUrl(sender.url ?? sender.tab?.url)) return;
    const state = parseCompanionStateMessage(request.state);
    if (state) void publishState(state);
    return;
  }
  if (request.type === "porchcast:open-destination") {
    if (!["account", "app", "book"].includes(request.destination)) return;
    void chrome.tabs.create({ url: destinationUrl(request.destination) });
  }
  if (request.type === "porchcast:open-porch" || request.type === "porchcast:open-recording") {
    const url = porchUrl(request.porchId);
    if (url) void chrome.tabs.create({ url });
  }
});
