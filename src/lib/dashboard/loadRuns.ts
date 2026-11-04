import { google } from "googleapis";
import { SOURCES, Source } from "./sources";
import type { DashPayload, DashRun } from "./types";

// Older sheets show 12-hour times with no AM/PM (3:20:05). Sessions run
// 2-5 PM, so an hour below this value is read as afternoon.
const PM_BELOW_HOUR = 8;

function parseTime(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = m[4]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  else if (ap === "am" && h === 12) h = 0;
  else if (!ap && h < PM_BELOW_HOUR) h += 12;
  return h * 3600 + Number(m[2]) * 60 + Number(m[3] ?? 0);
}

function parseDate(raw: string): string | null {
  const t = raw.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/); // dd/mm/yy or dd/mm/yyyy
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

function normQuality(v: string): string {
  const t = v.trim().toUpperCase();
  if (!t) return "";
  if (t.startsWith("OK") || t === "PASS" || t === "GOOD") return "OK";
  if (t.startsWith("MAJOR")) return "MAJOR";
  if (t.startsWith("MINOR")) return "MINOR";
  return t;
}

function findCols(header: string[]) {
  const h = header.map((x) => String(x).toLowerCase().trim());
  const f = (fn: (x: string) => boolean) => h.findIndex(fn);
  return {
    date: f((x) => x.startsWith("date")),
    shift: f((x) => x.startsWith("shift")),
    ws: f((x) => x === "ws" || x === "workstation"),
    product: f((x) => x.includes("product")),
    component: f((x) => x.includes("component")),
    start: f((x) => x.startsWith("start")),
    end: f((x) => x.startsWith("end")),
    remarks: f((x) => x.startsWith("remark")),
    quality: f((x) => x.includes("quality") || x === "result" || x.includes("qc")),
  };
}

function rowsToRuns(rows: string[][], tab: string, src: Source, warnings: string[]): DashRun[] {
  const hi = rows.slice(0, 5).findIndex((r) => {
    const c = findCols(r);
    return c.date >= 0 && c.start >= 0 && c.end >= 0;
  });
  if (hi < 0) {
    warnings.push(`${src.era} / ${tab}: header row not recognised, tab skipped`);
    return [];
  }
  const c = findCols(rows[hi]);
  const tabWs = (
    src.tabAlias?.[tab.toUpperCase()] ??
    tab.match(/^WS\s*(\d+[AB]?)/i)?.[1] ??
    src.defaultWs ??
    tab
  ).toUpperCase();
  const out: DashRun[] = [];
  for (const r of rows.slice(hi + 1)) {
    const date = parseDate(r[c.date] ?? "");
    const s = parseTime(r[c.start] ?? "");
    const e = parseTime(r[c.end] ?? "");
    if (!date || s == null || e == null || e <= s) continue;
    out.push({
      era: src.era,
      date,
      ws: (r[c.ws] ?? "").trim().toUpperCase().replace(/^WS[\s-]*/, "") || tabWs,
      shift: (r[c.shift] ?? "").trim() || (s < 15.5 * 3600 ? "1" : "2"),
      product: (r[c.product] ?? "").trim().toUpperCase(),
      component: (r[c.component] ?? "").trim().toUpperCase(),
      start: s,
      end: e,
      dur: e - s,
      remark: (r[c.remarks] ?? "").trim(),
      quality: normQuality(r[c.quality] ?? ""),
    });
  }
  return out;
}

let cache: { at: number; data: DashPayload } | null = null;
function getPrivateKey(): string {
  let k = (process.env.GOOGLE_PRIVATE_KEY ?? "").trim();
  // Remove surrounding quotes if they were pasted into the env var
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1);
  }
  // Decode base64-encoded keys
  if (!k.includes("BEGIN")) {
    try {
      k = Buffer.from(k, "base64").toString("utf8");
    } catch {
      /* leave as is */
    }
  }
  return k.replace(/\\n/g, "\n");
}
export async function loadRuns(): Promise<DashPayload> {
  if (cache && Date.now() - cache.at < 60_000) return cache.data; // protects Sheets API quota

  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim(),
    key: getPrivateKey(),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
  const sheets = google.sheets({ version: "v4", auth });
  const runs: DashRun[] = [];
  const warnings: string[] = [];

  await Promise.all(
    SOURCES.map(async (src) => {
      try {
        const meta = await sheets.spreadsheets.get({
          spreadsheetId: src.sheetId,
          fields: "sheets.properties.title",
        });
        const tabs = (meta.data.sheets ?? [])
          .map((s) => s.properties?.title ?? "")
          .filter((t) => t && src.tabPattern.test(t));
        if (!tabs.length) {
          warnings.push(`${src.era}: no matching tabs found`);
          return;
        }
        const res = await sheets.spreadsheets.values.batchGet({
          spreadsheetId: src.sheetId,
          ranges: tabs.map((t) => `'${t.replace(/'/g, "''")}'`),
          valueRenderOption: "FORMATTED_VALUE",
        });
        (res.data.valueRanges ?? []).forEach((vr, i) => {
          runs.push(...rowsToRuns((vr.values ?? []) as string[][], tabs[i], src, warnings));
        });
      } catch (e) {
        warnings.push(`${src.era}: ${e instanceof Error ? e.message : "could not read sheet"}`);
      }
    })
  );

  const seen = new Set<string>();
  const unique = runs.filter((r) => {
    const k = [r.era, r.date, r.ws, r.product, r.component, r.start].join("|");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const data = { runs: unique, warnings };
  cache = { at: Date.now(), data };
  return data;
}