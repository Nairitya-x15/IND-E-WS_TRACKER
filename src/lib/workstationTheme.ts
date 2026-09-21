import { WorkstationType } from "./types";

export const workstationTypeMeta: Record<WorkstationType, { label: string; tag: string }> = {
  normal: { label: "Normal", tag: "STD" },
  feeder: { label: "Feeder", tag: "FEED" },
  junction: { label: "Junction", tag: "JCT" },
  quality: { label: "Quality check", tag: "QC" },
  rework: { label: "Rework", tag: "RWK" },
};
