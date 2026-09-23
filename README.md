# Factory Station Tracker

A small Next.js (TypeScript) app for ~50 factory workers to log start/stop
work sessions at 16 workstations (workstation 10 is split into **10A** and
**10B**), plus two non-workstation roles — **Material Handler** and
**Line Supervisor** — writing every entry straight into a Google Sheet.

## How it works

1. **Session setup** — worker picks their Roll No. (Assembler ID, dropdown
   4501–4539) and a Workstation / Role (1–9, 10A, 10B, 11–16, Material Handler,
   Line Supervisor). Team (ODD/EVEN) is derived from the
   roll number automatically. Date is filled with today's date. Shift is
   auto-set from the current time (Shift 1: 2:00–3:30 PM, Shift 2:
   3:30–5:00 PM) but stays editable.
2. **Work screen** — depending on the workstation type, the worker fills in
   Product ID and/or Component ID, then clicks **Start**. A **Stop** button
   and an optional remarks box appear; clicking Stop saves that run as one
   row in the Google Sheet and returns to the Start screen for the next run.
   **End Session** finishes the whole session.
   **Material Handler / Line Supervisor** have no Start/Stop timer: they fill in
   a short form and press **Submit**, which writes one row (with the time of
   submission) and clears the form for the next entry.
3. **Session summary** — total time worked, idle time, utilization %, and
   number of products worked on, plus a table of every run.

### Field rules by workstation type

| Type | Workstations | Fields | Sheet tab header row (A → last column) |
|---|---|---|---|
| Normal | 1, 2, 3, 4, 8, 14 | Product ID | Date \| Shift \| Team \| WS \| Assembler ID (Roll no.) \| Product Number (last 3 digits) \| Start Time (hh:mm.s) \| End Time (hh:mm.s) \| Remarks \| TimeDiff (hh:mm:s) |
| Feeder | 5, 9, 11, 12 | Component ID | Date \| Shift \| Team \| WS \| Assembler ID (Roll no.) \| Component ID \| Start Time (hh:mm.s) \| End Time (hh:mm.s) \| Remarks \| TimeDiff (hh:mm:s) |
| Junction | 6, 7, 10A, 10B, 13 | Product ID + Component ID | Date \| Shift \| Team \| WS \| Assembler ID (Roll no.) \| Product Number (last 3 digits) \| Component ID \| Start Time (hh:mm.s) \| End Time (hh:mm.s) \| Remarks \| TimeDiff (hh:mm:s) |
| Quality Check | 15 | Product ID + Quality Report (Major/Minor/OK) | Date \| Shift \| Team \| WS \| Assembler ID (Roll no.) \| Product Number (last 3 digits) \| Start Time (hh:mm.s) \| End Time (hh:mm.s) \| Remarks \| TimeDiff (hh:mm:s) \| Quality Result |
| Rework | 16 | Product ID | Date \| Shift \| Team \| WS \| Assembler ID (Roll no.) \| Product Number (last 3 digits) \| Start Time (hh:mm.s) \| End Time (hh:mm.s) \| Remarks \| TimeDiff (hh:mm:s) |

### Material Handler and Line Supervisor

These two roles have their own tab layouts — no WS column, no start/end time,
no TimeDiff, just a single submission **Time**.

| Role | Fields | Sheet tab header row (A → last column) |
|---|---|---|
| Line Supervisor | WIP (text), Between Workstation (`1-2`, `2-3` … `15-16`), Remarks | Date \| Shift \| Team \| Assembler ID (Roll no.) \| WIP \| Between Workstation \| Time \| Remarks |
| Material Handler | Material (text), Provided to which workstation (`1`–`16`), Remarks | Date \| Shift \| Team \| Assembler ID (Roll no.) \| Material \| Provided to which workstation \| Time \| Remarks |

Time is the moment **Submit** was pressed (`HH:MM:SS`). WIP, Between Workstation,
Material and the workstation are required; Remarks is optional. The option lists
live in `src/lib/workstations.ts` (`BETWEEN_WORKSTATION_OPTIONS`,
`PROVIDED_TO_WORKSTATION_OPTIONS`) if they ever need changing.

**Each tab's header row must match its type exactly** (column order matters —
the app appends values positionally, not by header name). `TimeDiff` is
computed by the app as `HH:MM:SS` from the run's actual duration, not a
sheet formula.

The Assembler ID is written with a `25B` prefix — roll number `4501` is
stored in the sheet as `25B4501`.

## Project structure

```
data/                     static JSON: roll numbers, workstation list/types
src/lib/                  types, time/shift helpers, workstation helpers,
                          Google Sheets client (server-only)
src/components/           SessionStartForm, WorkScreen, SessionSummary
src/app/                  Next.js App Router pages
src/app/api/append-row/   API route that writes a run to the sheet
```

## 1. Install dependencies

```bash
npm install
```

## 2. Connect the Google Sheet

The app writes to this sheet: https://docs.google.com/spreadsheets/d/1RqO40WOyai3x7jhMnX6JANrPJDD7PipCvbqq2jt0U-0/edit

Each workstation/role writes to the tab named in its `sheetName` field in
`data/workstations.json`. **These tab names must exist in the sheet exactly as
written:**

```
WS1  WS2  WS3  WS4  WS5  WS6  WS7  WS8  WS9  WS10A  WS10B  WS11  WS12  WS13  WS14  WS15  WS16
Material Handler   Line Supervisor
```

Row 1 of every tab must contain the header row for its type (see the tables
above). To add or rename a station, edit `data/workstations.json`.

### Create a service account (one-time)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/), create
   (or pick) a project.
2. Enable the **Google Sheets API** for that project.
3. Go to **IAM & Admin → Service Accounts → Create Service Account**. Any
   name is fine; no special roles are needed.
4. Open the new service account → **Keys → Add Key → Create new key → JSON**.
   This downloads a `.json` key file — keep it private.
5. Open the Google Sheet, click **Share**, and share it with the service
   account's email address (looks like
   `something@your-project.iam.gserviceaccount.com`, found in the JSON key
   file) as **Editor**.

### Configure environment variables

Copy the example file:

```bash
cp .env.local.example .env.local
```

Fill in `.env.local` using values from the downloaded JSON key file:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL` → the key file's `client_email`
- `GOOGLE_PRIVATE_KEY` → the key file's `private_key` (keep the quotes and
  the `\n` sequences exactly as they appear in the JSON file)
- `GOOGLE_SHEET_ID` → already filled in to match the sheet above; change it
  if you point the app at a different sheet

## 3. Run it

```bash
npm run dev
```

Visit http://localhost:3000.

## 4. Deploy

Any Next.js host (e.g. Vercel) works — just set the same three environment
variables in the hosting platform's dashboard.

## Notes

- Data is only sent to Google Sheets when a run is **stopped**; nothing is
  written on Start.
- If the network request to save a run fails, an error message is shown and
  the run is not counted — the worker can retry Stop.
- An in-progress session is kept in the browser's `localStorage` so a
  refresh doesn't lose progress; it's cleared once the session ends.
