"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DashRun } from "@/lib/dashboard/types";
import styles from "./dashboard.module.css";
import { isFlow, FINAL_STATION } from "@/lib/dashboard/roles";

const ERA_ORDER = ["Original", "Current"];
const COLORS: Record<string, string> = { Original: "#706b60", Current: "#4f6d5c" };
const LINE_COLORS = ["#4f6d5c", "#a8503b", "#b8863b", "#5b7fa6", "#7a5ea8", "#706b60", "#3f8f8f", "#9a6b3b"];
const MUTED = "#706b60";
const MIN_UNITS = 5; // products needed before a station can be the automatic output station
const BUCKET = 300; // 5-minute steps for the cumulative curve
const MAX_BUCKETS = 12; // up to 60 minutes

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;
const showDate = (iso: string) => iso.split("-").reverse().join("/");
const byNum = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
const isLine = (w: string) => /^\d/.test(w); // excludes the Rework tab
const col = (g: string) => COLORS[g] ?? "#5b7fa6";
// B-027, B027 and b27 all count as the same ID
const idKey = (s: string) => {
  const t = s.toUpperCase().replace(/[\s-]/g, "");
  const m = t.match(/^([A-Z]*)0*(\d+)$/);
  return m ? m[1] + m[2] : t;
};
const typeOf = (id: string) => id.match(/^[A-Z]+/)?.[0] ?? "";

type Kind = "P" | "C";
// A run with a Product ID is a product run. A run with only a Component ID
// (feeder stations) is a component run.
const kindOf = (r: DashRun): Kind | "" => (r.product ? "P" : r.component ? "C" : "");
const unitKey = (r: DashRun) => `${kindOf(r)}:${idKey(r.product || r.component)}`;

interface Day { era: string; date: string; ids: Set<string> }

