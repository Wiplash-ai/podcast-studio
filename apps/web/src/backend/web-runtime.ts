import {
  appPagePath,
  appPath,
  publicAppPageFromPath,
  type PublicAppPage,
} from "../public-path";
import {
  DEMO_HOST_TOKEN,
  DEMO_ROOM_ID,
  createDemoPorchcastBackend,
} from "./demo-porchcast-backend";
import { isDemoScenario, type DemoScenario } from "./demo-scenarios";
import {
  createHttpPorchcastBackend,
  type HttpPorchcastBackendOptions,
} from "./http-porchcast-backend";
import type { PorchcastBackend } from "./porchcast-backend";

export interface WebRuntime {
  readonly backend: PorchcastBackend;
  readonly demoScenario: DemoScenario | null;
  readonly initialRoom: { roomId: string; roomToken: string } | null;
  readonly mode: "cloud" | "demo";
  publicPagePath(page: PublicAppPage, state?: string): string;
  roomPath(roomId: string): string;
}

function withDemoScenario(path: string, scenario: DemoScenario): string {
  const target = new URL(path, "https://porchcast.invalid");
  target.searchParams.set("demo", scenario);
  return `${target.pathname}${target.search}${target.hash}`;
}

function demoPublicPagePath(
  page: PublicAppPage,
  state: string,
  scenario: DemoScenario,
): string {
  const target = new URL(
    withDemoScenario(`${appPagePath(page)}${state}`, scenario),
    "https://porchcast.invalid",
  );
  if (page === "home") target.searchParams.set("surface", "marketing");
  return `${target.pathname}${target.search}${target.hash}`;
}

export interface WebRuntimeOptions {
  getCsrfToken: HttpPorchcastBackendOptions["getCsrfToken"];
  url?: string | URL;
  configuredMode?: string;
  configuredDemoScenario?: string;
  fetcher?: typeof fetch;
  createIdempotencyKey?: () => string;
}

function selectDemoScenario(
  url: URL,
  configuredMode: string,
  configuredDemoScenario: string,
): DemoScenario | null {
  const runtime = url.searchParams.get("runtime");
  if (runtime === "cloud") return null;

  const requestedScenario = url.searchParams.get("demo");
  if (isDemoScenario(requestedScenario)) return requestedScenario;
  if (runtime === "demo") {
    return isDemoScenario(configuredDemoScenario) ? configuredDemoScenario : "ready";
  }
  if (configuredMode === "demo") {
    return isDemoScenario(configuredDemoScenario) ? configuredDemoScenario : "ready";
  }
  return null;
}

export function createWebRuntime(options: WebRuntimeOptions): WebRuntime {
  const url = new URL(
    options.url ?? window.location.href,
    "https://porchcast.invalid",
  );
  const scenario = selectDemoScenario(
    url,
    options.configuredMode?.trim().toLowerCase()
      ?? (import.meta.env.VITE_PORCHCAST_RUNTIME as string | undefined)?.trim().toLowerCase()
      ?? "cloud",
    options.configuredDemoScenario?.trim().toLowerCase()
      ?? (import.meta.env.VITE_PORCHCAST_DEMO_SCENARIO as string | undefined)?.trim().toLowerCase()
      ?? "ready",
  );

  if (scenario) {
    const publicPage = publicAppPageFromPath(url.pathname);
    const opensMarketingHome = publicPage === "home"
      && url.searchParams.get("surface") === "marketing";
    return {
      backend: createDemoPorchcastBackend({ scenario }),
      demoScenario: scenario,
      initialRoom: url.searchParams.has("room")
        || publicPage !== "home"
        || opensMarketingHome
        ? null
        : { roomId: DEMO_ROOM_ID, roomToken: DEMO_HOST_TOKEN },
      mode: "demo",
      publicPagePath: (page, state = "") => demoPublicPagePath(page, state, scenario),
      roomPath: (roomId) => withDemoScenario(
        appPath(`?room=${encodeURIComponent(roomId)}`),
        scenario,
      ),
    };
  }

  return {
    backend: createHttpPorchcastBackend({
      getCsrfToken: options.getCsrfToken,
      fetcher: options.fetcher,
      createIdempotencyKey: options.createIdempotencyKey,
    }),
    demoScenario: null,
    initialRoom: null,
    mode: "cloud",
    publicPagePath: (page, state = "") => `${appPagePath(page)}${state}`,
    roomPath: (roomId) => appPath(`?room=${encodeURIComponent(roomId)}`),
  };
}
