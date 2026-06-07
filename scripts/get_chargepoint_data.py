"""
Fetch recent ChargePoint sessions and append any NEW ones to the Google Sheet.

Runs headless (in GitHub Actions): credentials and the Sheets service-account key
come from the environment — no interactive prompt. ChargePoint login must be
password-only (no MFA). New rows land in the Sheet, where miles / trip markers are
curated, exactly like the Blink/EA rows the Apps Script appends.

Env:
  CHARGEPOINT_USER       ChargePoint account email
  CHARGEPOINT_PASSWORD   ChargePoint password (password-only login)
  GOOGLE_SA_KEY          Google service-account JSON (the whole key, as a string)
  SPREADSHEET_ID         (optional) overrides the default Sheet id
  WORKSHEET_NAME         (optional) tab name, default "EV Charging"

Columns (A–K):
  Date, Network, Station ID, Station Energy, Start Time, Finish Time,
  Duration, Energy (kWh), Total (USD), Miles, Avg. Cost (¢/mi)
Miles is left 0 (you add it in the Sheet later); convert.mjs recomputes the rest.
"""

import json
import os
import re
import sys
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import gspread
from python_chargepoint import ChargePoint

# Station reports in Eastern time; format timestamps in NY tz so they match the
# existing rows regardless of where this runs (GitHub runners are UTC).
TZ = ZoneInfo("America/New_York")
DEFAULT_SPREADSHEET_ID = "1k_YdjVTuWUZXMTtPN7s57KS6wmW955t2UnIw_BDHae0"
SESSION_PAGE_SIZE = 60

# Columns L:P hold per-row / per-trip formulas (marker, count, Energy/Trip,
# Mi/kWh/Trip, Month) that Sheets does NOT extend to appended rows. We copy them
# down after appending, mirroring the Apps Script (Blink/EA) path.
FORMULA_FIRST_COL = 11  # 0-based column L
FORMULA_NUM_COLS = 5    # L:P


def fmt_timestamp(ms):
    # e.g. "2024-05-06 7:32:59 AM EDT"
    return datetime.fromtimestamp(ms / 1000, tz=TZ).strftime("%Y-%m-%d %-I:%M:%S %p %Z")


def fmt_date(ms):
    return datetime.fromtimestamp(ms / 1000, tz=TZ).strftime("%m-%d-%Y")


def fmt_duration(ms):
    return str(timedelta(seconds=round(ms / 1000)))


def session_row(s):
    return [
        fmt_date(s["billing_time"]),
        "Charge Point",
        f"CP{s['device_id']}",
        "6.6 kW AC",
        fmt_timestamp(s["start_time"]),
        fmt_timestamp(s["end_time"]),
        fmt_duration(s["session_time"]),
        s.get("energy_kwh", 0),
        s.get("total_amount", 0),
        0.0,  # Miles — filled in the Sheet later
        0.0,  # Avg. Cost (¢/mi) — recomputed downstream
    ]


def last_formula_row(ws, from_row):
    """Sheet row number of the last row at/above from_row whose marker cell
    (col L) holds a formula. Mirrors the Apps Script guard so a blank run or a
    manual "?" override (a static value) can't make the fill-down copy nothing."""
    if from_row < 2:
        return None
    col_l = ws.get(
        f"L2:L{from_row}",
        value_render_option=gspread.utils.ValueRenderOption.formula,
    )
    for i in range(len(col_l) - 1, -1, -1):
        cell = col_l[i][0] if col_l[i] else ""
        if isinstance(cell, str) and cell.startswith("="):
            return i + 2
    return None


def fill_down_trip_formulas(ws, first_row, last_row):
    """Copy the L:P formulas down into newly appended rows (first_row..last_row).
    Uses the Sheets API copyPaste with PASTE_FORMULA, the exact equivalent of the
    Apps Script copyTo: a 1-row source tiled over the destination, relative
    references shifting per row."""
    src_row = last_formula_row(ws, first_row - 1)
    if src_row is None:
        return
    ws.spreadsheet.batch_update({
        "requests": [{
            "copyPaste": {
                "source": {
                    "sheetId": ws.id,
                    "startRowIndex": src_row - 1,
                    "endRowIndex": src_row,
                    "startColumnIndex": FORMULA_FIRST_COL,
                    "endColumnIndex": FORMULA_FIRST_COL + FORMULA_NUM_COLS,
                },
                "destination": {
                    "sheetId": ws.id,
                    "startRowIndex": first_row - 1,
                    "endRowIndex": last_row,
                    "startColumnIndex": FORMULA_FIRST_COL,
                    "endColumnIndex": FORMULA_FIRST_COL + FORMULA_NUM_COLS,
                },
                "pasteType": "PASTE_FORMULA",
                "pasteOrientation": "NORMAL",
            }
        }]
    })


def require_env(name):
    val = os.environ.get(name)
    if not val:
        sys.exit(f"Missing required env var {name}.")
    return val


def main():
    user = require_env("CHARGEPOINT_USER")
    password = require_env("CHARGEPOINT_PASSWORD")
    sa_key = json.loads(require_env("GOOGLE_SA_KEY"))
    spreadsheet_id = os.environ.get("SPREADSHEET_ID", DEFAULT_SPREADSHEET_ID)
    worksheet_name = os.environ.get("WORKSHEET_NAME", "EV Charging")

    print("[i] Connecting to ChargePoint...")
    cli = ChargePoint(user, password)

    print("[i] Requesting recent charging activity...")
    resp = cli._session.post(
        f"{cli._global_config.endpoints.mapcache}v2",
        json={"charging_activity": {"page_size": SESSION_PAGE_SIZE}},
    )
    resp.raise_for_status()
    sessions = resp.json()["charging_activity"]["session_info"]
    done = [s for s in sessions if s.get("current_charging") == "done"]
    print(f"[i] {len(done)} completed session(s) returned.")

    print("[i] Opening the Sheet...")
    gc = gspread.service_account_from_dict(sa_key)
    ws = gc.open_by_key(spreadsheet_id).worksheet(worksheet_name)

    # Dedup on the Start Time column (E). New rows use the same formatter as the
    # historical rows, so an exact string match is reliable.
    existing_starts = set(ws.col_values(5))

    new_rows = []
    for s in sorted(done, key=lambda x: x["start_time"]):
        row = session_row(s)
        if row[4] in existing_starts:
            continue
        existing_starts.add(row[4])
        new_rows.append(row)

    if new_rows:
        result = ws.append_rows(new_rows, value_input_option="USER_ENTERED")
        # updatedRange looks like "'EV Charging'!A363:K365" — pull the row span
        # so we can fill the L:P formulas down into exactly those new rows.
        updated_range = result["updates"]["updatedRange"]
        m = re.search(r"![A-Z]+(\d+):[A-Z]+(\d+)", updated_range)
        if m:
            fill_down_trip_formulas(ws, int(m.group(1)), int(m.group(2)))
        print(f"[✓] Appended {len(new_rows)} new ChargePoint session(s):")
        for r in new_rows:
            print("    " + ", ".join(str(x) for x in r))
    else:
        print("[✓] No new ChargePoint sessions to add.")


if __name__ == "__main__":
    main()
