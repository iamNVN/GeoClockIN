// Attendance is recorded with server time, so the app shows server time too:
// a phone with a wrong clock would otherwise display misleading times.
let offsetMs = 0;

export function syncWithServer(serverTimeIso) {
  const serverMs = Date.parse(serverTimeIso);
  if (Number.isFinite(serverMs)) offsetMs = serverMs - Date.now();
}

export const serverNow = () => new Date(Date.now() + offsetMs);
