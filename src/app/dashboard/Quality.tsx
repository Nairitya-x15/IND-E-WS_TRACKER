"use client";

import { useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import type { DashRun } from "@/lib/dashboard/types";
import { FINAL_STATION } from "@/lib/dashboard/roles";
import styles from "./dashboard.module.css";

const ERA_ORDER = ["Original", "Current"];
const KEYS = ["OK", "MINOR", "MAJOR", "OTHER"] as const;
type Key = (typeof KEYS)[number];
const COLORS: Record<Key, string> = { OK: "#4f6d5c", MINOR: "#b8863b", MAJOR: "#a8503b", OTHER: "#706b60" };
const LABELS: Record<Key, string> = { OK: "OK", MINOR: "Minor", MAJOR: "Major", OTHER: "Other" };
const MUTED = "#706b60";

const showDate = (iso: string) => iso.split("-").reverse().join("/");
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
const idKey = (s: string) => {
  const t = s.toUpperCase().replace(/[\s-]/g, "");
  const m = t.match(/^([A-Z]*)0*(\d+)$/);
  return m ? m[1] + m[2] : t;
};
const bucket = (q: string): Key => (q === "OK" || q === "MINOR" || q === "MAJOR" ? q : "OTHER");

interface Unit { era: string; date: string; id: string; first: Key; n: number; remark: string }

const tally = (us: Unit[]) => {
  const t: Record<Key, number> = { OK: 0, MINOR: 0, MAJOR: 0, OTHER: 0 };
  us.forEach((u) => { t[u.first]++; });
  return t;
};

export default function Quality({ all, era }: { all: DashRun[]; era: string }) {
  const [res, setRes] = useState("");

  const x = useMemo(() => {
    // one unit = one product ID inspected on one day; its first inspection is the first-pass result
    const groups = new Map<string, DashRun[]>();
    all.forEach((r) => {
      const id = r.product || r.component;
      if (r.ws !== FINAL_STATION || !r.quality || !id) return;
      const k = [r.era, r.date, idKey(id)].join("|");
      groups.set(k, [...(groups.get(k) ?? []), r]);
    });
    const units: Unit[] = [...groups.values()].map((g) => {
      g.sort((a, b) => a.start - b.start);
      return {
        era: g[0].era, date: g[0].date, id: g[0].product || g[0].component,
        first: bucket(g[0].quality), n: g.length,
        remark: g.map((r) => r.remark).filter(Boolean).join("; "),
      };
    });
    const scoped = units.filter((u) => !era || u.era === era);
    const t = tally(scoped);
    const hasOther = units.some((u) => u.first === "OTHER");
    const keys = KEYS.filter((k) => k !== "OTHER" || hasOther);

    const eras = [...new Set(units.map((u) => u.era))].sort((a, b) => ERA_ORDER.indexOf(a) - ERA_ORDER.indexOf(b));
    const byEra = eras.map((e) => {
      const us = units.filter((u) => u.era === e);
      const c = tally(us);
      return { name: `${e} (${us.length} products)`, OK: pct(c.OK, us.length), MINOR: pct(c.MINOR, us.length), MAJOR: pct(c.MAJOR, us.length), OTHER: pct(c.OTHER, us.length) };
    });

    const daily = [...new Set(scoped.map((u) => u.date))].sort().map((d) => ({
      date: showDate(d), ...tally(scoped.filter((u) => u.date === d)),
    }));

    const list = scoped
      .filter((u) => !res || u.first === res)
      .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id, undefined, { numeric: true }));

    return { total: scoped.length, t, redo: scoped.filter((u) => u.n > 1).length, keys, byEra, daily, list };
  }, [all, era, res]);

  const tick = { fill: MUTED, fontSize: 12 };
  const kpis: [string, string | number][] = [
    ["Products inspected", x.total],
    ["OK (first pass)", `${x.t.OK} (${pct(x.t.OK, x.total)}%)`],
    ["Minor", `${x.t.MINOR} (${pct(x.t.MINOR, x.total)}%)`],
    ["Major", `${x.t.MAJOR} (${pct(x.t.MAJOR, x.total)}%)`],
    ["Inspected more than once", x.redo],
  ];
  if (x.t.OTHER) kpis.push(["Other results", x.t.OTHER]);

  return (
    <>
      <section className={`${styles.card} ${styles.wide}`}>
        <h2>Quality inspection (WS {FINAL_STATION})</h2>
        <p className={styles.sub}>
          A product is one distinct ID inspected on one day. Its result is the first inspection that day (first pass), and products inspected again, for example after rework, are counted separately. Results come from the quality column of the WS {FINAL_STATION} tab. Follows the era filter, except the era comparison.
        </p>
        {x.total ? (
          <div className={styles.kpis} style={{ marginTop: 10 }}>
            {kpis.map(([label, val]) => (
              <div key={label} className={styles.kpi}><b>{val}</b><span>{label}</span></div>
            ))}
          </div>
        ) : (
          <p className={styles.sub} style={{ marginTop: 10 }}>
            No quality results found. Check that the WS {FINAL_STATION} tab has a result column (OK, Minor, Major) in every era.
          </p>
        )}
      </section>

      {x.total > 0 && (
        <div className={styles.grid}>
          <section className={styles.card}>
            <h2>Results by era</h2>
            <p className={styles.sub}>Share of inspected products with each first-pass result. Ignores the era filter.</p>
            <div className={styles.chart}>
              <ResponsiveContainer>
                <BarChart data={x.byEra}>
                  <CartesianGrid stroke="#d9d4c8" vertical={false} />
                  <XAxis dataKey="name" tick={{ ...tick, fontSize: 11 }} />
                  <YAxis tick={tick} unit="%" domain={[0, 100]} />
                  <Tooltip formatter={(v) => `${v}%`} />
                  <Legend />
                  {x.keys.map((k) => <Bar key={k} dataKey={k} name={LABELS[k]} stackId="q" fill={COLORS[k]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className={styles.card}>
            <h2>Results per day</h2>
            <p className={styles.sub}>Number of products with each first-pass result, by date.</p>
            <div className={styles.chart}>
              <ResponsiveContainer>
                <BarChart data={x.daily}>
                  <CartesianGrid stroke="#d9d4c8" vertical={false} />
                  <XAxis dataKey="date" tick={{ ...tick, fontSize: 11 }} />
                  <YAxis tick={tick} allowDecimals={false} />
                  <Tooltip formatter={(v) => `${v} products`} />
                  <Legend />
                  {x.keys.map((k) => <Bar key={k} dataKey={k} name={LABELS[k]} stackId="d" fill={COLORS[k]} />)}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className={`${styles.card} ${styles.wide}`}>
            <div className={styles.cardHead}>
              <div>
                <h2>Inspected products</h2>
                <p className={styles.sub}>Filter by first-pass result to see exactly which products were OK, Minor or Major.</p>
              </div>
              <select value={res} onChange={(e) => setRes(e.target.value)} aria-label="Result">
                <option value="">All results</option>
                {x.keys.map((k) => <option key={k} value={k}>{LABELS[k]}</option>)}
              </select>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead><tr><th>Date</th><th>Era</th><th>Product</th><th>First result</th><th className={styles.r}>Inspections</th><th>Remark</th></tr></thead>
                <tbody>
                  {x.list.slice(0, 200).map((u, i) => (
                    <tr key={i}>
                      <td>{showDate(u.date)}</td><td>{u.era}</td><td>{u.id}</td>
                      <td><span style={{ color: COLORS[u.first], fontWeight: 600 }}>{LABELS[u.first]}</span></td>
                      <td className={styles.r}>{u.n}</td>
                      <td className={styles.wrap}>{u.remark}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}