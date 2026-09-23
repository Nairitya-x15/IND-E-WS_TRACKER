import workstationsData from "../../data/workstations.json";
import { Workstation, WorkstationType } from "./types";

const workstations = workstationsData as Workstation[];

/**
 * Options for the Line Supervisor's "Between Workstation" field:
 * "1-2", "2-3", ... "15-16".
 */
export const BETWEEN_WORKSTATION_OPTIONS: string[] = Array.from(
  { length: 15 },
  (_, i) => `${i + 1}-${i + 2}`
);

/** Options for the Material Handler's "provided to which workstation" field: 1..16. */
export const PROVIDED_TO_WORKSTATION_OPTIONS: string[] = Array.from({ length: 16 }, (_, i) =>
  String(i + 1)
);

export function getAllWorkstations(): Workstation[] {
  return workstations;
}

// ids are strings ("10A"), but tolerate numbers (e.g. from an old saved session).
export function getWorkstationById(id: string | number): Workstation | undefined {
  return workstations.find((w) => w.id === String(id));
}

export function getWorkstationType(id: string | number): WorkstationType {
  return getWorkstationById(id)?.type ?? "normal";
}

/** Material Handler / Line Supervisor: submit-a-form roles with no stopwatch. */
export function isEntryRole(type: WorkstationType): boolean {
  return type === "materialHandler" || type === "lineSupervisor";
}

/** Short text for the "Station" chip: "10A" for a workstation, "Material Handler" for a role. */
export function getStationDisplayName(id: string | number): string {
  const ws = getWorkstationById(id);
  if (ws && isEntryRole(ws.type)) return ws.label;
  return String(id);
}
