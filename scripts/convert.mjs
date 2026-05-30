#!/usr/bin/env node
// Convert the raw Google-Sheets CSV export into normalized JSON the app reads.
//
// Output:
//   data/charges.json  - one object per charging session (chronological-in-file order)
//   data/trips.json    - one object per derived trip (group of sessions until miles are recorded)
//   data/meta.json     - dataset summary + validation report
//
// Trip model (see project notes):
//   - A trip = a run of sessions that ends when miles get recorded.
//   - Top-up sessions carry Miles = 0; the closing session carries the WHOLE trip's miles.
//   - Grouping follows TIMESTAMP order; a session closes its trip when Miles > 0.
//   - Rows logged out of chronological order in the sheet are data-entry mistakes: we sort
//     past them and flag them. The sheet's +/- marker is kept only as a validation cross-check.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = join(ROOT, 'EV Charging Data - EV Charging.csv');
const OUT_DIR = join(ROOT, 'data');

const VEHICLE_ID = 'mache-2023';
const TZ_OFFSETS = { EST: '-05:00', EDT: '-04:00' };
// mi/kWh outside this band is almost certainly an artifact of unlogged charging.
const MI_PER_KWH_MIN = 1.5;
const MI_PER_KWH_MAX = 5.5;

// --- field parsers ---------------------------------------------------------

