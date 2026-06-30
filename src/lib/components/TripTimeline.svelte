<script lang="ts">
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';
	import { networkColor } from '$lib/aggregations';
	import { ranged } from '$lib/range.svelte';
	import type { Trip } from '$lib/types';
	import type { ActiveElement, Chart as ChartJS, ChartEvent, ChartConfiguration } from 'chart.js';

	const RADIUS = 5;
	const dash = '—';
	const dayMs = (t: Trip) => Date.parse(t.endTime ?? t.startTime ?? '');

	const trips = $derived(ranged.trips.filter((t) => Number.isFinite(dayMs(t))));

	type Point = { x: number; y: number; trip: Trip };

	let selected = $state<Trip | null>(null);
	// Clear the selection if a range change filters the chosen trip off the chart.
	const activeTrip = $derived(
		selected && trips.some((t) => t.id === selected!.id) ? selected : null
	);

	const data: ChartConfiguration['data'] = $derived.by(() => {
		const selId = activeTrip?.id ?? null; // read for reactivity → highlight updates on click
		const groups: Record<string, Point[]> = {};
		for (const t of trips) {
			const net = t.networks[0] ?? 'Unknown';
			(groups[net] ??= []).push({ x: dayMs(t), y: 0, trip: t });
		}
		return {
			datasets: Object.entries(groups).map(([net, points]) => {
				const color = networkColor(net);
				const isSel = (ctx: { raw: unknown }) => (ctx.raw as Point).trip.id === selId;
				return {
					label: net,
					data: points,
					borderColor: color,
					backgroundColor: (ctx: { raw: unknown }) => (isSel(ctx) ? color : color + '99'),
					pointRadius: (ctx: { raw: unknown }) => (isSel(ctx) ? RADIUS + 3 : RADIUS),
					pointHoverRadius: (ctx: { raw: unknown }) => (isSel(ctx) ? RADIUS + 3 : RADIUS + 2),
					borderWidth: (ctx: { raw: unknown }) => (isSel(ctx) ? 2 : 1)
				};
			})
		};
	});

	const fmtTick = (ms: number) =>
		new Date(ms).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
	const fmtFull = (ms: number) =>
		new Date(ms).toLocaleDateString('en-US', {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			timeZone: 'UTC'
		});

	const options: ChartConfiguration['options'] = {
		responsive: true,
		maintainAspectRatio: false,
		animation: false, // snappy: the chart rebuilds on each selection
		interaction: { mode: 'nearest', intersect: true },
		onClick: (_e: ChartEvent, els: ActiveElement[], chart: ChartJS) => {
			if (!els.length) {
				selected = null;
				return;
			}
			const el = els[0];
			const pt = chart.data.datasets[el.datasetIndex].data[el.index] as unknown as Point;
			selected = pt.trip;
		},
		scales: {
			x: {
				type: 'linear',
				ticks: { callback: (v) => fmtTick(v as number), maxTicksLimit: 8, maxRotation: 0 }
			},
			y: { display: false, min: -1, max: 1 }
		},
		plugins: {
			legend: { position: 'bottom' },
			tooltip: {
				callbacks: {
					title: (items) => fmtFull((items[0].raw as Point).x),
					label: (ctx) => {
						const t = (ctx.raw as Point).trip;
						const miles = t.miles != null ? `${t.miles} mi` : dash;
						return `${miles} · ${t.miPerKwh != null ? t.miPerKwh.toFixed(2) + ' mi/kWh' : dash}`;
					}
				}
			}
		}
	};

	const subtitle = $derived(
		trips.length === 0 ? 'No trips in this range' : `${trips.length} trips · click one for details`
	);

	// Detail-panel facts for the selected trip.
	const facts = $derived.by(() => {
		const t = activeTrip;
		if (!t) return [];
		const temp =
			t.avgTempF != null
				? `${t.avgTempF}°F${t.minTempF != null && t.maxTempF != null ? ` (${t.minTempF}–${t.maxTempF})` : ''}`
				: dash;
		return [
			{ label: 'Distance', value: t.miles != null ? `${t.miles} mi` : dash },
			{ label: 'Energy', value: `${t.energyKwh.toFixed(1)} kWh` },
			{ label: 'Efficiency', value: t.miPerKwh != null ? `${t.miPerKwh.toFixed(2)} mi/kWh` : dash },
			{ label: 'Cost', value: `$${t.costUsd.toFixed(2)}` },
			{
				label: 'Cost/mile',
				value: t.centsPerMile != null ? `${t.centsPerMile.toFixed(1)}¢` : dash
			},
			{ label: 'Sessions', value: String(t.sessionCount) },
			{ label: 'Network', value: t.networks.join(', ') || dash },
			{ label: 'Avg temp', value: temp }
		];
	});
</script>

<Card title="Trip Timeline" {subtitle} height={220}>
	<Chart type="scatter" {data} {options} />
</Card>

<div class="detail" class:empty={!activeTrip}>
	{#if activeTrip}
		<div class="detail-head">
			<h3>{fmtFull(dayMs(activeTrip))}</h3>
			<button class="clear" onclick={() => (selected = null)} aria-label="Clear selection">×</button
			>
		</div>
		<dl class="facts">
			{#each facts as f (f.label)}
				<div class="fact">
					<dt>{f.label}</dt>
					<dd>{f.value}</dd>
				</div>
			{/each}
		</dl>
	{:else}
		<p class="hint">Click a trip on the timeline to see its details.</p>
	{/if}
</div>

<style>
	.detail {
		margin-top: 0.75rem;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 1rem 1.25rem;
	}
	.detail.empty {
		border-style: dashed;
	}
	.detail-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.75rem;
	}
	.detail-head h3 {
		margin: 0;
		font-size: 1rem;
	}
	.clear {
		border: 0;
		background: transparent;
		color: var(--muted);
		font-size: 1.3rem;
		line-height: 1;
		cursor: pointer;
		padding: 0 0.25rem;
	}
	.clear:hover {
		color: var(--text);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
		gap: 0.6rem 1rem;
		margin: 0;
	}
	.fact {
		display: flex;
		flex-direction: column;
	}
	.fact dt {
		font-size: 0.68rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
	}
	.fact dd {
		margin: 0.1rem 0 0;
		font-size: 1.05rem;
		font-weight: 600;
		color: var(--text);
	}
	.hint {
		margin: 0;
		color: var(--muted);
		font-size: 0.9rem;
	}
</style>
