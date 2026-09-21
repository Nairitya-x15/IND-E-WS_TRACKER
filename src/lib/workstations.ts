import workstationsData from "../../data/workstations.json";
import { Workstation, WorkstationType } from "./types";

const workstations = workstationsData as Workstation[];

export function getAllWorkstations(): Workstation[] {
  return workstations;
}

export function getWorkstationById(id: number): Workstation | undefined {
  return workstations.find((w) => w.id === id);
}

export function getWorkstationType(id: number): WorkstationType {
  return getWorkstationById(id)?.type ?? "normal";
}
