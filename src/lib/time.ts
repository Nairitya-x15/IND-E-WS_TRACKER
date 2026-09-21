import { Shift } from "./types";

/** Today's date as DD/MM/YYYY, using the browser's local clock. */
export function getTodayDateString(): string {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Shift 1: 2:00 PM - 3:30 PM
 * Shift 2: 3:30 PM - 5:00 PM
 * Outside these hours, falls back to whichever shift is nearer, so the
 * field always has a sensible default. It stays editable in the UI.
 */
export function getCurrentShift(): Shift {
  const d = new Date();
  const minutesNow = d.getHours() * 60 + d.getMinutes();
  const shift1Start = 14 * 60;
  const shift1End = 15 * 60 + 30;
  const shift2End = 17 * 60;

  if (minutesNow >= shift1Start && minutesNow < shift1End) return "1";
  if (minutesNow >= shift1End && minutesNow < shift2End) return "2";
  return minutesNow < shift1Start ? "1" : "2";
}

/**
 * Rounds a Date to the nearest whole second. Used so that the HH:MM:SS
 * shown to the user and the duration computed from start/end are always
 * derived from the exact same instants — otherwise two independently
 * truncated timestamps can visually differ by a second from the stored
 * duration (e.g. start .900s / end .050s looks like a 17s gap but only
 * ~16.15s actually elapsed).
 */
export function roundToSecond(date: Date): Date {
  return new Date(Math.round(date.getTime() / 1000) * 1000);
}

/** HH:MM:SS in local time. */
export function getTimeString(date: Date = new Date()): string {
  const h = String(date.getHours()).padStart(2, "0");
  const m = String(date.getMinutes()).padStart(2, "0");
  const s = String(date.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Formats a duration in seconds as HH:MM:SS. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(
    2,
    "0"
  )}`;
}
