export type WorkstationType = "normal" | "feeder" | "junction" | "quality" | "rework";

export interface Workstation {
  id: number;
  label: string;
  type: WorkstationType;
}

export type Shift = "1" | "2";
export type Team = "ODD" | "EVEN";

/** Information collected once, at the start of a work session. */
export interface SessionInfo {
  assemblerId: number;
  team: Team;
  workstationId: number;
  date: string;
  shift: Shift;
}

/** One completed start -> stop run, i.e. one row that gets written to the sheet. */
export interface RunEntry {
  id: string;
  date: string;
  shift: Shift;
  team: Team;
  workstationId: number;
  assemblerId: number;
  startTime: string;
  endTime: string;
  durationSeconds: number;
  productId: string;
  componentId: string;
  qualityReport: string;
  remarks: string;
}
