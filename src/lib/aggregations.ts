// Derived aggregations for the dashboard charts. Each helper takes its data as an
// argument (a date-filtered subset for the active range) rather than importing the
// full datasets, so charts + cards recompute when the range filter changes.
import { weather } from './data';
import type { Session, Trip } from './types';

export const NETWORKS = ['Charge Point', 'Blink', 'Electrify America'] as const;

export const NETWORK_COLORS: Record<string, string> = {
	'Charge Point': '#16a34a',
	Blink: '#2563eb',
	'Electrify America': '#f59e0b'
};
export const networkColor = (n: string) => NETWORK_COLORS[n] ?? '#9ca3af';

const round = (n: number, d = 1) => {
	const f = 10 ** d;
	return Math.round(n * f) / f;
};

const monthKey = (iso: string | null) => (iso ? iso.slice(0, 7) : null);

/** "2024-02" -> "Feb '24" */
export function monthLabel(mk: string): string {
	const [y, m] = mk.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
		month: 'short',
		year: '2-digit',
		timeZone: 'UTC'
	});
}

/** Continuous list of "YYYY-MM" from first to last inclusive (fills gaps). */
export function monthRange(first: string, last: string): string[] {
	const out: string[] = [];
	let [y, m] = first.split('-').map(Number);
	const [ly, lm] = last.split('-').map(Number);
	while (y < ly || (y === ly && m <= lm)) {
		out.push(`${y}-${String(m).padStart(2, '0')}`);
		if (++m > 12) {
			m = 1;
			y++;
		}
	}
	return out;
}

export interface MonthBucket {
	month: string;
	energyKwh: number;
	costUsd: number;
	count: number;
	byNetwork: Record<string, number>; // energy kWh per network
}

export function sessionsByMonth(sessions: Session[]): MonthBucket[] {
	const map = new Map<string, MonthBucket>();
	for (const s of sessions) {
		const mk = monthKey(s.date);
		if (!mk) continue;
		let b = map.get(mk);
		if (!b) {
			b = { month: mk, energyKwh: 0, costUsd: 0, count: 0, byNetwork: {} };
			map.set(mk, b);
		}
		b.energyKwh += s.energyKwh ?? 0;
		b.costUsd += s.costUsd ?? 0;
		b.count++;
		b.byNetwork[s.network] = (b.byNetwork[s.network] ?? 0) + (s.energyKwh ?? 0);
	}
	const keys = [...map.keys()].sort();
	if (!keys.length) return [];
	return monthRange(keys[0], keys.at(-1)!).map(
		(mk) => map.get(mk) ?? { month: mk, energyKwh: 0, costUsd: 0, count: 0, byNetwork: {} }
	);
}

export interface NetworkTotal {
	network: string;
	energyKwh: number;
	count: number;
	costUsd: number;
}

export function byNetwork(sessions: Session[]): NetworkTotal[] {
	const map = new Map<string, NetworkTotal>();
	for (const s of sessions) {
		let b = map.get(s.network);
		if (!b) {
			b = { network: s.network, energyKwh: 0, count: 0, costUsd: 0 };
			map.set(s.network, b);
		}
		b.energyKwh += s.energyKwh ?? 0;
		b.count++;
		b.costUsd += s.costUsd ?? 0;
	}
	return [...map.values()]
		.map((b) => ({ ...b, energyKwh: round(b.energyKwh), costUsd: round(b.costUsd, 2) }))
		.sort((a, b) => b.energyKwh - a.energyKwh);
}

export interface MonthEfficiency {
	month: string;
	avgMiPerKwh: number | null;
	tripCount: number;
}

/** Monthly average trip efficiency (clean trips only), keyed by trip end month. */
export function efficiencyByMonth(cleanTrips: Trip[]): MonthEfficiency[] {
	const map = new Map<string, { sum: number; n: number }>();
	for (const t of cleanTrips) {
		const mk = monthKey(t.endTime ?? t.startTime);
		if (!mk || t.miPerKwh == null) continue;
		let b = map.get(mk);
		if (!b) {
			b = { sum: 0, n: 0 };
			map.set(mk, b);
		}
		b.sum += t.miPerKwh;
		b.n++;
	}
	const keys = [...map.keys()].sort();
	if (!keys.length) return [];
	return monthRange(keys[0], keys.at(-1)!).map((mk) => {
		const b = map.get(mk);
		return {
			month: mk,
			avgMiPerKwh: b ? round(b.sum / b.n, 3) : null,
			tripCount: b?.n ?? 0
		};
	});
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);

