<script lang="ts">
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';
	import { sessionsByMonth, monthLabel, NETWORKS, networkColor } from '$lib/aggregations';
	import { ranged } from '$lib/range.svelte';
	import type { ChartConfiguration } from 'chart.js';

	const round = (n: number) => Math.round(n * 10) / 10;

	const months = $derived(sessionsByMonth(ranged.sessions));

	const data: ChartConfiguration['data'] = $derived({
		labels: months.map((m) => monthLabel(m.month)),
		datasets: NETWORKS.map((n) => ({
			label: n,
			data: months.map((m) => round(m.byNetwork[n] ?? 0)),
			backgroundColor: networkColor(n),
			stack: 'energy'
		}))
	});

	const options: ChartConfiguration['options'] = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			x: { stacked: true, ticks: { maxRotation: 90, minRotation: 0, autoSkip: true } },
			y: { stacked: true, title: { display: true, text: 'Energy (kWh)' } }
		},
		plugins: {
			legend: { position: 'bottom' },
			tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.parsed.y} kWh` } }
		}
	};
</script>

<Card
	title="Energy by Network, Monthly"
	subtitle="Charging volume and network mix over time"
	height={320}
>
	<Chart type="bar" {data} {options} />
</Card>
