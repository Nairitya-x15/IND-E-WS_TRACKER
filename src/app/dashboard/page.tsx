"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DashPayload, DashRun } from "@/lib/dashboard/types";
import styles from "./dashboard.module.css";
import Insights from "./Insights";
import Output from "./Output";
import Quality from "./Quality";

const ERA_COLORS: Record<string, string> = { Original: "#706b60", Current: "#4f6d5c" };
const LINE_COLORS = ["#4f6d5c", "#a8503b", "#b8863b", "#5b7fa6", "#7a5ea8", "#706b60", "#3f8f8f", "#9a6b3b"];
const MUTED = "#706b60";

const med = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const fmt = (sec: number) => {
  const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return (h ? `${h}:${String(m).padStart(2, "0")}` : `${m}`) + `:${String(r).padStart(2, "0")}`;
};
const clock = (sec: number) => fmt(sec).padStart(7, "0").slice(-8);
const mins = (sec: number) => Math.round(sec / 6) / 10;
const showDate = (iso: string) => iso.split("-").reverse().join("/");
const byNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
// Compare IDs ignoring case, spaces, hyphens and leading zeros: B-027 = B027, E001 = E1
const idKey = (s: string) => {
  const t = s.toUpperCase().replace(/[\s-]/g, "");
  const m = t.match(/^([A-Z]*)0*(\d+)$/);
  return m ? m[1] + m[2] : t;
};

