export type WorkstationType =
  | "normal"
  | "feeder"
  | "junction"
  | "quality"
  | "rework"
  // Non-workstation roles: no start/stop timer, one form submission = one row.
  | "materialHandler"
  | "lineSupervisor";

export interface Workstation {
  /** Stable identifier, e.g. "5", "10A", "MH", "LS". Also what's written to the WS column. */
  id: string;
  label: string;
  type: WorkstationType;
  /** Exact name of the Google Sheet tab this workstation/role writes to. */
  sheetName: string;
}

export type Shift = "1" | "2";
export type Team = "ODD" | "EVEN";

/** Information collected once, at the start of a work session. */
export interface SessionInfo {
  assemblerId: number;
  team: Team;
  /** Workstation id ("1".."16", "10A", "10B") or role id ("MH", "LS"). */
  workstationId: string;
  date: string;
  shift: Shift;
}

/**
 * One row that gets written to the sheet.
 * - Workstations: one completed start -> stop run.
 * - Material Handler / Line Supervisor: one submitted entry (startTime and
 *   endTime both hold the submission time, durationSeconds is 0).
 */
export interface RunEntry {
  id: string;
  date: string;
  shift: Shift;
  team: Team;
  workstationId: string;
  assemblerId: number;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  productId: string;
  componentId: string;
  qualityReport: string;
  remarks: string;

  /** Line Supervisor only. */
  wip?: string;
  /** Line Supervisor only, e.g. "3-4". */
  betweenWorkstation?: string;
  /** Material Handler only. */
  material?: string;
  /** Material Handler only: how much of the material was handled/provided (free text, e.g. "50" or "5 kg"). */
  amount?: string;
  /** Material Handler only: which workstation the material was given to. */
  providedTo?: string;
  /** Material Handler / Line Supervisor: time of submission (HH:MM:SS). */
  submittedTime?: string;
}
