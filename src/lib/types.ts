// Shapes produced by scripts/convert.mjs (data/*.json).

export interface TempRange {
	low: number | null;
	avgLow: number | null;
	avg: number | null;
	avgHigh: number | null;
	high: number | null;
}

export interface Power {
	kw: number | null;
	current: 'AC' | 'DC' | null;
	raw?: string;
}

/** Daily weather for a single date (from data/weather.json). */
export interface DayWeather {
	low: number;
	avg: number;
	high: number;
	obs: number;
}

/** One charging session (one row of the source sheet). */
export interface Session {
	id: string;
	vehicleId: string;
	date: string | null;
	network: string;
	stationId: string;
	power: Power;
	startTime: string | null;
	finishTime: string | null;
	durationSec: number | null;
	energyKwh: number | null;
	costUsd: number;
	miles: number; // whole-trip miles on closing rows, 0 on top-ups
	socPercent: number | null;
	tempF: TempRange | null; // sheet's embedded 5-day window (legacy/fallback)
	weatherF: DayWeather | null; // actual weather for the session's date
	closesTrip: boolean;
	milesMissing: boolean;
	tripId: string | null;
}

/** A trip = sessions grouped until miles were recorded; the unit of efficiency. */
export interface Trip {
	id: string;
	vehicleId: string;
	startTime: string | null;
	endTime: string | null;
	sessionIds: string[];
	sessionCount: number;
	energyKwh: number;
	costUsd: number;
	miles: number | null;
	miPerKwh: number | null;
	centsPerMile: number | null;
	networks: string[];
	avgTempF: number | null; // avg over the trip's date span
	minTempF: number | null;
	maxTempF: number | null;
	tempSource: 'weather' | 'sheet' | null;
	isPaid: boolean;
	open: boolean; // still accumulating (no drive logged yet)
	milesMissing: boolean; // drove, but miles weren't recorded
	suspect: boolean; // mi/kWh outside a plausible band
}

export interface Vehicle {
	id: string;
	name: string;
	make: string;
	model: string;
	year: number;
	trim: string | null;
	batteryKwhUsable: number | null;
	epaRangeMiles: number | null;
	active: boolean;
}

export interface Meta {
	generatedFrom: string;
	vehicleId: string;
	counts: {
		sessions: number;
		trips: number;
		openTrips: number;
		milesMissingTrips: number;
		suspectTrips: number;
	};
	dateRange: { first: string | null; last: string | null };
	networks: string[];
	totals: { energyKwh: number; costUsd: number; miles: number };
	avgMiPerKwh: number | null;
	weather: {
		days: number;
		tripsFromWeather: number;
		tripsFromSheet: number;
		tripsNoTemp: number;
	};
	validation: { tripsChecked: number; mismatches: unknown[]; outOfOrderRows: unknown[] };
}

/** data/weather.json — daily-grain weather keyed by YYYY-MM-DD. */
export interface WeatherData {
	meta: {
		location: string | null;
		source: string;
		units: string;
		timezone: string;
		dayCount: number;
		range: { first: string | null; last: string | null };
		builtFromFiles: number;
	};
	days: Record<string, DayWeather>;
}
