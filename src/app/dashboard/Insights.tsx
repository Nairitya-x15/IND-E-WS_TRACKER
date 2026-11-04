"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DashRun } from "@/lib/dashboard/types";
import styles from "./dashboard.module.css";
import { isFlow, NOT_COMPARABLE } from "@/lib/dashboard/roles";

// Eras recorded BEFORE the efficiency changes. Every other era counts as "after".
const BEFORE_ERAS = ["Original"];
const ORDER_ERA = ["Original", "Current"];
const ORDER_CHANGE = ["Before changes", "After changes"];
const COLORS: Record<string, string> = {
  Original: "#706b60", Current: "#4f6d5c",
  "Before changes": "#706b60", "After changes": "#4f6d5c",
};
const MUTED = "#706b60";
const MIN_RUNS = 3; // minimum runs before a station is included in a statistic

type Mode = "era" | "change";

const med = (a: number[]) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a: number[]) => {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
};
const pct = (a: number[], p: number) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
};
const mins = (sec: number) => Math.round(sec / 6) / 10; // seconds -> minutes, 1 decimal
const r1 = (x: number) => Math.round(x * 10) / 10;
const fmt = (sec: number) => {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const showDate = (iso: string) => iso.split("-").reverse().join("/");
const byNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const isLine = (w: string) => /^\d/.test(w); // excludes the Rework tab
const idKey = (s: string) => {
  const t = s.toUpperCase().replace(/[\s-]/g, "");
  const m = t.match(/^([A-Z]*)0*(\d+)$/);
  return m ? m[1] + m[2] : t;
};
const stationMed = (rs: DashRun[]) => {
  const m = new Map<string, number[]>();
  rs.forEach((r) => m.set(r.ws, [...(m.get(r.ws) ?? []), r.dur]));
  return [...m.entries()]
    .filter(([, d]) => d.length >= MIN_RUNS)
    .map(([ws, d]) => ({ ws, med: med(d), n: d.length }));
};

export default function Insights({ all, era, ws }: { all: DashRun[]; era: string; ws: string }) {
  const mode = "change" as Mode;
  const [focus, setFocus] = useState("");

  const x = useMemo(() => {
    const groupOf = (r: DashRun) =>
      mode === "era" ? r.era : BEFORE_ERAS.includes(r.era) ? "Before changes" : "After changes";
    const eraList = [...new Set(all.map((r) => r.era))].sort((a, b) => {
      const i = ORDER_ERA.indexOf(a), j = ORDER_ERA.indexOf(b);
      return (i < 0 ? 9 : i) - (j < 0 ? 9 : j);
    });
    const groups = mode === "era" ? eraList : ORDER_CHANGE.filter((g) => all.some((r) => groupOf(r) === g));
    const eraRows = all.filter((r) => !era || r.era === era);
    const rows = eraRows.filter((r) => !ws || r.ws === ws);
    const lineAll = all.filter((r) => isFlow(r.ws) && !NOT_COMPARABLE.includes(r.ws));

    // 1. Group comparison by station + 3. line balance
    const stations = [...new Set(lineAll.map((r) => r.ws))].sort(byNum);
    const perGroup = groups.map((g) => ({ g, st: stationMed(lineAll.filter((r) => groupOf(r) === g)) }));
    const compare = stations.map((w) => {
      const o: Record<string, string | number> = { ws: w };
      perGroup.forEach(({ g, st }) => {
        const s = st.find((z) => z.ws === w);
        if (s) o[g] = mins(s.med);
      });
      return o;
    });
    const balance = perGroup
      .filter((p) => p.st.length >= 2)
      .map(({ g, st }) => {
        const mx = Math.max(...st.map((s) => s.med));
        return {
          g, n: st.length, max: mx,
          eff: st.reduce((a, s) => a + s.med, 0) / (st.length * mx),
          bottleneck: st.find((s) => s.med === mx)!.ws,
        };
      });

    // 2. Variability
    const vm = new Map<string, number[]>();
    rows.forEach((r) => vm.set(r.ws, [...(vm.get(r.ws) ?? []), r.dur]));
    const variab = [...vm.entries()]
      .filter(([, d]) => d.length >= MIN_RUNS)
      .sort(([a], [b]) => byNum(a, b))
      .map(([w, d]) => {
        const m = med(d), p = pct(d, 90);
        return { ws: w, n: d.length, median: mins(m), p90: mins(p), sd: mins(sd(d)), spread: m ? Math.round((p / m) * 100) / 100 : 0 };
      });

    // 4. Throughput (runs per hour, per station session)
    const sm = new Map<string, DashRun[]>();
    rows.forEach((r) => {
      const k = [r.era, r.date, r.ws, r.shift].join("|");
      sm.set(k, [...(sm.get(k) ?? []), r]);
    });
    const sess = [...sm.values()]
      .map((g) => {
        const s = Math.min(...g.map((r) => r.start)), e = Math.max(...g.map((r) => r.end));
        return { ws: g[0].ws, date: g[0].date, n: g.length, span: e - s, rph: g.length / ((e - s) / 3600) };
      })
      .filter((s) => s.n >= MIN_RUNS && s.span >= 300);
    const avgBy = (key: "ws" | "date") => {
      const m = new Map<string, number[]>();
      sess.forEach((s) => m.set(s[key], [...(m.get(s[key]) ?? []), s.rph]));
      return [...m.entries()];
    };
    const thrByWs = avgBy("ws").sort(([a], [b]) => byNum(a, b)).map(([w, d]) => ({ ws: w, rph: r1(mean(d)) }));
    const thrByDay = avgBy("date").sort(([a], [b]) => a.localeCompare(b)).map(([d, v]) => ({ date: showDate(d), rph: r1(mean(v)) }));

    // 5. Waiting between stations + lead time per product
    const chains = new Map<string, DashRun[]>();
      eraRows.filter((r) => isFlow(r.ws) && r.product).forEach((r) => {
      const k = [r.era, r.date, idKey(r.product)].join("|");
      chains.set(k, [...(chains.get(k) ?? []), r]);
    });
    const trans = new Map<string, number[]>();
    let leadSum = 0, waitSum = 0, nCh = 0;
    chains.forEach((c) => {
      c.sort((a, b) => a.start - b.start);
      if (new Set(c.map((r) => r.ws)).size < 2) return;
      let wait = 0;
      for (let i = 1; i < c.length; i++) {
        const p = c[i - 1], q = c[i];
        if (p.ws === q.ws) continue;
        const gap = q.start - p.end;
        if (gap < 0) continue;
        wait += gap;
        const k = `${p.ws}|${q.ws}`;
        trans.set(k, [...(trans.get(k) ?? []), gap]);
      }
      leadSum += Math.max(...c.map((r) => r.end)) - c[0].start;
      waitSum += wait;
      nCh++;
    });
    const waits = [...trans.entries()]
      .filter(([, g]) => g.length >= 2)
      .map(([k, g]) => {
        const [a, b] = k.split("|");
        return { a, b, label: `WS${a} → WS${b} (n=${g.length})`, avg: mins(mean(g)) };
      })
      .filter((t) => !ws || t.a === ws || t.b === ws)
      .sort((p, q) => q.avg - p.avg)
      .slice(0, 12);
    const waitStats = nCh ? { n: nCh, lead: leadSum / nCh, wait: waitSum / nCh, share: leadSum ? waitSum / leadSum : 0 } : null;

    // station focus (6 and 7)
    const stationsAll = [...new Set(all.map((r) => r.ws))].sort(byNum);
    const es = stationMed(eraRows.filter((r) => isFlow(r.ws)));
    const bottleneck = es.length ? es.reduce((a, b) => (b.med > a.med ? b : a)).ws : stationsAll[0] ?? "";
    const focusEff = focus && stationsAll.includes(focus) ? focus : bottleneck;

    // 6. Histogram
    const fd = eraRows.filter((r) => r.ws === focusEff).map((r) => r.dur);
    let hist: { bin: string; runs: number }[] = [];
    if (fd.length >= MIN_RUNS) {
      const p95 = pct(fd, 95);
      const width = Math.max(10, Math.ceil(p95 / 12 / 5) * 5);
      const nb = Math.ceil(p95 / width) + 1;
      const counts = Array.from({ length: nb }, () => 0);
      fd.forEach((d) => { counts[Math.min(Math.floor(d / width), nb - 1)]++; });
      hist = counts.map((c, i) => ({ bin: fmt(i * width) + (i === nb - 1 ? "+" : ""), runs: c }));
    }

    // 7. Learning: median cycle time of the 1st, 2nd, 3rd... run of a session
    const ssm = new Map<string, DashRun[]>();
    all.filter((r) => r.ws === focusEff).forEach((r) => {
      const k = [r.era, r.date, r.shift].join("|");
      ssm.set(k, [...(ssm.get(k) ?? []), r]);
    });
    const byG = new Map<string, number[][]>();
    ssm.forEach((g) => {
      g.sort((a, b) => a.start - b.start);
      const key = groupOf(g[0]);
      const arr = byG.get(key) ?? [];
      g.slice(0, 15).forEach((r, i) => {
        if (!arr[i]) arr[i] = [];
        arr[i].push(r.dur);
      });
      byG.set(key, arr);
    });
    const learning = Array.from({ length: 15 }, (_, i) => {
      const o: Record<string, number> = { n: i + 1 };
      groups.forEach((g) => {
        const d = byG.get(g)?.[i];
        if (d && d.length >= 2) o[g] = mins(med(d));
      });
      return o;
    });

    return { groups, compare, balance, variab, thrByWs, thrByDay, waits, waitStats, stationsAll, focusEff, hist, learning };
  }, [all, era, ws, mode, focus]);

  const col = (g: string) => COLORS[g] ?? MUTED;
  const tick = { fill: MUTED, fontSize: 12 };
  const noData = <p className={styles.sub}>Not enough data for this selection yet.</p>;
  const focusSelect = (
    <select value={x.focusEff} onChange={(e) => setFocus(e.target.value)} aria-label="Station">
      {x.stationsAll.map((w) => <option key={w} value={w}>{isLine(w) ? `WS ${w}` : w}</option>)}
    </select>
  );

  return (
    <>
      <section className={`${styles.card} ${styles.wide}`}>
        <div className={styles.cardHead}>
          <div>
            <h2>Before and after the efficiency changes</h2>
            <p className={styles.sub}>
              Median cycle time per station, Original vs Current (after the efficiency changes). Rework (WS 16) is left out{NOT_COMPARABLE.length ? `, and so are stations ${NOT_COMPARABLE.join(", ")}, whose job changed between eras` : ""}. Stations need {MIN_RUNS}+ runs in a group to appear.
            </p>
          </div>
        </div>
        <div className={styles.chart}>
          {x.compare.length ? (
            <ResponsiveContainer>
              <BarChart data={x.compare}>
                <CartesianGrid stroke="#d9d4c8" vertical={false} />
                <XAxis dataKey="ws" tick={tick} />
                <YAxis tick={tick} unit=" m" />
                <Tooltip formatter={(v) => `${v} min`} labelFormatter={(l) => `WS ${l}`} />
                <Legend />
                {x.groups.map((g) => <Bar key={g} dataKey={g} name={g} fill={col(g)} radius={[3, 3, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          ) : noData}
        </div>
      </section>

      <section className={`${styles.card} ${styles.wide}`}>
        <h2>Line balance efficiency</h2>
        <p className={styles.sub}>
          Sum of station medians divided by (stations × slowest station median). 100% means every station is as slow as the bottleneck, so none waits for it. A lower number means more stations are idle waiting on the bottleneck.
        </p>
        {x.balance.length ? (
          <div className={styles.kpis} style={{ marginTop: 10 }}>
            {x.balance.map((b) => (
              <div key={b.g} className={styles.kpi}>
                <b>{Math.round(b.eff * 100)}%</b>
                <span>{b.g}: {b.n} stations, bottleneck WS {b.bottleneck} ({fmt(b.max)})</span>
              </div>
            ))}
          </div>
        ) : noData}
      </section>

      <section className={`${styles.card} ${styles.wide}`}>
        <h2>Variability per station</h2>
        <p className={styles.sub}>Median vs the 90th percentile (9 in 10 runs finish within this time). Spread is p90 ÷ median; high values mean unpredictable stations.</p>
        <div className={styles.chart}>
          {x.variab.length ? (
            <ResponsiveContainer>
              <BarChart data={x.variab}>
                <CartesianGrid stroke="#d9d4c8" vertical={false} />
                <XAxis dataKey="ws" tick={tick} />
                <YAxis tick={tick} unit=" m" />
                <Tooltip formatter={(v) => `${v} min`} labelFormatter={(l) => `WS ${l}`} />
                <Legend />
                <Bar dataKey="median" name="Median" fill="#4f6d5c" radius={[3, 3, 0, 0]} />
                <Bar dataKey="p90" name="90th percentile" fill="#a8503b" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData}
        </div>
        {x.variab.length > 0 && (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>WS</th><th className={styles.r}>Runs</th><th className={styles.r}>Median (min)</th><th className={styles.r}>P90 (min)</th><th className={styles.r}>Std dev (min)</th><th className={styles.r}>Spread</th></tr></thead>
              <tbody>
                {x.variab.map((s) => (
                  <tr key={s.ws}><td>{s.ws}</td><td className={styles.r}>{s.n}</td><td className={styles.r}>{s.median}</td><td className={styles.r}>{s.p90}</td><td className={styles.r}>{s.sd}</td><td className={styles.r}>{s.spread}×</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <h2>Throughput by station</h2>
        <p className={styles.sub}>Average runs per hour in a session (first start to last end).</p>
        <div className={styles.chart}>
          {x.thrByWs.length ? (
            <ResponsiveContainer>
              <BarChart data={x.thrByWs}>
                <CartesianGrid stroke="#d9d4c8" vertical={false} />
                <XAxis dataKey="ws" tick={tick} />
                <YAxis tick={tick} />
                <Tooltip formatter={(v) => `${v} runs/hour`} labelFormatter={(l) => `WS ${l}`} />
                <Bar dataKey="rph" name="Runs per hour" fill="#5b7fa6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData}
        </div>
      </section>

      <section className={styles.card}>
        <h2>Throughput by day</h2>
        <p className={styles.sub}>Average runs per hour across all stations in the selection.</p>
        <div className={styles.chart}>
          {x.thrByDay.length ? (
            <ResponsiveContainer>
              <LineChart data={x.thrByDay}>
                <CartesianGrid stroke="#d9d4c8" vertical={false} />
                <XAxis dataKey="date" tick={{ ...tick, fontSize: 11 }} />
                <YAxis tick={tick} />
                <Tooltip formatter={(v) => `${v} runs/hour`} />
                <Line type="monotone" dataKey="rph" name="Runs per hour" stroke="#5b7fa6" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : noData}
        </div>
      </section>

      <section className={`${styles.card} ${styles.wide}`}>
        <h2>Waiting between stations</h2>
        <p className={styles.sub}>
          Gap between a product finishing at one station and starting at the next, matched by Product ID on the same day. Only stations that record a Product ID are included (feeders and the Rework tab are not).
        </p>
        {x.waitStats ? (
          <div className={styles.kpis} style={{ marginTop: 10 }}>
            <div className={styles.kpi}><b>{x.waitStats.n}</b><span>Products traced across 2+ stations</span></div>
            <div className={styles.kpi}><b>{fmt(x.waitStats.lead)}</b><span>Average lead time (first start to last end)</span></div>
            <div className={styles.kpi}><b>{fmt(x.waitStats.wait)}</b><span>Average time spent waiting</span></div>
            <div className={styles.kpi}><b>{Math.round(x.waitStats.share * 100)}%</b><span>Of lead time is waiting</span></div>
          </div>
        ) : noData}
        {x.waits.length > 0 && (
          <div className={styles.chart} style={{ height: 340 }}>
            <ResponsiveContainer>
              <BarChart data={x.waits} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid stroke="#d9d4c8" horizontal={false} />
                <XAxis type="number" tick={tick} unit=" m" />
                <YAxis type="category" dataKey="label" tick={{ ...tick, fontSize: 11 }} width={140} />
                <Tooltip formatter={(v) => `${v} min`} />
                <Bar dataKey="avg" name="Average wait" fill="#b8863b" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <h2>Cycle time distribution</h2>
            <p className={styles.sub}>Number of runs per cycle-time range (m:ss).</p>
          </div>
          {focusSelect}
        </div>
        <div className={styles.chart}>
          {x.hist.length ? (
            <ResponsiveContainer>
              <BarChart data={x.hist}>
                <CartesianGrid stroke="#d9d4c8" vertical={false} />
                <XAxis dataKey="bin" tick={{ ...tick, fontSize: 11 }} />
                <YAxis tick={tick} allowDecimals={false} />
                <Tooltip formatter={(v) => `${v} runs`} labelFormatter={(l) => `From ${l}`} />
                <Bar dataKey="runs" name="Runs" fill="#4f6d5c" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : noData}
        </div>
      </section>

      <section className={styles.card}>
        <div className={styles.cardHead}>
          <div>
            <h2>Warm-up within a session</h2>
            <p className={styles.sub}>Median time of the 1st, 2nd, 3rd... run of a session at this station.</p>
          </div>
          {focusSelect}
        </div>
        <div className={styles.chart}>
          <ResponsiveContainer>
            <LineChart data={x.learning}>
              <CartesianGrid stroke="#d9d4c8" vertical={false} />
              <XAxis dataKey="n" tick={tick} label={{ value: "Run number in session", position: "insideBottom", offset: -2, fill: MUTED, fontSize: 12 }} />
              <YAxis tick={tick} unit=" m" />
              <Tooltip formatter={(v) => `${v} min`} />
              <Legend />
              {x.groups.map((g) => <Line key={g} type="monotone" dataKey={g} stroke={col(g)} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </>
  );
}