function EraDot(props: { cx?: number; cy?: number; payload?: { era: string } }) {
  if (props.cx == null || props.cy == null) return null;
  return <circle cx={props.cx} cy={props.cy} r={4} fill={ERA_COLORS[props.payload?.era ?? ""] ?? MUTED} />;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashPayload | null>(null);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [era, setEra] = useState("");
  const [ws, setWs] = useState("");
  const [day, setDay] = useState("");
  const [q, setQ] = useState("");
  const [mode, setMode] = useState<"time" | "output">("time");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    try {
      const res = await fetch("/api/dashboard");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to load data");
      setData(j);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const v = useMemo(() => {
    const all: DashRun[] = data?.runs ?? [];
    const eras = [...new Set(all.map((r) => r.era))];
    const wsList = [...new Set(all.map((r) => r.ws))].sort(byNum);
    const rows = all.filter((r) => (!era || r.era === era) && (!ws || r.ws === ws));
    const durs = rows.map((r) => r.dur);

    const wsMed: Record<string, number> = {};
    [...new Set(rows.map((r) => r.ws))].forEach((w) => (wsMed[w] = med(rows.filter((r) => r.ws === w).map((r) => r.dur))));

    // sessions = one workstation, one day, one shift
    const groups = new Map<string, DashRun[]>();
    rows.forEach((r) => {
      const k = [r.era, r.date, r.ws, r.shift].join("|");
      const g = groups.get(k) ?? [];
      g.push(r);
      groups.set(k, g);
    });
    const sessions = [...groups.values()]
      .map((g) => {
        g.sort((a, b) => a.start - b.start);
        const busy = g.reduce((x, y) => x + y.dur, 0);
        const span = g[g.length - 1].end - g[0].start;
        let gap = 0;
        for (let i = 1; i < g.length; i++) gap = Math.max(gap, g[i].start - g[i - 1].end);
        return { era: g[0].era, date: g[0].date, ws: g[0].ws, shift: g[0].shift, n: g.length, busy, span, gap, util: span > 0 ? busy / span : null };
      })
      .sort((a, b) => b.date.localeCompare(a.date) || byNum(a.ws, b.ws));

    const byWs = Object.keys(wsMed).sort(byNum).map((w) => ({
      ws: w, median: mins(wsMed[w]), runs: rows.filter((r) => r.ws === w).length,
    }));

    const dayMap = new Map<string, DashRun[]>();
    rows.forEach((r) => dayMap.set(r.date, [...(dayMap.get(r.date) ?? []), r]));
    const daily = [...dayMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, g]) => ({
      date: showDate(d), era: g[0].era, median: mins(med(g.map((r) => r.dur))), runs: g.length,
    }));

    const dates = [...dayMap.keys()].sort().reverse();
    const dayEff = day && dayMap.has(day) ? day : dates[0] ?? "";
    const dayRows = rows.filter((r) => r.date === dayEff);
    const dayWs = [...new Set(dayRows.map((r) => r.ws))].sort(byNum);
    const perWs = dayWs.map((w) => dayRows.filter((r) => r.ws === w).sort((a, b) => a.start - b.start));
    const maxN = Math.max(0, ...perWs.map((g) => g.length));
    const dayLines = Array.from({ length: maxN }, (_, i) => {
      const o: Record<string, number> = { n: i + 1 };
      dayWs.forEach((w, j) => { if (perWs[j][i]) o[`WS ${w}`] = mins(perWs[j][i].dur); });
      return o;
    });

    const flagged = rows
      .filter((r) => r.dur < 30 || r.dur > 2 * wsMed[r.ws] || r.remark)
      .sort((a, b) => b.date.localeCompare(a.date) || a.start - b.start);

    const key = q.trim().toUpperCase();
    const qk = idKey(key);
    const trail = key
      ? all
          .filter((r) => idKey(r.product) === qk || idKey(r.component) === qk)
          .sort((a, b) => a.date.localeCompare(b.date) || a.start - b.start)
      : [];
      
    const utils = sessions.filter((s) => s.util != null).map((s) => s.util as number);
    return { eras, wsList, rows, durs, wsMed, sessions, byWs, daily, dates, dayEff, dayLines, dayWs, flagged, trail, key, utils };
  }, [data, era, ws, day, q]);

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <div>
          <h1>Station dashboard</h1>
          <p className={styles.sub}>{loading ? "Loading..." : `${v.rows.length} runs shown`}</p>
        </div>
        <div className={styles.filters}>
          <div className={styles.modes} role="group" aria-label="Analysis mode">
            <button className={`${styles.modeBtn} ${mode === "time" ? styles.modeOn : ""}`} onClick={() => setMode("time")}>
              Time analysis
            </button>
            <button className={`${styles.modeBtn} ${mode === "output" ? styles.modeOn : ""}`} onClick={() => { setMode("output"); setWs(""); }}>
              Output analysis
            </button>
          </div>
          <select value={era} onChange={(e) => setEra(e.target.value)} aria-label="Era">
            <option value="">All eras</option>
            {v.eras.map((x) => <option key={x}>{x}</option>)}
          </select>
          {mode === "time" && (
            <select value={ws} onChange={(e) => setWs(e.target.value)} aria-label="Workstation">
              <option value="">All workstations</option>
              {v.wsList.map((x) => <option key={x} value={x}>{/^\d/.test(x) ? `WS ${x}` : x}</option>)}
            </select>
          )}
          <button className={styles.btn} onClick={load} disabled={loading}>Refresh</button>
        </div>
      </div>

      {err && <p className={styles.error}>{err}</p>}
      {data?.warnings.map((w, i) => <p key={i} className={styles.warn}>{w}</p>)}

      {mode === "output" && <Output all={data?.runs ?? []} era={era} />}
      {mode === "output" && <Quality all={data?.runs ?? []} era={era} />}
      {mode === "time" && !loading && !err && v.rows.length === 0 && <p className={styles.sub}>No runs match these filters.</p>}

      {mode === "time" && v.rows.length > 0 && (
        <>
          <div className={styles.kpis}>
            {[
              ["Runs logged", v.rows.length],
              ["Median cycle time", fmt(med(v.durs))],
              ["Mean cycle time", fmt(mean(v.durs))],
              ["Average utilization", v.utils.length ? `${Math.round(mean(v.utils) * 100)}%` : "n/a"],
              ["Runs to review", v.flagged.length],
            ].map(([label, val]) => (
              <div key={label as string} className={styles.kpi}><b>{val}</b><span>{label}</span></div>
            ))}
          </div>

          <div className={styles.grid}>
            <section className={styles.card}>
              <h2>Median cycle time by workstation</h2>
              <p className={styles.sub}>The slowest station limits the line.</p>
              <div className={styles.chart}>
                <ResponsiveContainer>
                  <BarChart data={v.byWs}>
                    <CartesianGrid stroke="#d9d4c8" vertical={false} />
                    <XAxis dataKey="ws" tick={{ fill: MUTED, fontSize: 12 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 12 }} unit=" m" />
                    <Tooltip formatter={(val) => `${val} min`} labelFormatter={(l) => `WS ${l}`} />
                    <Bar dataKey="median" name="Median" fill="#4f6d5c" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className={styles.card}>
              <h2>Median cycle time per day</h2>
              <p className={styles.sub}>
                Dot colour shows the era: {Object.keys(ERA_COLORS).map((k) => k).join(", ")}.
              </p>
              <div className={styles.chart}>
                <ResponsiveContainer>
                  <LineChart data={v.daily}>
                    <CartesianGrid stroke="#d9d4c8" vertical={false} />
                    <XAxis dataKey="date" tick={{ fill: MUTED, fontSize: 11 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 12 }} unit=" m" />
                    <Tooltip formatter={(val) => `${val} min`} />
                    <Line type="monotone" dataKey="median" name="Median" stroke="#706b60" strokeWidth={1.5} dot={<EraDot />} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className={`${styles.card} ${styles.wide}`}>
              <div className={styles.cardHead}>
                <div>
                  <h2>Runs within a day</h2>
                  <p className={styles.sub}>Each line is one workstation, in the order runs were done.</p>
                </div>
                <select value={v.dayEff} onChange={(e) => setDay(e.target.value)} aria-label="Day">
                  {v.dates.map((d) => <option key={d} value={d}>{showDate(d)}</option>)}
                </select>
              </div>
              <div className={styles.chart}>
                <ResponsiveContainer>
                  <LineChart data={v.dayLines}>
                    <CartesianGrid stroke="#d9d4c8" vertical={false} />
                    <XAxis dataKey="n" tick={{ fill: MUTED, fontSize: 12 }} label={{ value: "Run number", position: "insideBottom", offset: -2, fill: MUTED, fontSize: 12 }} />
                    <YAxis tick={{ fill: MUTED, fontSize: 12 }} unit=" m" />
                    <Tooltip formatter={(val) => `${val} min`} />
                    <Legend />
                    {v.dayWs.map((w, i) => (
                      <Line key={w} type="monotone" dataKey={`WS ${w}`} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </section>
            
            <Insights all={data?.runs ?? []} era={era} ws={ws} />
            
            <section className={`${styles.card} ${styles.wide}`}>
              <h2>Sessions</h2>
              <p className={styles.sub}>One workstation on one day and shift. Utilization is busy time divided by first start to last end.</p>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Date</th><th>Era</th><th>WS</th><th>Shift</th><th className={styles.r}>Runs</th><th className={styles.r}>Busy</th><th className={styles.r}>Idle</th><th className={styles.r}>Longest gap</th><th className={styles.r}>Utilization</th></tr></thead>
                  <tbody>
                    {v.sessions.slice(0, 200).map((s, i) => {
                      const u = s.util == null ? null : Math.round(s.util * 100);
                      return (
                        <tr key={i}>
                          <td>{showDate(s.date)}</td><td>{s.era}</td><td>{s.ws}</td><td>{s.shift}</td>
                          <td className={styles.r}>{s.n}</td><td className={styles.r}>{fmt(s.busy)}</td>
                          <td className={styles.r}>{fmt(Math.max(0, s.span - s.busy))}</td><td className={styles.r}>{fmt(s.gap)}</td>
                          <td className={styles.r}>{u == null ? "n/a" : <span className={u >= 85 ? styles.good : u >= 65 ? styles.mid : styles.bad}>{u}%</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section className={`${styles.card} ${styles.wide}`}>
              <h2>Follow a product or component</h2>
              <p className={styles.sub}>Enter an ID such as P45 to see every station it passed through, across all eras.</p>
              <input className={styles.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product or component ID" aria-label="Product or component ID" />
              {v.key && v.trail.length === 0 && <p className={styles.sub}>No runs found for {v.key}.</p>}
              {v.trail.length > 0 && (
                <div className={styles.tableWrap}>
                  <table>
                    <thead><tr><th>Date</th><th>WS</th><th>Product</th><th>Component</th><th>Start</th><th>End</th><th className={styles.r}>Cycle time</th><th className={styles.r}>Wait since previous</th></tr></thead>
                    <tbody>
                      {v.trail.map((r, i) => {
                        const p = v.trail[i - 1];
                        const wait = p && p.date === r.date ? fmt(Math.max(0, r.start - p.end)) : "";
                        return (
                          <tr key={i}>
                            <td>{showDate(r.date)}</td><td>{r.ws}</td><td>{r.product}</td><td>{r.component}</td>
                            <td>{clock(r.start)}</td><td>{clock(r.end)}</td><td className={styles.r}>{fmt(r.dur)}</td><td className={styles.r}>{wait}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className={`${styles.card} ${styles.wide}`}>
              <h2>Runs to review</h2>
              <p className={styles.sub}>Under 30 seconds, over twice the station median, or with a remark.</p>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Date</th><th>WS</th><th>Product</th><th>Component</th><th className={styles.r}>Cycle time</th><th>Flag</th><th>Remark</th></tr></thead>
                  <tbody>
                    {v.flagged.slice(0, 150).map((r, i) => (
                      <tr key={i}>
                        <td>{showDate(r.date)}</td><td>{r.ws}</td><td>{r.product}</td><td>{r.component}</td>
                        <td className={styles.r}>{fmt(r.dur)}</td>
                        <td>{r.dur < 30 ? "Very short" : r.dur > 2 * v.wsMed[r.ws] ? "Very long" : "Remark"}</td>
                        <td className={styles.wrap}>{r.remark}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}