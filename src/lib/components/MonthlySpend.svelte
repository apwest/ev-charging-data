<script lang="ts">
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';
	import { sessionsByMonth, monthLabel } from '$lib/aggregations';
	import { ranged } from '$lib/range.svelte';
	import type { ChartConfiguration } from 'chart.js';

	const round2 = (n: number) => Math.round(n * 100) / 100;

	const months = $derived(sessionsByMonth(ranged.sessions));
	const cumulative = $derived.by(() => {
		let running = 0;
		return months.map((m) => round2((running += m.costUsd)));
	});
	const total = $derived(cumulative.at(-1) ?? 0);

	const data: ChartConfiguration['data'] = $derived({
		labels: months.map((m) => monthLabel(m.month)),
		datasets: [
			{
				type: 'bar',
				label: 'Monthly spend',
				data: months.map((m) => round2(m.costUsd)),
				backgroundColor: '#2563eb',
				yAxisID: 'y'
			},
			{
				type: 'line',
				label: 'Cumulative',
				data: cumulative,
				borderColor: '#9333ea',
				backgroundColor: '#9333ea',
				borderWidth: 2,
				pointRadius: 0,
				yAxisID: 'y1'
			}
		]
	});

	const dollars = (v: unknown) => `$${Number(v).toLocaleString()}`;
	const options: ChartConfiguration['options'] = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			x: { ticks: { maxRotation: 90, autoSkip: true } },
			y: { title: { display: true, text: 'Monthly ($)' }, ticks: { callback: dollars } },
			y1: {
				position: 'right',
				title: { display: true, text: 'Cumulative ($)' },
				grid: { drawOnChartArea: false },
				ticks: { callback: dollars }
			}
		},
		plugins: {
			legend: { position: 'bottom' },
			tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${dollars(ctx.parsed.y)}` } }
		}
	};
</script>

<Card
	title="Spend Over Time"
	subtitle="${total.toLocaleString()} total · most charging is free"
	height={320}
>
	<Chart type="bar" {data} {options} />
</Card>
