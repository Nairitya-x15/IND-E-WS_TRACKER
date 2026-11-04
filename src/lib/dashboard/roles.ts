export type Role = "normal" | "feeder" | "junction" | "quality" | "rework";

// Current setup, from data/workstations.json
export const ROLES: Record<string, Role> = {
  "1": "normal", "2": "normal", "3": "normal", "4": "normal",
  "5": "feeder", "6": "junction", "7": "junction", "8": "normal",
  "9": "feeder", "10A": "junction", "10B": "junction",
  "11": "feeder", "12": "feeder", "13": "junction",
  "14": "normal", "15": "quality", "16": "rework",
};

export const roleOf = (ws: string): Role => ROLES[ws] ?? "normal";

// Numbered stations that are part of the main product flow (rework is not)
export const isFlow = (ws: string) => /^\d/.test(ws) && roleOf(ws) !== "rework";

// The station whose products count as finished (Quality Check)
export const FINAL_STATION = "15";

// Stations whose job changed between Original and Current (feeders were
// introduced later), so their cycle times are not comparable across eras.
// Set to [] if they should be included in the comparison.
export const NOT_COMPARABLE: string[] = [];