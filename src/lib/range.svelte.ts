// Dashboard-wide time-range filter. A single rune holds the selected range; the
// `ranged` getters expose the date-filtered sessions/trips that every chart and
// stat card derives from. Trailing windows are anchored to the latest data date
// (not `new Date()`) so the prerendered output is deterministic.
import { sessions, trips, cleanTrips, meta } from './data';
import type { Session, Trip } from './types';

export type RangeKey = '1M' | '3M' | 'YTD' | '1Y' | '3Y' | '5Y' | 'All';

export const RANGE_KEYS: RangeKey[] = ['1M', '3M', 'YTD', '1Y', '3Y', '5Y', 'All'];

export const RANGE_LABELS: Record<RangeKey, string> = {
	'1M': '1M',
	'3M': '3M',
	YTD: 'YTD',
	'1Y': '1Y',
	'3Y': '3Y',
	'5Y': '5Y',
	All: 'All'
};

export const rangeState = $state<{ current: RangeKey }>({ current: 'All' });

export function setRange(key: RangeKey): void {
	rangeState.current = key;
}

const pad = (n: number) => String(n).padStart(2, '0');
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based

/** Subtract `n` months from a YYYY-MM-DD date, clamping the day to the target month. */
function subMonths(iso: string, n: number): string {
	const [y, m, d] = iso.split('-').map(Number);
	const total = y * 12 + (m - 1) - n;
	const ny = Math.floor(total / 12);
	const nm = (total % 12) + 1;
	return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

const MONTHS_BACK: Partial<Record<RangeKey, number>> = {
	'1M': 1,
	'3M': 3,
	'1Y': 12,
	'3Y': 36,
	'5Y': 60
};

/** Inclusive lower-bound date (YYYY-MM-DD) for a range, or null for "All". */
export function windowFrom(
	key: RangeKey,
	anchor: string | null = meta.dateRange.last
): string | null {
	if (key === 'All' || !anchor) return null;
	if (key === 'YTD') return `${anchor.slice(0, 4)}-01-01`;
	return subMonths(anchor, MONTHS_BACK[key]!);
}

const dateOf = (t: Trip) => (t.endTime ?? t.startTime ?? '').slice(0, 10);

interface Filtered {
	from: string | null;
	sessions: Session[];
	trips: Trip[];
	cleanTrips: Trip[];
}

let memoKey: RangeKey | null = null;
let memo: Filtered;

function compute(key: RangeKey): Filtered {
	const from = windowFrom(key);
	if (!from) return { from: null, sessions, trips, cleanTrips };
	return {
		from,
		sessions: sessions.filter((s) => s.date != null && s.date >= from),
		trips: trips.filter((t) => dateOf(t) >= from),
		cleanTrips: cleanTrips.filter((t) => dateOf(t) >= from)
	};
}

function current(): Filtered {
	const key = rangeState.current; // tracked read — keeps consumers reactive
	if (memoKey !== key) {
		memoKey = key;
		memo = compute(key);
	}
	return memo;
}

/** Reactive, date-filtered view of the data for the selected range. */
export const ranged = {
	get from() {
		return current().from;
	},
	get sessions() {
		return current().sessions;
	},
	get trips() {
		return current().trips;
	},
	get cleanTrips() {
		return current().cleanTrips;
	}
};
