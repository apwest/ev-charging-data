<script lang="ts">
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';
	import { costPerMileByMonth, overallCentsPerMile, monthLabel } from '$lib/aggregations';
	import type { ChartConfiguration } from 'chart.js';

	const months = costPerMileByMonth();
	const overall = overallCentsPerMile() ?? 0;

	const data: ChartConfiguration<'line'>['data'] = {
		labels: months.map((m) => monthLabel(m.month)),
		datasets: [
			{
				label: '¢/mi',
				data: months.map((m) => m.centsPerMile),
				borderColor: '#dc2626',
				backgroundColor: 'rgba(220, 38, 38, 0.12)',
				borderWidth: 2,
				pointRadius: 2,
				fill: true,
				spanGaps: true,
				tension: 0.3
			}
		]
	};

	const options: ChartConfiguration<'line'>['options'] = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			x: { ticks: { maxRotation: 90, autoSkip: true } },
			y: { title: { display: true, text: 'Cost per mile (¢)' }, beginAtZero: true }
		},
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (ctx) => (ctx.parsed.y == null ? 'no trips' : `${ctx.parsed.y.toFixed(2)} ¢/mi`)
				}
			}
		}
	};
</script>

<Card
	title="Cost per Mile Over Time"
	subtitle="{overall.toFixed(2)}¢/mi blended — near-zero during free workplace charging"
	height={320}
>
	<Chart type="line" {data} {options} />
</Card>
