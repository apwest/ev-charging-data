<script lang="ts">
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';
	import { cleanTrips } from '$lib/data';
	import { linearRegression } from '$lib/stats';
	import type { ChartConfiguration } from 'chart.js';

	// Each point: average temperature over the trip's driving days vs. its efficiency.
	const points = cleanTrips
		.filter((t) => t.avgTempF != null && t.miPerKwh != null)
		.map((t) => ({ x: t.avgTempF as number, y: t.miPerKwh as number }));

	const reg = linearRegression(points);
	const xs = points.map((p) => p.x);
	const minX = Math.min(...xs);
	const maxX = Math.max(...xs);

	const data: ChartConfiguration['data'] = {
		datasets: [
			{
				type: 'scatter',
				label: 'Trip',
				data: points,
				backgroundColor: 'rgba(37, 99, 235, 0.55)',
				pointRadius: 4,
				pointHoverRadius: 6
			},
			...(reg
				? [
						{
							type: 'line' as const,
							label: `Trend (r² = ${reg.r2.toFixed(2)})`,
							data: [
								{ x: minX, y: reg.predict(minX) },
								{ x: maxX, y: reg.predict(maxX) }
							],
							borderColor: '#dc2626',
							borderWidth: 2,
							borderDash: [6, 4],
							pointRadius: 0,
							fill: false
						}
					]
				: [])
		]
	};

	const options: ChartConfiguration['options'] = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			x: {
				title: { display: true, text: 'Avg temperature over trip (°F)' },
				ticks: { callback: (v) => `${v}°` }
			},
			y: {
				title: { display: true, text: 'Efficiency (mi/kWh)' }
			}
		},
		plugins: {
			legend: { display: true },
			tooltip: {
				callbacks: {
					label: (ctx) => {
						if (ctx.dataset.type === 'line') return '';
						const { x, y } = ctx.raw as { x: number; y: number };
						return `${y.toFixed(2)} mi/kWh @ ${x}°F`;
					}
				}
			}
		}
	};

	// Slope is per °F; show the swing across the observed range for an intuitive headline.
	const swing = reg ? Math.abs(reg.slope) * (maxX - minX) : null;
	const subtitle =
		`${points.length} trips · ${minX}°–${maxX}°F` +
		(swing != null ? ` · ~${swing.toFixed(2)} mi/kWh swing across the range` : '');
</script>

<Card title="Efficiency vs. Temperature" {subtitle} height={380}>
	<Chart type="scatter" {data} {options} />
</Card>
