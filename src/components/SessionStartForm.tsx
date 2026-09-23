"use client";

import { useEffect, useMemo, useState } from "react";
import rollNumbers from "../../data/rollNumbers.json";
import { getAllWorkstations } from "@/lib/workstations";
import { getCurrentShift, getTodayDateString } from "@/lib/time";
import { SessionInfo, Shift, Team } from "@/lib/types";
import styles from "./SessionStartForm.module.css";

interface Props {
  onStart: (session: SessionInfo) => void;
}

export default function SessionStartForm({ onStart }: Props) {
  const workstations = useMemo(() => getAllWorkstations(), []);
  const [assemblerId, setAssemblerId] = useState<string>("");
  const [workstationId, setWorkstationId] = useState<string>("");
  const [shift, setShift] = useState<Shift>("1");
  const [date, setDate] = useState<string>("");

  useEffect(() => {
    setDate(getTodayDateString());
    setShift(getCurrentShift());
  }, []);

  const team: Team | null = assemblerId
    ? Number(assemblerId) % 2 === 0
      ? "EVEN"
      : "ODD"
    : null;

  const canStart = assemblerId !== "" && workstationId !== "";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canStart || !team) return;
    onStart({
      assemblerId: Number(assemblerId),
      team,
      workstationId,
      date,
      shift,
    });
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div className={styles.field}>
        <label htmlFor="assemblerId">Assembler ID (Roll No.)</label>
        <select
          id="assemblerId"
          value={assemblerId}
          onChange={(e) => setAssemblerId(e.target.value)}
          required
        >
          <option value="" disabled>
            Select roll number
          </option>
          {(rollNumbers as number[]).map((roll) => (
            <option key={roll} value={roll}>
              {roll}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label>Team</label>
        <input type="text" value={team ?? ""} readOnly placeholder="Auto-filled" />
      </div>

      <div className={styles.field}>
        <label htmlFor="workstation">Workstation / Role</label>
        <select
          id="workstation"
          value={workstationId}
          onChange={(e) => setWorkstationId(e.target.value)}
          required
        >
          <option value="" disabled>
            Select workstation or role
          </option>
          {workstations.map((ws) => (
            <option key={ws.id} value={ws.id}>
              {ws.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label>Date</label>
        <input type="text" value={date} readOnly />
      </div>

      <div className={styles.field}>
        <label htmlFor="shift">Shift</label>
        <p className={styles.hint}>
          Shift 1: 2:00 PM – 3:30 PM &nbsp;|&nbsp; Shift 2: 3:30 PM – 5:00 PM
        </p>
        <select id="shift" value={shift} onChange={(e) => setShift(e.target.value as Shift)}>
          <option value="1">1</option>
          <option value="2">2</option>
        </select>
      </div>

      <button type="submit" className={styles.startButton} disabled={!canStart}>
        Start Session
      </button>
    </form>
  );
}
