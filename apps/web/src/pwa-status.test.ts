import { describe, expect, it } from "vitest";

import { selectPwaNotice } from "./PwaStatus";

describe("selectPwaNotice", () => {
  it("defers a waiting update until an active room becomes safe", () => {
    const waitingWorker = {
      needRefresh: true,
      offlineReady: false,
      online: true,
    };

    expect(selectPwaNotice({ ...waitingWorker, reloadSafe: false })).toBeNull();
    expect(selectPwaNotice({ ...waitingWorker, reloadSafe: true })).toBe("update");
  });

  it("keeps an in-room offline warning visible without exposing update actions", () => {
    expect(selectPwaNotice({
      needRefresh: true,
      offlineReady: false,
      online: false,
      reloadSafe: false,
    })).toBe("offline-room");
  });
});
