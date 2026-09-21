import { NextResponse } from "next/server";
import { appendRunRow } from "@/lib/sheets";
import { getWorkstationType } from "@/lib/workstations";
import { formatDuration } from "@/lib/time";
import { RunEntry } from "@/lib/types";

/**
 * Each "ws{n}" tab has a DIFFERENT header layout depending on the
 * workstation type -- Product ID and/or Component ID sit right after
 * Assembler ID (before Start/End Time), there's no raw-seconds duration
 * column (just a computed TimeDiff), and Quality Check tabs have an extra
 * trailing "Quality Result" column. This builds the row to match each
 * layout exactly. See README.md for the header row each tab needs.
 */
function buildRow(run: RunEntry): (string | number)[] {
  const workstationType = getWorkstationType(run.workstationId);
  const assemblerId = `25B${run.assemblerId}`;
  const timeDiff = formatDuration(run.durationSeconds);

  const common = [run.date, run.shift, run.team, run.workstationId, assemblerId];

  switch (workstationType) {
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

    const row = buildRow(run);

    await appendRunRow(run.workstationId, row);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to append row:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
