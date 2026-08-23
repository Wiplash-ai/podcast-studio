const configuredApiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim() ?? "";
const configuredExtensionUrl = (import.meta.env.VITE_EXTENSION_URL as string | undefined)?.trim() ?? "";

export const API_BASE = configuredApiBase.replace(/\/$/, "");

export type PublicAppPage = "home" | "pricing" | "privacy";

function normalizedAppBase(base: string): string {
  return base.endsWith("/") ? base : `${base}/`;
}

export function apiUrl(path: string, apiBase = API_BASE): string {
  if (!path.startsWith("/")) throw new Error("API paths must be root-relative.");
  return `${apiBase.replace(/\/$/, "")}${path}`;
}

export function apiRequest(input: RequestInfo | URL, apiBase = API_BASE): RequestInfo | URL {
  if (typeof input === "string" && input.startsWith("/v1/")) return apiUrl(input, apiBase);
  return input;
}

export function appPath(search = "", base = import.meta.env.BASE_URL || "/"): string {
  const normalizedBase = normalizedAppBase(base);
  if (!search) return normalizedBase;
  if (!search.startsWith("?") && !search.startsWith("#")) {
    throw new Error("Application state must be represented as a query or fragment.");
  }
  return `${normalizedBase}${search}`;
}

export function extensionDestination(
  extensionUrl = configuredExtensionUrl,
  base = import.meta.env.BASE_URL || "/",
): string {
  return extensionUrl.trim() || appPath("#extension", base);
}

export function appPagePath(
  page: PublicAppPage,
  base = import.meta.env.BASE_URL || "/",
): string {
  const normalizedBase = normalizedAppBase(base);
  return page === "home" ? normalizedBase : `${normalizedBase}${page}`;
}

export function publicAppPageFromPath(
  pathname: string,
  base = import.meta.env.BASE_URL || "/",
): PublicAppPage {
  const basePath = normalizedAppBase(new URL(base, "https://porchcast.invalid").pathname);
  const normalizedPath = pathname.endsWith("/") && pathname !== "/"
    ? pathname.slice(0, -1)
    : pathname;
  const relative = normalizedPath.startsWith(basePath)
    ? normalizedPath.slice(basePath.length)
    : normalizedPath.replace(/^\//, "");
  if (relative === "pricing") return "pricing";
  if (relative === "privacy") return "privacy";
  return "home";
}

export function invitationUrl(
  guestInvitePath: string,
  origin = window.location.origin,
  base = import.meta.env.BASE_URL || "/",
): string {
  const invitation = new URL(guestInvitePath, origin);
  const target = new URL(appPath("", base), origin);
  target.search = invitation.search;
  target.hash = invitation.hash;
  return target.toString();
}

export function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return window.fetch(apiRequest(input), init);
}
