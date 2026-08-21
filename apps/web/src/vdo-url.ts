export const VDO_ORIGIN = "https://vdo.ninja";

export type ImportedVdoRoom = {
  role: "host" | "guest";
  roomName: string;
  vdoUrl: string;
};

export function parseVdoRoomUrl(input: string): ImportedVdoRoom {
  const value = input.trim();
  if (!value) throw new Error("Paste a VDO.Ninja room or director URL.");

  const withProtocol = value.startsWith("vdo.ninja/") ? `https://${value}` : value;
  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("That does not look like a valid URL.");
  }

  if (
    url.origin !== VDO_ORIGIN
    || url.username
    || url.password
  ) {
    throw new Error("Use an HTTPS link from vdo.ninja.");
  }

  const director = url.searchParams.get("director")?.trim();
  const room = url.searchParams.get("room")?.trim();
  if (!director && !room) {
    throw new Error("The link needs a room or director parameter.");
  }

  url.searchParams.set("hidehome", "");
  url.searchParams.set("hideheader", "");
  if (director) {
    url.searchParams.set("cleandirector", "");
    url.searchParams.set("hidesolo", "");
  }
  url.hash = "";

  return {
    role: director ? "host" : "guest",
    roomName: director ?? room ?? "Imported room",
    vdoUrl: url.toString(),
  };
}
