export interface DashRun {
  era: string;
  date: string; // YYYY-MM-DD
  ws: string;
  shift: string;
  product: string;
  component: string;
  start: number; // seconds after midnight
  end: number;
  dur: number; // seconds
  remark: string;
  quality: string;
}

export interface DashPayload {
  runs: DashRun[];
  warnings: string[];
}