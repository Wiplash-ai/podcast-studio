import { destinationUrl, porchUrl } from "./model";

type ExtensionRequest =
  | { type: "porchcast:open-destination"; destination: "app" | "book" | "pricing" }
  | { type: "porchcast:open-porch"; porchId: string };

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

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (!message || typeof message !== "object" || !("type" in message)) return;
  const request = message as ExtensionRequest;
  if (request.type === "porchcast:open-destination") {
    if (!["app", "book", "pricing"].includes(request.destination)) return;
    void chrome.tabs.create({ url: destinationUrl(request.destination) });
  }
  if (request.type === "porchcast:open-porch") {
    const url = porchUrl(request.porchId);
    if (url) void chrome.tabs.create({ url });
  }
});