// distinct units logged at one station, per day
function perDay(rows: DashRun[], ws: string, kind: Kind | "all" = "all"): Day[] {
  const m = new Map<string, Day>();
  rows.forEach((r) => {
    const k = kindOf(r);
    if (r.ws !== ws || !k || (kind !== "all" && k !== kind)) return;
    const key = `${r.era}|${r.date}`;
    const d = m.get(key) ?? { era: r.era, date: r.date, ids: new Set<string>() };
    d.ids.add(unitKey(r));
    m.set(key, d);
  });
  return [...m.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// one session = one station, one day, one shift
function sessionsAt(rows: DashRun[], ws: string, kind: Kind) {
  const m = new Map<string, DashRun[]>();
  rows.forEach((r) => {
    if (r.ws !== ws || kindOf(r) !== kind) return;
    const k = [r.era, r.date, r.shift].join("|");
    m.set(k, [...(m.get(k) ?? []), r]);
  });
  return [...m.values()].map((g) => {
    const start = Math.min(...g.map((r) => r.start));
    const end = Math.max(...g.map((r) => r.end));
    const ends = new Map<string, number>();
    g.forEach((r) => {
      const k = unitKey(r);
      const cur = ends.get(k);
      if (cur == null || r.end < cur) ends.set(k, r.end);
    });
    return { era: g[0].era, start, span: end - start, ends: [...ends.values()], units: ends.size };
  });
}

interface CompRow { era: string; ws: string; days: number; total: number; perDay: number; perHour: number }

export default function Output({ all, era }: { all: DashRun[]; era: string }) {
  const [outSel, setOutSel] = useState("");

  const x = useMemo(() => {
    const line = all.filter((r) => isFlow(r.ws) && kindOf(r));
    const prodRuns = line.filter((r) => kindOf(r) === "P");
    const compRuns = line.filter((r) => kindOf(r) === "C");
    const uniq = (rs: DashRun[]) => [...new Set(rs.map((r) => r.ws))].sort(byNum);
    const stations = uniq(line);
    const prodStations = uniq(prodRuns);
    const compStations = uniq(compRuns);
    const eras = [...new Set(line.map((r) => r.era))].sort((a, b) => ERA_ORDER.indexOf(a) - ERA_ORDER.indexOf(b));

    // output station: a product station, never a component-only one
    const unitCount = (w: string) =>
      new Set(prodRuns.filter((r) => r.ws === w).map((r) => `${r.era}|${r.date}|${unitKey(r)}`)).size;
// output station: the final station (Quality Check) if it logs products, else the last product station
    const auto = prodStations.includes(FINAL_STATION) ? FINAL_STATION : prodStations[prodStations.length - 1] ?? "";
    const out = outSel && prodStations.includes(outSel) ? outSel : auto;
    const first = prodStations[0] ?? "";
    const scoped = line.filter((r) => !era || r.era === era);

    // KPIs and daily chart respect the era filter (products only)
    const days = perDay(scoped, out, "P");
    const units = days.reduce((a, d) => a + d.ids.size, 0);
    const started = perDay(scoped, first, "P").reduce((a, d) => a + d.ids.size, 0);
    const ses = sessionsAt(scoped, out, "P").filter((s) => s.span >= 300);
    const hrs = ses.reduce((a, s) => a + s.span, 0) / 3600;
    const perHour = hrs ? ses.reduce((a, s) => a + s.units, 0) / hrs : 0;
    const daily = days.map((d) => ({ date: showDate(d.date), [d.era]: d.ids.size }));

    // Original vs Current ignores the era filter
    const summary = eras.map((e) => {
      const rs = line.filter((r) => r.era === e);
      const d = perDay(rs, out, "P");
      const s = sessionsAt(rs, out, "P").filter((z) => z.span >= 300);
      const h = s.reduce((a, z) => a + z.span, 0) / 3600;
      return {
        era: e,
        days: d.length,
        perDay: d.length ? d.reduce((a, z) => a + z.ids.size, 0) / d.length : 0,
        perHour: h ? s.reduce((a, z) => a + z.units, 0) / h : 0,
      };
    });

    // every station, products and components, average distinct units per day
    const compOnly = (w: string) => compStations.includes(w) && !prodStations.includes(w);
    const flow = stations.map((w) => {
      const o: Record<string, string | number> = { ws: compOnly(w) ? `${w} (C)` : w };
      eras.forEach((e) => {
        const d = perDay(line.filter((r) => r.era === e), w);
        if (d.length) o[e] = r1(mean(d.map((z) => z.ids.size)));
      });
      return o;
    });

    const sesByEra = eras.map((e) => ({ e, ss: sessionsAt(line.filter((r) => r.era === e), out, "P").filter((z) => z.span >= 300) }));
    const curve = Array.from({ length: MAX_BUCKETS + 1 }, (_, b) => {
      const o: Record<string, number> = { min: (b * BUCKET) / 60 };
      sesByEra.forEach(({ e, ss }) => {
        if (ss.length >= 2) o[e] = r1(mean(ss.map((z) => z.ends.filter((t) => t <= z.start + b * BUCKET).length)));
      });
      return o;
    });

    // product mix by ID prefix (products only)
    const counts: Record<string, Record<string, number>> = {};
    eras.forEach((e) => {
      counts[e] = {};
      perDay(line.filter((r) => r.era === e), out, "P").forEach((d) =>
        d.ids.forEach((id) => {
          const t = typeOf(id.slice(2));
          if (t) counts[e][t] = (counts[e][t] ?? 0) + 1;
        })
      );
    });
    const types = [...new Set(eras.flatMap((e) => Object.keys(counts[e])))].sort();
    const mix = types.map((t) => {
      const o: Record<string, string | number> = { type: t };
      eras.forEach((e) => {
        const tot = Object.values(counts[e]).reduce((a, b) => a + b, 0);
        if (tot) o[e] = Math.round(((counts[e][t] ?? 0) / tot) * 100);
      });
      return o;
    });

    const repeat = stations
      .map((w) => {
        const rs = scoped.filter((r) => r.ws === w);
        const prods = perDay(rs, w).reduce((a, d) => a + d.ids.size, 0);
        return { ws: compOnly(w) ? `${w} (C)` : w, runs: rs.length, prods, ratio: prods ? rs.length / prods : 0 };
      })
      .filter((s) => s.prods > 0);

    // component production at component-only (feeder) stations
    const scopedComp = scoped.filter((r) => kindOf(r) === "C");
    const compTable = eras
      .flatMap((e): (CompRow | null)[] =>
        compStations.map((w) => {
          if (era && era !== e) return null;
          const rs = compRuns.filter((r) => r.era === e && r.ws === w);
          if (!rs.length) return null;
          const d = perDay(rs, w, "C");
          const s = sessionsAt(rs, w, "C").filter((z) => z.span >= 300);
          const h = s.reduce((a, z) => a + z.span, 0) / 3600;
          const total = d.reduce((a, z) => a + z.ids.size, 0);
          return { era: e, ws: w, days: d.length, total, perDay: d.length ? total / d.length : 0, perHour: h ? s.reduce((a, z) => a + z.units, 0) / h : 0 };
        })
      )
      .filter((r): r is CompRow => r !== null);
    const compByWs = compStations.map((w) => ({
      w, days: new Map(perDay(scopedComp, w, "C").map((z) => [z.date, z.ids.size] as [string, number])),
    }));
    const compDaily = [...new Set(scopedComp.map((r) => r.date))].sort().map((d) => {
      const o: Record<string, string | number> = { date: showDate(d) };
      compByWs.forEach(({ w, days }) => { const n = days.get(d); if (n) o[`WS ${w}`] = n; });
      return o;
    });
    const compTotal = compTable.reduce((a, r) => a + r.total, 0);

    return { stations, prodStations, compStations, eras, out, first, units, started, days: days.length, perHour, daily, summary, flow, curve, mix, repeat, compTable, compDaily, compTotal };
  }, [all, era, outSel]);

  const tick = { fill: MUTED, fontSize: 12 };
  const noData = <p className={styles.sub}>Not enough data for this selection yet.</p>;
  const kpis: [string, string | number][] = [
    [`Products logged at WS ${x.out}`, x.units],
    ["Production days", x.days],
    ["Average products per day", x.days ? r1(x.units / x.days) : "n/a"],
    ["Products per session hour", x.perHour ? r1(x.perHour) : "n/a"],
    [`Reached WS ${x.out} vs started at WS ${x.first}`, x.started ? `${Math.round((x.units / x.started) * 100)}%` : "n/a"],
  ];

  return (
    <>
      <section className={`${styles.card} ${styles.wide}`}>
        <div className={styles.cardHead}>
          <div>
            <h2>Output analysis</h2>
            <p className={styles.sub}>
              A product is one distinct Product ID per day at a station, so a repeat run of the same ID on the same day counts once. Runs with only a Component ID (feeder stations) are counted separately as components, marked (C). Pick the station whose products you count as finished.
            </p>
          </div>
          <select value={x.out} onChange={(e) => setOutSel(e.target.value)} aria-label="Output station">
            {x.prodStations.map((w) => <option key={w} value={w}>Output station: WS {w}</option>)}
          </select>
        </div>
      </section>

      <div className={styles.kpis}>
        {kpis.map(([label, val]) => (
          <div key={label} className={styles.kpi}><b>{val}</b><span>{label}</span></div>
        ))}
      </div>

      <div className={styles.grid}>
        <section className={`${styles.card} ${styles.wide}`}>
          <h2>Products per day</h2>
          <p className={styles.sub}>Distinct products logged at WS {x.out} each day, coloured by era. Follows the era filter.</p>
          <div className={styles.chart}>
            {x.daily.length ? (
              <ResponsiveContainer>
                <BarChart data={x.daily}>
                  <CartesianGrid stroke="#d9d4c8" vertical={false} />
                  <XAxis dataKey="date" tick={{ ...tick, fontSize: 11 }} />
                  <YAxis tick={tick} allowDecimals={false} />
                  <Tooltip formatter={(v) => `${v} products`} />
                  <Legend />
                  {x.eras.map((e) => <Bar key={e} dataKey={e} stackId="u" fill={col(e)} radius={[3, 3, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            ) : noData}
          </div>
        </section>

        <section className={`${styles.card} ${styles.wide}`}>
          <h2>Original vs Current at WS {x.out}</h2>
          <p className={styles.sub}>Ignores the era filter. Per hour counts only the time sessions were running.</p>
          <div className={styles.kpis} style={{ marginTop: 10 }}>
            {x.summary.flatMap((s) => [
              <div key={`${s.era}d`} className={styles.kpi}><b>{r1(s.perDay)}</b><span>{s.era}: products per day ({s.days} days)</span></div>,
              <div key={`${s.era}h`} className={styles.kpi}><b>{r1(s.perHour)}</b><span>{s.era}: products per session hour</span></div>,
            ])}
          </div>
        </section>

        <section className={`${styles.card} ${styles.wide}`}>
          <h2>Component production</h2>
          <p className={styles.sub}>
            Distinct Component IDs logged at stations that record components without a Product ID (feeders). Follows the era filter.
          </p>
          {x.compTable.length ? (
            <>
              <div className={styles.kpis} style={{ marginTop: 10 }}>
                <div className={styles.kpi}><b>{x.compTotal}</b><span>Components logged</span></div>
                <div className={styles.kpi}><b>{x.compStations.length}</b><span>Component stations: {x.compStations.map((w) => `WS ${w}`).join(", ")}</span></div>
              </div>
              <div className={styles.chart}>
                <ResponsiveContainer>
                  <BarChart data={x.compDaily}>
                    <CartesianGrid stroke="#d9d4c8" vertical={false} />
                    <XAxis dataKey="date" tick={{ ...tick, fontSize: 11 }} />
                    <YAxis tick={tick} allowDecimals={false} />
                    <Tooltip formatter={(v) => `${v} components`} />
                    <Legend />
                    {x.compStations.map((w, i) => (
                      <Bar key={w} dataKey={`WS ${w}`} stackId="c" fill={LINE_COLORS[i % LINE_COLORS.length]} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead><tr><th>Era</th><th>WS</th><th className={styles.r}>Days used</th><th className={styles.r}>Components</th><th className={styles.r}>Per day</th><th className={styles.r}>Per session hour</th></tr></thead>
                  <tbody>
                    {x.compTable.map((r) => (
                      <tr key={`${r.era}${r.ws}`}>
                        <td>{r.era}</td><td>{r.ws}</td><td className={styles.r}>{r.days}</td>
                        <td className={styles.r}>{r.total}</td><td className={styles.r}>{r1(r.perDay)}</td>
                        <td className={styles.r}>{r.perHour ? r1(r.perHour) : "n/a"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className={styles.sub}>No component-only runs found. Feeder runs that also log a Product ID are counted as products instead.</p>
          )}
        </section>

        <section className={styles.card}>
          <h2>Units per day at each station</h2>
          <p className={styles.sub}>Average distinct products (or components, marked C) on days the station was used. A drop from one station to the next shows where products leave the flow or aren&apos;t logged.</p>
          <div className={styles.chart}>
            {x.flow.length ? (
              <ResponsiveContainer>
                <BarChart data={x.flow}>
                  <CartesianGrid stroke="#d9d4c8" vertical={false} />
                  <XAxis dataKey="ws" tick={{ ...tick, fontSize: 11 }} />
                  <YAxis tick={tick} allowDecimals={false} />
                  <Tooltip formatter={(v) => `${v} units`} labelFormatter={(l) => `WS ${l}`} />
                  <Legend />
                  {x.eras.map((e) => <Bar key={e} dataKey={e} fill={col(e)} radius={[3, 3, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            ) : noData}
          </div>
        </section>

        <section className={styles.card}>
          <h2>Cumulative output in a session</h2>
          <p className={styles.sub}>Average products finished at WS {x.out} by minute of the session, over sessions of at least 5 minutes. Needs 2+ sessions per era.</p>
          <div className={styles.chart}>
            <ResponsiveContainer>
              <LineChart data={x.curve}>
                <CartesianGrid stroke="#d9d4c8" vertical={false} />
                <XAxis dataKey="min" tick={tick} unit=" m" />
                <YAxis tick={tick} />
                <Tooltip formatter={(v) => `${v} products`} labelFormatter={(l) => `${l} min`} />
                <Legend />
                {x.eras.map((e) => <Line key={e} type="monotone" dataKey={e} stroke={col(e)} strokeWidth={2} dot={{ r: 3 }} connectNulls />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className={`${styles.card} ${styles.wide}`}>
          <h2>Product mix</h2>
          <p className={styles.sub}>Share of products at WS {x.out} by the letters at the start of the ID. Shares are used because the eras cover different numbers of days.</p>
          <div className={styles.chart}>
            {x.mix.length ? (
              <ResponsiveContainer>
                <BarChart data={x.mix}>
                  <CartesianGrid stroke="#d9d4c8" vertical={false} />
                  <XAxis dataKey="type" tick={tick} />
                  <YAxis tick={tick} unit="%" />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend />
                  {x.eras.map((e) => <Bar key={e} dataKey={e} fill={col(e)} radius={[3, 3, 0, 0]} />)}
                </BarChart>
              </ResponsiveContainer>
            ) : noData}
          </div>
        </section>

        <section className={`${styles.card} ${styles.wide}`}>
          <h2>Runs per unit by station</h2>
          <p className={styles.sub}>Total runs divided by distinct products (or components, marked C). 1.0 means each unit ran once. Higher means repeat runs of the same ID on a day, which can mean rework or redone logging. Follows the era filter.</p>
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>WS</th><th className={styles.r}>Runs</th><th className={styles.r}>Units</th><th className={styles.r}>Runs per unit</th></tr></thead>
              <tbody>
                {x.repeat.map((s) => (
                  <tr key={s.ws}>
                    <td>{s.ws}</td><td className={styles.r}>{s.runs}</td><td className={styles.r}>{s.prods}</td>
                    <td className={styles.r}><span className={s.ratio > 1.25 ? styles.mid : ""}>{s.ratio.toFixed(2)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}