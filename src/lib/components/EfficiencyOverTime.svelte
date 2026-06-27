<script lang="ts">
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';
	import { efficiencyByMonth, weatherByMonth, monthLabel } from '$lib/aggregations';
	import { ranged } from '$lib/range.svelte';
	import type { ChartConfiguration } from 'chart.js';

	const wx = weatherByMonth(); // full weather lookup map; charts read only the months they show

	const months = $derived(efficiencyByMonth(ranged.cleanTrips));
	const labels = $derived(months.map((m) => monthLabel(m.month)));
	const avgHigh = $derived(months.map((m) => wx.get(m.month)?.avgHigh ?? null));
	const avgLow = $derived(months.map((m) => wx.get(m.month)?.avgLow ?? null));

	const data: ChartConfiguration<'line'>['data'] = $derived({
		labels,
		datasets: [
			// Shaded temperature band (avg daily low → avg daily high), behind the line.
			{
				label: 'Temp range (°F)',
				data: avgHigh,
				yAxisID: 'yTemp',
				borderColor: 'rgba(245, 158, 11, 0.35)',
				backgroundColor: 'rgba(245, 158, 11, 0.12)',
				borderWidth: 1,
				pointRadius: 0,
				fill: '+1',
				spanGaps: true,
				order: 1
			},
			{
				label: '_low',
				data: avgLow,
				yAxisID: 'yTemp',
				borderColor: 'rgba(245, 158, 11, 0.35)',
				borderWidth: 1,
				pointRadius: 0,
				fill: false,
				spanGaps: true,
				order: 1
			},
			// Efficiency line, drawn on top.
			{
				label: 'Avg efficiency',
				data: months.map((m) => m.avgMiPerKwh),
				yAxisID: 'y',
				borderColor: '#0d9488',
				backgroundColor: '#0d9488',
				borderWidth: 2,
				pointRadius: 2,
				spanGaps: true,
				tension: 0.3,
				order: 0
			}
		]
	});

	const options: ChartConfiguration<'line'>['options'] = {
		responsive: true,
		maintainAspectRatio: false,
		interaction: { mode: 'index', intersect: false },
		scales: {
			x: { ticks: { maxRotation: 90, autoSkip: true } },
			y: { position: 'left', title: { display: true, text: 'mi/kWh' } },
			yTemp: {
				position: 'right',
				title: { display: true, text: '°F' },
				grid: { drawOnChartArea: false }
			}
		},
		plugins: {
			legend: {
				display: true,
				labels: { filter: (item) => !item.text.startsWith('_') }
			},
			tooltip: {
				callbacks: {
					label: (ctx) => {
						if (ctx.parsed.y == null) return '';
						if (ctx.dataset.yAxisID === 'yTemp') {
							const which = ctx.dataset.label === '_low' ? 'avg low' : 'avg high';
							return `${which}: ${ctx.parsed.y}°F`;
						}
						return `${ctx.parsed.y.toFixed(2)} mi/kWh`;
					}
				}
			}
		}
	};
</script>

<Card
	title="Efficiency Over Time"
	subtitle="Monthly avg efficiency vs. the temperature band — efficiency dips when it's cold"
	height={320}
>
	<Chart type="line" {data} {options} />
</Card>
