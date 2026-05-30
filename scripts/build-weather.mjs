#!/usr/bin/env node
// Aggregate the cached hourly weather observations (data/weather-*.json, produced by
// scripts/weather.py against the weather.com v1 historical API) into a single
// daily-grain dataset: data/weather.json.
//
// Each cache file is { metadata, observations: [{ valid_time_gmt, temp, ... }] }.
// Observations are sub-daily; we bucket them by LOCAL (station) date and reduce to
// daily low / avg / high. Storing daily grain lets convert.mjs compute any window
// (e.g. a trip's actual date span) instead of freezing a fixed 5-day lookback.
//
// No network/API key needed — this only reads the already-cached files.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

// Station KOWD (Norwood, MA) reports in Eastern time; bucket observations by the
// local calendar day so a reading just after midnight lands on the right date.
const TZ = 'America/New_York';
const dateFmt = new Intl.DateTimeFormat('en-CA', {
	timeZone: TZ,
	year: 'numeric',
	month: '2-digit',
	day: '2-digit'
});
const localDate = (epochSec) => dateFmt.format(new Date(epochSec * 1000)); // -> YYYY-MM-DD

const round = (n, d) => {
	const f = 10 ** d;
	return Math.round(n * f) / f;
};

const cacheFiles = readdirSync(DATA_DIR)
	.filter((f) => /^weather-\d{8}-\d{8}\.json$/.test(f))
	.sort();

if (!cacheFiles.length) {
	console.error('No data/weather-*.json cache files found. Run the fetcher first.');
	process.exit(1);
}

// date -> { min, max, sum, count }
const buckets = new Map();
let totalObs = 0;
let location = null;

for (const file of cacheFiles) {
	const raw = JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
	location ??= raw.metadata?.location_id ?? null;
	for (const obs of raw.observations ?? []) {
		const t = obs.temp;
		if (t == null || obs.valid_time_gmt == null) continue;
		const d = localDate(obs.valid_time_gmt);
		const b = buckets.get(d);
		if (b) {
			b.min = Math.min(b.min, t);
			b.max = Math.max(b.max, t);
			b.sum += t;
			b.count++;
		} else {
			buckets.set(d, { min: t, max: t, sum: t, count: 1 });
		}
		totalObs++;
	}
}

const fresh = {};
for (const date of buckets.keys()) {
	const b = buckets.get(date);
	fresh[date] = { low: b.min, avg: round(b.sum / b.count, 1), high: b.max, obs: b.count };
}

// Merge into any previously-committed weather.json so the daily automation (which only
// has the newest month's raw cache — the rest is gitignored) accumulates history
// instead of clobbering it. Freshly aggregated days win for dates they cover, so a
// re-fetched (more complete) partial month supersedes an earlier partial.
let existing = {};
try {
	existing = JSON.parse(readFileSync(join(DATA_DIR, 'weather.json'), 'utf8')).days ?? {};
} catch {
	// first run
}
const merged = { ...existing, ...fresh };

const days = {};
for (const date of Object.keys(merged).sort()) days[date] = merged[date];
const dates = Object.keys(days);
const weather = {
	meta: {
		location,
		source: 'weather.com v1 historical observations (cached)',
		units: 'fahrenheit',
		timezone: TZ,
		dayCount: dates.length,
		range: { first: dates[0] ?? null, last: dates.at(-1) ?? null },
		builtFromFiles: cacheFiles.length
	},
	days
};

writeFileSync(join(DATA_DIR, 'weather.json'), JSON.stringify(weather, null, 2));

console.log('=== build weather.json ===');
console.log(`cache files: ${cacheFiles.length}  observations: ${totalObs}`);
console.log(
	`days aggregated this run: ${Object.keys(fresh).length}  total after merge: ${dates.length}  range: ${weather.meta.range.first} -> ${weather.meta.range.last}`
);
console.log(`location: ${location}`);
console.log('wrote: data/weather.json');
