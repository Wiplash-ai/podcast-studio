export function roomRequestHeaders(
  roomToken: string,
  accountCsrfToken: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    ...extra,
    ...(roomToken ? { "X-Room-Token": roomToken } : {}),
    ...(accountCsrfToken ? { "X-Podcast-Studio-CSRF": accountCsrfToken } : {}),
  };
}

export function formatClock(epoch: string | null, now: number): string {
  if (!epoch) return "00:00:00";
  const seconds = Math.max(0, Math.floor((now - Date.parse(epoch)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return [hours, minutes, remainder]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

export function formatRecordingClock(
  epoch: string | null,
  stoppedAt: string | null,
  recording: boolean,
  now: number,
): string {
  const stoppedAtTime = !recording && stoppedAt ? Date.parse(stoppedAt) : Number.NaN;
  return formatClock(epoch, Number.isFinite(stoppedAtTime) ? stoppedAtTime : now);
}
