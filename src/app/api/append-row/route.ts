import { NextResponse } from "next/server";
import { appendRunRow } from "@/lib/sheets";
import { getWorkstationById } from "@/lib/workstations";
import { formatDuration } from "@/lib/time";
import { RunEntry, WorkstationType } from "@/lib/types";

/**
 * Each "ws{n}" tab has a DIFFERENT header layout depending on the
 * workstation type -- Product ID and/or Component ID sit right after
 * Assembler ID (before Start/End Time), there's no raw-seconds duration
 * column (just a computed TimeDiff), and Quality Check tabs have an extra
 * trailing "Quality Result" column. This builds the row to match each
 * layout exactly. See README.md for the header row each tab needs.
 *
 * The "Material Handler" and "Line Supervisor" tabs are different again: no
 * WS column, no start/end/TimeDiff, just a single submission Time.
 */
function buildRow(run: RunEntry, workstationType: WorkstationType): (string | number)[] {
  const assemblerId = `25B${run.assemblerId}`;
  const timeDiff = formatDuration(run.durationSeconds);
  const submittedTime = run.submittedTime ?? run.endTime;

  // Numeric stations stay numbers in the sheet (as before); "10A"/"10B" stay text.
  const ws: string | number = /^\d+$/.test(run.workstationId)
    ? Number(run.workstationId)
    : run.workstationId;
  const common = [run.date, run.shift, run.team, ws, assemblerId];

  switch (workstationType) {
    case "lineSupervisor":
      // Date | Shift | Team | Assembler ID | WIP | Between Workstation | Time | Remarks
      return [
        run.date,
        run.shift,
        run.team,
        assemblerId,
        run.wip ?? "",
        run.betweenWorkstation ?? "",
        submittedTime,
        run.remarks,
      ];

    case "materialHandler":
      // Date | Shift | Team | Assembler ID | Material | Amount | Provided to which workstation | Time | Remarks
      return [
        run.date,
        run.shift,
        run.team,
        assemblerId,
        run.material ?? "",
        run.amount ?? "",
        run.providedTo ? Number(run.providedTo) : "",
        submittedTime,
        run.remarks,
      ];

    case "feeder":
      // Date | Shift | Team | WS | Assembler ID | Component ID | Start Time | End Time | Remarks | TimeDiff
      return [...common, run.componentId, run.startTime, run.endTime, run.remarks, timeDiff];

    case "junction":
      // Date | Shift | Team | WS | Assembler ID | Product Number | Component ID | Start Time | End Time | Remarks | TimeDiff
      return [
        ...common,
        run.productId,
        run.componentId,
        run.startTime,
        run.endTime,
        run.remarks,
        timeDiff,
      ];

    case "quality":
      // Date | Shift | Team | WS | Assembler ID | Product Number | Start Time | End Time | Remarks | TimeDiff | Quality Result
      return [
        ...common,
        run.productId,
        run.startTime,
        run.endTime,
        run.remarks,
        timeDiff,
        run.qualityReport,
      ];

    case "normal":
    case "rework":
    default:
      // Date | Shift | Team | WS | Assembler ID | Product Number | Start Time | End Time | Remarks | TimeDiff
      return [...common, run.productId, run.startTime, run.endTime, run.remarks, timeDiff];
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { run: RunEntry };
    const { run } = body;

    if (!run || !run.workstationId) {
      return NextResponse.json({ error: "Invalid run payload" }, { status: 400 });
    }

    const workstation = getWorkstationById(run.workstationId);
    if (!workstation) {
      return NextResponse.json(
        { error: `Unknown workstation: ${run.workstationId}` },
        { status: 400 }
      );
    }

    // Basic server-side checks for the two form-only roles.
    if (workstation.type === "lineSupervisor" && (!run.wip?.trim() || !run.betweenWorkstation)) {
      return NextResponse.json(
        { error: "WIP and Between Workstation are required" },
        { status: 400 }
      );
    }
    if (
      workstation.type === "materialHandler" &&
      (!run.material?.trim() || !run.amount?.trim() || !run.providedTo)
    ) {
      return NextResponse.json(
        { error: "Material, amount and workstation are required" },
        { status: 400 }
      );
    }

    const row = buildRow(run, workstation.type);

    await appendRunRow(workstation.sheetName, row);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to append row:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
