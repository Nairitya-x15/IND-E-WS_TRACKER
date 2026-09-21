import { google } from "googleapis";

/**
 * Builds an authenticated Google Sheets client from service-account
 * credentials stored in environment variables. See README.md for setup.
 */
function getSheetsClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_PRIVATE_KEY;
  const spreadsheetId = process.env.GOOGLE_SHEET_ID;

  if (!email || !rawKey || !spreadsheetId) {
    throw new Error(
      "Missing Google Sheets credentials. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, " +
        "GOOGLE_PRIVATE_KEY and GOOGLE_SHEET_ID in .env.local (see .env.local.example)."
    );
  }

  // .env files can't store real newlines in the private key, so it's stored
  // with literal "\n" sequences and unescaped here.
  const privateKey = rawKey.replace(/\\n/g, "\n");

  const auth = new google.auth.JWT(email, undefined, privateKey, [
    "https://www.googleapis.com/auth/spreadsheets",
  ]);

  return { sheets: google.sheets({ version: "v4", auth }), spreadsheetId };
}

/**
 * Appends one row to the sheet tab named "ws{workstationId}", e.g. "ws5".
 * Column order must match the header row set up in each tab -- see README.md.
 */
export async function appendRunRow(workstationId: number, row: (string | number)[]) {
  const { sheets, spreadsheetId } = getSheetsClient();
  const range = `ws${workstationId}!A1`;

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range,
    // RAW (not USER_ENTERED) so date/time strings like "20/09/2026" and
    // "14:23:45" are stored exactly as text, instead of Sheets silently
    // parsing them into its internal date/time serial-number format.
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [row] },
  });
}
