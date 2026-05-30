// Build-time import of the generated datasets. The site is fully prerendered, so
// these JSON files are bundled at build time — no runtime fetch. Re-running
// `npm run convert` (or the daily scraper committing new data/*.json) feeds a rebuild.
import chargesJson from '../../data/charges.json';
import tripsJson from '../../data/trips.json';
import vehiclesJson from '../../data/vehicles.json';
import metaJson from '../../data/meta.json';
import weatherJson from '../../data/weather.json';

import type { Session, Trip, Vehicle, Meta, WeatherData } from './types';

export const sessions = chargesJson as Session[];
export const trips = tripsJson as Trip[];
export const vehicles = vehiclesJson as Vehicle[];
export const meta = metaJson as Meta;
export const weather = weatherJson as WeatherData;

/** Trips usable for efficiency analysis: closed, with miles, and not flagged suspect. */
export const cleanTrips = trips.filter(
	(t) => !t.open && !t.milesMissing && !t.suspect && t.miPerKwh != null
);
