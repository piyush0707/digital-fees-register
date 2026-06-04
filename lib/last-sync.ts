// Tracks the wall-clock time the local browser last successfully reached the
// database while signed in. Persisted to localStorage so the value survives a
// full reload (including the post-signout bounce back to /login) and is
// readable from the login screen's "Last sync: …" indicator.

const KEY = "dfr.lastSyncAt";

export function recordSync(at: number = Date.now()): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(at));
  } catch {
    // Private-mode / quota / disabled storage — silently skip; the
    // indicator just shows "never" until a future write succeeds.
  }
}

export function getLastSync(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

// Short human-friendly relative phrase, matching the mockup wording.
// Falls back to an absolute date once we cross 6 days, so it's always
// at most ~12 chars long.
export function formatRelativeSince(ms: number, now: number = Date.now()): string {
  const diff = Math.max(0, now - ms);
  const sec = Math.floor(diff / 1000);
  if (sec < 10) return "just now";
  if (sec < 60) return `${sec} sec ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 7) return `${day} days ago`;
  const d = new Date(ms);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
