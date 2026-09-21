"use client";

import { useEffect, useRef, useState } from "react";
import { getWorkstationType } from "@/lib/workstations";
import { formatDuration, getTimeString, roundToSecond } from "@/lib/time";
import { RunEntry, SessionInfo } from "@/lib/types";
import styles from "./WorkScreen.module.css";

interface Props {
  session: SessionInfo;
  runs: RunEntry[];
  onAddRun: (run: RunEntry) => void;
  onEndSession: () => void;
}

type RunStage = "idle" | "active";

export default function WorkScreen({ session, runs, onAddRun, onEndSession }: Props) {
  const workstationType = getWorkstationType(session.workstationId);

  // Feeder stations use component ID only; junction stations use both;
  // everything else (normal, quality, rework) uses product ID only.
  const needsProductId = workstationType !== "feeder";
  const needsComponentId = workstationType === "feeder" || workstationType === "junction";
  const needsQualityReport = workstationType === "quality";

  const [runStage, setRunStage] = useState<RunStage>("idle");
  const [productId, setProductId] = useState("");
  const [componentId, setComponentId] = useState("");
  const [qualityReport, setQualityReport] = useState("");
  const [remarks, setRemarks] = useState("");
  const [startTime, setStartTime] = useState<Date | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (runStage === "active" && startTime) {
      intervalRef.current = setInterval(() => {
        setElapsedSeconds(Math.floor((Date.now() - startTime.getTime()) / 1000));
      }, 1000);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [runStage, startTime]);

  const canStartRun =
    (!needsProductId || productId.trim() !== "") &&
    (!needsComponentId || componentId.trim() !== "");

  const canStopRun = !needsQualityReport || qualityReport !== "";

  function handleStartRun() {
    if (!canStartRun) return;
    // Round to the nearest second so the stored duration always matches
    // exactly what the displayed start/end times imply.
    setStartTime(roundToSecond(new Date()));
    setElapsedSeconds(0);
    setRunStage("active");
    setError("");
  }

  async function handleStopRun() {
    if (!startTime || !canStopRun) return;
    const endTime = roundToSecond(new Date());
    const durationSeconds = Math.round((endTime.getTime() - startTime.getTime()) / 1000);

    const run: RunEntry = {
      id: `${Date.now()}`,
      date: session.date,
      shift: session.shift,
      team: session.team,
      workstationId: session.workstationId,
      assemblerId: session.assemblerId,
      startTime: getTimeString(startTime),
      endTime: getTimeString(endTime),
      durationSeconds,
      productId: needsProductId ? productId : "",
      componentId: needsComponentId ? componentId : "",
      qualityReport: needsQualityReport ? qualityReport : "",
      remarks,
    };

    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/append-row", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save entry");
      }
      onAddRun(run);
      // Reset fields for the next run.
      setProductId("");
      setComponentId("");
      setQualityReport("");
      setRemarks("");
      setStartTime(null);
      setElapsedSeconds(0);
      setRunStage("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.sessionInfo}>
        <div className={styles.sessionInfoItem}>
          <span className={styles.sessionInfoLabel}>Date</span>
          <span className={styles.sessionInfoValue}>{session.date}</span>
        </div>
        <div className={styles.sessionInfoItem}>
          <span className={styles.sessionInfoLabel}>Shift</span>
          <span className={styles.sessionInfoValue}>{session.shift}</span>
        </div>
        <div className={styles.sessionInfoItem}>
          <span className={styles.sessionInfoLabel}>Team</span>
          <span className={styles.sessionInfoValue}>{session.team}</span>
        </div>
        <div className={styles.sessionInfoItem}>
          <span className={styles.sessionInfoLabel}>Station</span>
          <span className={styles.sessionInfoValue}>{session.workstationId}</span>
        </div>
        <div className={styles.sessionInfoItem}>
          <span className={styles.sessionInfoLabel}>Assembler</span>
          <span className={styles.sessionInfoValue}>{session.assemblerId}</span>
        </div>
      </div>

      <div className={styles.card}>
        {runStage === "idle" && (
          <>
            {needsProductId && (
              <div className={styles.field}>
                <label htmlFor="productId">Product ID</label>
                <input
                  id="productId"
                  type="text"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  placeholder="Enter product ID"
                />
              </div>
            )}
            {needsComponentId && (
              <div className={styles.field}>
                <label htmlFor="componentId">Component ID</label>
                <input
                  id="componentId"
                  type="text"
                  value={componentId}
                  onChange={(e) => setComponentId(e.target.value)}
                  placeholder="Enter component ID"
                />
              </div>
            )}
            <button className={styles.startButton} onClick={handleStartRun} disabled={!canStartRun}>
              Start
            </button>
          </>
        )}

        {runStage === "active" && (
          <>
            <div className={styles.timerRow}>
              <span className={styles.liveDot} aria-hidden="true" />
              <span className={styles.timerLabel}>Elapsed</span>
              <p className={styles.timer}>{formatDuration(elapsedSeconds)}</p>
            </div>

            {needsQualityReport && (
              <div className={styles.field}>
                <label htmlFor="qualityReport">Quality Report</label>
                <select
                  id="qualityReport"
                  value={qualityReport}
                  onChange={(e) => setQualityReport(e.target.value)}
                >
                  <option value="" disabled>
                    Select result
                  </option>
                  <option value="Major">Major</option>
                  <option value="Minor">Minor</option>
                  <option value="OK">OK</option>
                </select>
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="remarks">Remarks (optional)</label>
              <textarea
                id="remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={3}
              />
            </div>

            <button
              className={styles.stopButton}
              onClick={handleStopRun}
              disabled={!canStopRun || submitting}
            >
              {submitting ? "Saving..." : "Stop"}
            </button>
          </>
        )}

        {error && <p className={styles.error}>{error}</p>}
      </div>

      <div className={styles.footer}>
        <p>Completed runs this session: {runs.length}</p>
        <button className={styles.endButton} onClick={onEndSession} disabled={runStage === "active"}>
          End Session
        </button>
      </div>
    </div>
  );
}
