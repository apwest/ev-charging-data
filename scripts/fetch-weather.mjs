#!/usr/bin/env node
// Incrementally fetch daily weather from the weather.com v1 historical API and write
// raw monthly cache files (data/weather-YYYYMMDD-YYYYMMDD.json). build-weather.mjs
// then aggregates + merges them into data/weather.json.
//
// Env:
//   WEATHER_API_KEY   (required)  — keep in a secret, never commit
//   WEATHER_LOCATION  (default KOWD:9:US)
//   WEATHER_START     (optional YYYYMMDD) — force a backfill start; otherwise we
//                     resume from the first day of weather.json's last month.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const API_KEY = process.env.WEATHER_API_KEY;
const LOCATION = process.env.WEATHER_LOCATION ?? 'KOWD:9:US';
if (!API_KEY) {
	console.error('Set WEATHER_API_KEY in the environment (see .env.example).');
	process.exit(1);
}

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
const monthStart = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
const monthEnd = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
const fromYmd = (s) => new Date(Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)));

function determineStart() {
	if (process.env.WEATHER_START) return fromYmd(process.env.WEATHER_START);
	// Resume from the last month we have, re-fetching it in case it was partial.
	try {
		const last = JSON.parse(readFileSync(join(DATA_DIR, 'weather.json'), 'utf8')).meta?.range?.last;
		if (last) return new Date(`${last}T00:00:00Z`);
	} catch {
		/* no weather.json yet */
	}
	// Fall back to the earliest charge date (full historical backfill).
	try {
		const charges = JSON.parse(readFileSync(join(DATA_DIR, 'charges.json'), 'utf8'));
		const first = charges
			.map((c) => c.date)
			.filter(Boolean)
			.sort()[0];
		if (first) return new Date(`${first}T00:00:00Z`);
	} catch {
		/* no charges.json */
	}
	throw new Error('Cannot determine start date; set WEATHER_START=YYYYMMDD.');
}

const start = monthStart(determineStart());
const now = new Date();
const end = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

// One [monthStart, monthEnd] chunk per calendar month in range.
const chunks = [];
for (let cur = start; cur <= end; ) {
	chunks.push([monthStart(cur), monthEnd(cur)]);
	cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
}

console.log(`fetching weather ${ymd(start)} → ${ymd(end)} (${chunks.length} month(s)) @ ${LOCATION}`);

async function fetchMonth(cs, ce) {
	const url = new URL(
		`https://api.weather.com/v1/location/${LOCATION}/observations/historical.json`
	);
	url.searchParams.set('apiKey', API_KEY);
	url.searchParams.set('units', 'e');
	url.searchParams.set('startDate', ymd(cs));
	url.searchParams.set('endDate', ymd(ce));

	for (let attempt = 1; attempt <= 3; attempt++) {
		try {
			const res = await fetch(url);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = await res.json();
			if (!Array.isArray(json.observations)) throw new Error('no observations array');
			return json;
		} catch (e) {
			console.error(`  ${ymd(cs)}: attempt ${attempt}/3 failed — ${e.message}`);
			if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1500));
		}
	}
	return null;
}

let wrote = 0;
for (const [cs, ce] of chunks) {
	const json = await fetchMonth(cs, ce);
	if (!json) {
		console.error(`  ${ymd(cs)}-${ymd(ce)}: giving up, leaving any existing cache in place`);
		continue;
	}
	const file = `weather-${ymd(cs)}-${ymd(ce)}.json`;
	writeFileSync(join(DATA_DIR, file), JSON.stringify(json, null, 2));
	console.log(`  wrote ${file} (${json.observations.length} obs)`);
	wrote++;
}

console.log(`done: ${wrote}/${chunks.length} month file(s) written — run build-weather.mjs next.`);