export interface MonthWeather {
	month: string;
	avgLow: number | null;
	avg: number | null;
	avgHigh: number | null;
}

/** Monthly temperature summary from daily weather: mean of daily lows / avgs / highs. */
export function weatherByMonth(): Map<string, MonthWeather> {
	const map = new Map<string, { low: number[]; avg: number[]; high: number[] }>();
	for (const [date, d] of Object.entries(weather.days)) {
		const mk = date.slice(0, 7);
		let b = map.get(mk);
		if (!b) {
			b = { low: [], avg: [], high: [] };
			map.set(mk, b);
		}
		b.low.push(d.low);
		b.avg.push(d.avg);
		b.high.push(d.high);
	}
	const out = new Map<string, MonthWeather>();
	for (const [mk, b] of map) {
		const lo = mean(b.low);
		const av = mean(b.avg);
		const hi = mean(b.high);
		out.set(mk, {
			month: mk,
			avgLow: lo == null ? null : round(lo, 1),
			avg: av == null ? null : round(av, 1),
			avgHigh: hi == null ? null : round(hi, 1)
		});
	}
	return out;
}

/** Blended cost per mile (¢) across all clean trips — one source for the card + chart. */
export function overallCentsPerMile(cleanTrips: Trip[]): number | null {
	let cost = 0;
	let miles = 0;
	for (const t of cleanTrips) {
		if (t.miles == null) continue;
		cost += t.costUsd;
		miles += t.miles;
	}
	return miles > 0 ? round((cost / miles) * 100, 2) : null;
}

export interface MonthCostPerMile {
	month: string;
	centsPerMile: number | null;
	costUsd: number;
	miles: number;
}

/** Monthly cost per mile = summed trip cost ÷ summed trip miles (clean trips). */
export function costPerMileByMonth(cleanTrips: Trip[]): MonthCostPerMile[] {
	const map = new Map<string, { cost: number; miles: number }>();
	for (const t of cleanTrips) {
		const mk = monthKey(t.endTime ?? t.startTime);
		if (!mk || t.miles == null) continue;
		let b = map.get(mk);
		if (!b) {
			b = { cost: 0, miles: 0 };
			map.set(mk, b);
		}
		b.cost += t.costUsd;
		b.miles += t.miles;
	}
	const keys = [...map.keys()].sort();
	if (!keys.length) return [];
	return monthRange(keys[0], keys.at(-1)!).map((mk) => {
		const b = map.get(mk);
		return {
			month: mk,
			centsPerMile: b && b.miles > 0 ? round((b.cost / b.miles) * 100, 2) : b ? 0 : null,
			costUsd: b ? round(b.cost, 2) : 0,
			miles: b ? round(b.miles, 1) : 0
		};
	});
}

export interface Summary {
	sessions: number;
	trips: number;
	energyKwh: number;
	miles: number;
	costUsd: number;
	avgMiPerKwh: number | null; // mean of clean-trip efficiency
	centsPerMile: number | null;
}

/** Headline stat-card numbers for a (possibly range-filtered) slice of the data. */
export function summary(sessions: Session[], trips: Trip[], cleanTrips: Trip[]): Summary {
	let energyKwh = 0;
	let miles = 0;
	let costUsd = 0;
	for (const s of sessions) {
		energyKwh += s.energyKwh ?? 0;
		miles += s.miles ?? 0;
		costUsd += s.costUsd ?? 0;
	}
	const effs = cleanTrips.map((t) => t.miPerKwh).filter((v): v is number => v != null);
	const avg = mean(effs);
	return {
		sessions: sessions.length,
		trips: trips.length,
		energyKwh,
		miles,
		costUsd,
		avgMiPerKwh: avg == null ? null : round(avg, 3),
		centsPerMile: overallCentsPerMile(cleanTrips)
	};
}
