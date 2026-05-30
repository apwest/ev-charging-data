// Derived aggregations for the dashboard charts, computed from the imported datasets.
import { sessions, cleanTrips } from './data';

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

export function sessionsByMonth(): MonthBucket[] {
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

export function byNetwork(): NetworkTotal[] {
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
export function efficiencyByMonth(): MonthEfficiency[] {
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
