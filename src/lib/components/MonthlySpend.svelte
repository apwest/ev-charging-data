<script lang="ts">
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';
	import { sessionsByMonth, monthLabel } from '$lib/aggregations';
	import type { ChartConfiguration } from 'chart.js';

	const months = sessionsByMonth();
	const round2 = (n: number) => Math.round(n * 100) / 100;

	let running = 0;
	const cumulative = months.map((m) => round2((running += m.costUsd)));
	const total = running;

	const data: ChartConfiguration['data'] = {
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
	};

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

<Card title="Spend Over Time" subtitle="${total.toLocaleString()} total · most charging is free" height={320}>
	<Chart type="bar" {data} {options} />
</Card>
