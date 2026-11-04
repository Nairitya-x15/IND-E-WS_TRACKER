export interface Source {
  era: string;
  sheetId: string;
  tabPattern: RegExp; // which tabs hold run data
  tabAlias?: Record<string, string>; // tab name (UPPERCASE) -> workstation number
  defaultWs?: string; // used when a tab name has no WS number
}

const WS_TAB = /^WS\s*\d+[AB]?$/i;
// Original sheet: WS1..WS14, "WS15 quality", "WS16 rework" (also bare "Quality" / "Rework")
const ORIGINAL_TAB = /^(WS\s*\d+[AB]?([\s_-]*(quality|rework))?|quality|rework)$/i;

export const SOURCES: Source[] = [
  {
    era: "Original",
    sheetId: "12nPsrKLk_fsLSsSVpSz1JFF5J4manQxp5hZsDbyqgVI",
    tabPattern: ORIGINAL_TAB,
    tabAlias: { QUALITY: "15", REWORK: "16" },
  },
  {
    era: "Current",
    sheetId: "1kdhMPlPXsXe0mj0Mw1jPH6p0_Qj0A0PHlKKddsxkWqc", // formerly Pre-midsem
    tabPattern: WS_TAB,
  },
  {
    era: "Current",
    sheetId: process.env.GOOGLE_SHEET_ID ?? "1RqO40WOyai3x7jhMnX6JANrPJDD7PipCvbqq2jt0U-0",
    tabPattern: WS_TAB,
  },
];