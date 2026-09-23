"use client";

import { useState } from "react";
import {
  BETWEEN_WORKSTATION_OPTIONS,
  PROVIDED_TO_WORKSTATION_OPTIONS,
  getStationDisplayName,
  getWorkstationType,
} from "@/lib/workstations";
import { getTimeString, roundToSecond } from "@/lib/time";
import { RunEntry, SessionInfo } from "@/lib/types";
import styles from "./WorkScreen.module.css";

interface Props {
  session: SessionInfo;
  runs: RunEntry[];
  onAddRun: (run: RunEntry) => void;
  onEndSession: () => void;
}

/**
 * Entry screen for the two non-workstation roles:
 *  - Line Supervisor:  WIP (text) + Between Workstation (1-2 ... 15-16) + Remarks
 *  - Material Handler: Material (text) + Amount (text) + Provided-to workstation (1..16) + Remarks
 * There is no start/stop timer -- each Submit writes one row, with the Time
 * column set to the moment of submission.
 */
export default function RoleEntryScreen({ session, runs, onAddRun, onEndSession }: Props) {
  const isLineSupervisor = getWorkstationType(session.workstationId) === "lineSupervisor";

  const [wip, setWip] = useState("");
  const [betweenWorkstation, setBetweenWorkstation] = useState("");
  const [material, setMaterial] = useState("");
  const [amount, setAmount] = useState("");
  const [providedTo, setProvidedTo] = useState("");
  const [remarks, setRemarks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const canSubmit = isLineSupervisor
    ? wip.trim() !== "" && betweenWorkstation !== ""
    : material.trim() !== "" && amount.trim() !== "" && providedTo !== "";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;

    // Time of submission, taken at the moment the button is pressed.
    const submittedTime = getTimeString(roundToSecond(new Date()));

    const run: RunEntry = {
      id: `${Date.now()}`,
      date: session.date,
      shift: session.shift,
      team: session.team,
      workstationId: session.workstationId,
      assemblerId: session.assemblerId,
      startTime: submittedTime,
      endTime: submittedTime,
      durationSeconds: 0,
      productId: "",
      componentId: "",
      qualityReport: "",
      remarks,
      submittedTime,
      ...(isLineSupervisor
        ? { wip: wip.trim(), betweenWorkstation }
        : { material: material.trim(), amount: amount.trim(), providedTo }),
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
      // Reset for the next entry.
      setWip("");
      setBetweenWorkstation("");
      setMaterial("");
      setAmount("");
      setProvidedTo("");
      setRemarks("");
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
          <span className={styles.sessionInfoLabel}>Role</span>
          <span className={styles.sessionInfoValue}>
            {getStationDisplayName(session.workstationId)}
          </span>
        </div>
        <div className={styles.sessionInfoItem}>
          <span className={styles.sessionInfoLabel}>Assembler</span>
          <span className={styles.sessionInfoValue}>{session.assemblerId}</span>
        </div>
      </div>

      <form className={styles.card} onSubmit={handleSubmit}>
        {isLineSupervisor ? (
          <>
            <div className={styles.field}>
              <label htmlFor="wip">WIP</label>
              <input
                id="wip"
                type="text"
                value={wip}
                onChange={(e) => setWip(e.target.value)}
                placeholder="Enter WIP"
                autoComplete="off"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="betweenWorkstation">Between Workstation</label>
              <select
                id="betweenWorkstation"
                value={betweenWorkstation}
                onChange={(e) => setBetweenWorkstation(e.target.value)}
              >
                <option value="" disabled>
                  Select workstations
                </option>
                {BETWEEN_WORKSTATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </>
        ) : (
          <>
            <div className={styles.field}>
              <label htmlFor="material">Material Provided</label>
              <input
                id="material"
                type="text"
                value={material}
                onChange={(e) => setMaterial(e.target.value)}
                placeholder="Enter material"
                autoComplete="off"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="amount">Amount</label>
              <input
                id="amount"
                type="text"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Enter amount"
                autoComplete="off"
              />
            </div>
            <div className={styles.field}>
              <label htmlFor="providedTo">Provided to Which Workstation</label>
              <select
                id="providedTo"
                value={providedTo}
                onChange={(e) => setProvidedTo(e.target.value)}
              >
                <option value="" disabled>
                  Select workstation
                </option>
                {PROVIDED_TO_WORKSTATION_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          </>
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

        <button type="submit" className={styles.startButton} disabled={!canSubmit || submitting}>
          {submitting ? "Saving..." : "Submit"}
        </button>

        {error && <p className={styles.error}>{error}</p>}
      </form>

      <div className={styles.footer}>
        <p>Entries submitted this session: {runs.length}</p>
        <button
          type="button"
          className={styles.endButton}
          onClick={onEndSession}
          disabled={submitting}
        >
          End Session
        </button>
      </div>
    </div>
  );
}
