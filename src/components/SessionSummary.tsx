"use client";

import { formatDuration } from "@/lib/time";
import { RunEntry, SessionInfo } from "@/lib/types";
import styles from "./SessionSummary.module.css";

interface Props {
  session: SessionInfo;
  runs: RunEntry[];
  sessionStartedAt: number;
  sessionEndedAt: number;
  onNewSession: () => void;
}

export default function SessionSummary({
  session,
  runs,
  sessionStartedAt,
  sessionEndedAt,
  onNewSession,
}: Props) {
  const totalWorkedSeconds = runs.reduce((sum, r) => sum + r.durationSeconds, 0);
  const sessionDurationSeconds = Math.max(1, Math.floor((sessionEndedAt - sessionStartedAt) / 1000));
  const idleSeconds = Math.max(0, sessionDurationSeconds - totalWorkedSeconds);
  const utilization = ((totalWorkedSeconds / sessionDurationSeconds) * 100).toFixed(1);

  return (
    <div className={styles.wrapper}>
      <h2 className={styles.heading}>Session Summary</h2>
      <p className={styles.subtitle}>
        Assembler {session.assemblerId} · WS {session.workstationId} · Shift {session.shift}
      </p>

      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Time Worked</span>
          <span className={styles.statValue}>{formatDuration(totalWorkedSeconds)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Idle Time</span>
          <span className={styles.statValue}>{formatDuration(idleSeconds)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Session Duration</span>
          <span className={styles.statValue}>{formatDuration(sessionDurationSeconds)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Utilization</span>
          <span className={styles.statValue}>{utilization}%</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Products Worked On</span>
          <span className={styles.statValue}>{runs.length}</span>
        </div>
      </div>

      {runs.length > 0 && (
        <div>
          <p className={styles.sectionTitle}>Run Details</p>
          <div className={styles.runsTableWrapper}>
          <table className={styles.runsTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>Start</th>
                <th>End</th>
                <th>Duration</th>
                <th>Product</th>
                <th>Component</th>
                <th>Quality</th>
                <th>Remarks</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r, i) => (
                <tr key={r.id}>
                  <td>{i + 1}</td>
                  <td>{r.startTime}</td>
                  <td>{r.endTime}</td>
                  <td>{formatDuration(r.durationSeconds)}</td>
                  <td>{r.productId || "-"}</td>
                  <td>{r.componentId || "-"}</td>
                  <td>{r.qualityReport || "-"}</td>
                  <td>{r.remarks || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      <button className={styles.newSessionButton} onClick={onNewSession}>
        Start New Session
      </button>
    </div>
  );
}
