"use client";

import { useEffect, useState } from "react";
import SessionStartForm from "./SessionStartForm";
import WorkScreen from "./WorkScreen";
import SessionSummary from "./SessionSummary";
import { RunEntry, SessionInfo } from "@/lib/types";
import styles from "./FactoryApp.module.css";

type Stage = "setup" | "working" | "summary";

const STORAGE_KEY = "factory-tracker-session";

export default function FactoryApp() {
  const [stage, setStage] = useState<Stage>("setup");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [runs, setRuns] = useState<RunEntry[]>([]);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [sessionEndedAt, setSessionEndedAt] = useState<number | null>(null);

  // Restore an in-progress session if the page was refreshed.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.stage === "working" && saved.session) {
          setSession(saved.session);
          setRuns(saved.runs ?? []);
          setSessionStartedAt(saved.sessionStartedAt ?? null);
          setStage("working");
        }
      }
    } catch {
      // ignore corrupted storage
    }
  }, []);

  useEffect(() => {
    if (stage === "working" && session) {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ stage, session, runs, sessionStartedAt })
      );
    } else if (stage === "setup") {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [stage, session, runs, sessionStartedAt]);

  function handleStartSession(newSession: SessionInfo) {
    setSession(newSession);
    setRuns([]);
    setSessionStartedAt(Date.now());
    setStage("working");
  }

  function handleAddRun(run: RunEntry) {
    setRuns((prev) => [...prev, run]);
  }

  function handleEndSession() {
    setSessionEndedAt(Date.now());
    setStage("summary");
    localStorage.removeItem(STORAGE_KEY);
  }

  function handleNewSession() {
    setSession(null);
    setRuns([]);
    setSessionStartedAt(null);
    setSessionEndedAt(null);
    setStage("setup");
  }

  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>IND-E</span>
          <h1 className={styles.heading}>Work-Station Tracker</h1>
        </div>

        {stage === "setup" && <SessionStartForm onStart={handleStartSession} />}

        {stage === "working" && session && (
          <WorkScreen
            session={session}
            runs={runs}
            onAddRun={handleAddRun}
            onEndSession={handleEndSession}
          />
        )}

        {stage === "summary" && session && sessionStartedAt && sessionEndedAt && (
          <SessionSummary
            session={session}
            runs={runs}
            sessionStartedAt={sessionStartedAt}
            sessionEndedAt={sessionEndedAt}
            onNewSession={handleNewSession}
          />
        )}
      </div>
    </main>
  );
}