const num = (s) => {
  if (s == null) return null;
  const t = String(s).trim();
  if (t === '' || t === '---') return null;
  const n = Number(t.replace(/[$,%\s]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// "2024-02-09 7:39:11 AM EST" -> "2024-02-09T07:39:11-05:00"
function parseTimestamp(s) {
  const m = String(s).trim().match(
    /^(\d{4})-(\d{2})-(\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s+(AM|PM)\s+([A-Z]{3,4})$/
  );
  if (!m) return null;
  let [, Y, Mo, D, h, mi, se, ap, tz] = m;
  h = Number(h);
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  const off = TZ_OFFSETS[tz] ?? 'Z';
  return `${Y}-${Mo}-${D}T${String(h).padStart(2, '0')}:${mi}:${se}${off}`;
}

// "3:32:39" -> seconds
function parseDuration(s) {
  const t = String(s).trim();
  if (!t) return null;
  const parts = t.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return null;
  const [a = 0, b = 0, c = 0] = parts.length === 3 ? parts : [0, ...parts];
  return a * 3600 + b * 60 + c;
}

// "16.64 kW AC" -> { kw: 16.64, current: "AC" }
function parsePower(s) {
  const m = String(s).trim().match(/^([\d.]+)\s*kW\s+(AC|DC)$/i);
  if (!m) return { kw: num(s), current: null, raw: s };
  return { kw: Number(m[1]), current: m[2].toUpperCase() };
}

// cols 17-21: low, avgLow, avg, avgHigh, high (°F); blank when not logged
function parseTemps(cells) {
  const vals = cells.map(num);
  if (vals[0] == null) return null; // unmaintained row
  const [low, avgLow, avg, avgHigh, high] = vals;
  return { low, avgLow, avg, avgHigh, high };
}

// --- load & split ----------------------------------------------------------

const raw = readFileSync(CSV_PATH, 'utf8');
const lines = raw.split(/\r?\n/).filter((l) => l.trim() !== '');
const rows = lines.slice(1).map((l) => l.split(',')); // drop header

// --- build sessions --------------------------------------------------------

const sessions = rows.map((c, i) => {
  const startTime = parseTimestamp(c[4]);
  const finishTime = parseTimestamp(c[5]);
  const marker = (c[11] ?? '').trim(); // '+', '-', '?' or ''
  const miles = num(c[9]) ?? 0;

  // Whether a session closes its trip (a drive happened):
  //   '-'  closed, miles recorded
  //   '?'  closed, but miles were forgotten -> trip closes with miles unknown
  //   '+'  top-up, no drive yet -> does not close
  //   ''   unmaintained recent row -> fall back to miles > 0
  let closesTrip;
  if (marker === '-' || marker === '?') closesTrip = true;
  else if (marker === '+') closesTrip = false;
  else closesTrip = miles > 0;
  const milesMissing = closesTrip && !(miles > 0); // drove, but miles not logged

  return {
    rowIndex: i + 2, // 1-based incl. header, for traceability
    id: startTime ?? `${c[0]}#${i}`,
    vehicleId: VEHICLE_ID,
    date: (finishTime ?? '').slice(0, 10) || null, // session date = finish date
    network: (c[1] ?? '').trim(),
    stationId: (c[2] ?? '').trim(),
    power: parsePower(c[3]),
    startTime,
    finishTime,
    durationSec: parseDuration(c[6]),
    energyKwh: num(c[7]),
    costUsd: num(c[8]) ?? 0,
    miles, // whole-trip miles on closing rows, 0 on top-ups
    socPercent: num(c[16]),
    tempF: parseTemps(c.slice(17, 22)),
    closesTrip,
    milesMissing,
    // sheet's own figures + marker, kept only for validation
    _marker: marker,
    _sheetEnergyPerTrip: num(c[13]),
    _sheetMiPerKwhPerTrip: num(c[14]),
    tripId: null,
  };
});

// --- sort chronologically; flag out-of-order file rows ---------------------

const instant = (s) => {
  const t = s.startTime ?? s.finishTime;
  return t ? new Date(t).getTime() : 0;
};
const outOfOrder = [];
for (let i = 1; i < sessions.length; i++) {
  if (instant(sessions[i]) < instant(sessions[i - 1])) {
    outOfOrder.push({
      row: sessions[i].rowIndex,
      time: sessions[i].startTime,
      afterRow: sessions[i - 1].rowIndex,
      afterTime: sessions[i - 1].startTime,
    });
  }
}
sessions.sort((a, b) => instant(a) - instant(b));

// --- derive trips (chronological order) ------------------------------------

const trips = [];
let current = null;
const startTrip = () => {
  current = {
    id: null,
    vehicleId: VEHICLE_ID,
    sessionIds: [],
    sessionRows: [],
    energyKwh: 0,
    costUsd: 0,
    miles: 0,
    startTime: null,
    endTime: null,
    networks: new Set(),
    temps: [],
    open: true,
    milesMissing: false,
  };
};

for (const s of sessions) {
  if (!current) startTrip();
  current.sessionIds.push(s.id);
  current.sessionRows.push(s.rowIndex);
  current.energyKwh += s.energyKwh ?? 0;
  current.costUsd += s.costUsd ?? 0;
  current.networks.add(s.network);
  if (s.tempF?.avg != null) current.temps.push(s.tempF.avg);
  if (!current.startTime && s.startTime) current.startTime = s.startTime;
  if (s.finishTime) current.endTime = s.finishTime;

  if (s.closesTrip) {
    current.miles = s.miles;
    current.milesMissing = s.milesMissing;
    current.open = false;
    current.id = current.startTime ?? current.sessionIds[0];
    finalizeTrip(current);
    current = null;
  }
}
if (current) {
  // trailing open trip (top-ups with no miles recorded yet)
  current.id = current.startTime ?? current.sessionIds[0];
  finalizeTrip(current);
}

function finalizeTrip(t) {
  const energy = round(t.energyKwh, 4);
  const miPerKwh = !t.open && energy > 0 && t.miles > 0 ? round(t.miles / energy, 3) : null;
  const trip = {
    id: t.id,
    vehicleId: t.vehicleId,
    startTime: t.startTime,
    endTime: t.endTime,
    sessionIds: t.sessionIds,
    sessionCount: t.sessionIds.length,
    energyKwh: energy,
    costUsd: round(t.costUsd, 2),
    miles: t.miles || null,
    miPerKwh,
    centsPerMile: t.miles > 0 ? round((t.costUsd / t.miles) * 100, 2) : null,
    networks: [...t.networks],
    avgTempF: t.temps.length ? round(t.temps.reduce((a, b) => a + b, 0) / t.temps.length, 1) : null,
    isPaid: t.costUsd > 0,
    open: t.open, // trailing trip still accumulating (no drive logged yet)
    milesMissing: !!t.milesMissing, // drove, but miles weren't recorded ('?' rows)
    suspect: miPerKwh != null && (miPerKwh < MI_PER_KWH_MIN || miPerKwh > MI_PER_KWH_MAX),
    sessionRows: t.sessionRows,
  };
  for (const s of sessions) if (trip.sessionIds.includes(s.id)) s.tripId = trip.id;
  trips.push(trip);
}

function round(n, d) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// --- validation: computed trip figures vs the sheet's own columns ----------

const mismatches = [];
for (const t of trips) {
  const closing = sessions.find((s) => s.rowIndex === t.sessionRows.at(-1));
  if (closing?._sheetEnergyPerTrip != null) {
    if (Math.abs(t.energyKwh - closing._sheetEnergyPerTrip) > 0.15) {
      mismatches.push({ row: closing.rowIndex, kind: 'energy', computed: t.energyKwh, sheet: closing._sheetEnergyPerTrip });
    }
  }
  if (closing?._sheetMiPerKwhPerTrip != null && t.miPerKwh != null) {
    if (Math.abs(t.miPerKwh - closing._sheetMiPerKwhPerTrip) > 0.05) {
      mismatches.push({ row: closing.rowIndex, kind: 'miPerKwh', computed: t.miPerKwh, sheet: closing._sheetMiPerKwhPerTrip });
    }
  }
}

// --- strip internal fields & write ----------------------------------------

const cleanSessions = sessions.map(
  ({ _marker, _sheetEnergyPerTrip, _sheetMiPerKwhPerTrip, rowIndex, ...s }) => s
);
const cleanTrips = trips.map(({ sessionRows, ...t }) => t);

const closedTrips = trips.filter((t) => !t.open && t.miPerKwh != null && !t.suspect);
const meta = {
  generatedFrom: 'EV Charging Data - EV Charging.csv',
  vehicleId: VEHICLE_ID,
  counts: {
    sessions: sessions.length,
    trips: trips.length,
    openTrips: trips.filter((t) => t.open).length,
    milesMissingTrips: trips.filter((t) => t.milesMissing).length,
    suspectTrips: trips.filter((t) => t.suspect).length,
  },
  dateRange: { first: sessions[0]?.date, last: sessions.at(-1)?.date },
  networks: [...new Set(sessions.map((s) => s.network))],
  totals: {
    energyKwh: round(sessions.reduce((a, s) => a + (s.energyKwh ?? 0), 0), 1),
    costUsd: round(sessions.reduce((a, s) => a + (s.costUsd ?? 0), 0), 2),
    miles: round(trips.reduce((a, t) => a + (t.miles ?? 0), 0), 1),
  },
  avgMiPerKwh: closedTrips.length
    ? round(closedTrips.reduce((a, t) => a + t.miPerKwh, 0) / closedTrips.length, 3)
    : null,
  validation: { tripsChecked: trips.length, mismatches, outOfOrderRows: outOfOrder },
  generatedAtNote: 'stamp at commit time; Date.now() intentionally not used here',
};

mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(join(OUT_DIR, 'charges.json'), JSON.stringify(cleanSessions, null, 2));
writeFileSync(join(OUT_DIR, 'trips.json'), JSON.stringify(cleanTrips, null, 2));
writeFileSync(join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2));

// --- console report --------------------------------------------------------

console.log('=== EV charging data conversion ===');
console.log(`sessions: ${meta.counts.sessions}  trips: ${meta.counts.trips}  (open: ${meta.counts.openTrips}, miles-missing: ${meta.counts.milesMissingTrips}, suspect: ${meta.counts.suspectTrips})`);
console.log(`range: ${meta.dateRange.first} -> ${meta.dateRange.last}`);
console.log(`networks: ${meta.networks.join(', ')}`);
console.log(`totals: ${meta.totals.energyKwh} kWh, $${meta.totals.costUsd}, ${meta.totals.miles} mi`);
console.log(`fleet avg efficiency (clean closed trips): ${meta.avgMiPerKwh} mi/kWh`);
console.log(`\nvalidation vs sheet's own Energy/Trip + Mi/kWh/Trip columns:`);
if (!mismatches.length) {
  console.log('  ✓ all derived trips match the sheet within tolerance');
} else {
  console.log(`  ⚠ ${mismatches.length} mismatch(es):`);
  for (const m of mismatches.slice(0, 25)) {
    console.log(`    row ${m.row}: ${m.kind} computed=${m.computed} sheet=${m.sheet}`);
  }
  if (mismatches.length > 25) console.log(`    ... and ${mismatches.length - 25} more`);
}
if (outOfOrder.length) {
  console.log(`\nout-of-order rows (logged out of chronological order — consider fixing the sheet):`);
  for (const o of outOfOrder) {
    console.log(`  row ${o.row} (${o.time}) was logged after row ${o.afterRow} (${o.afterTime})`);
  }
}
console.log(`\nwrote: data/charges.json, data/trips.json, data/meta.json`);
