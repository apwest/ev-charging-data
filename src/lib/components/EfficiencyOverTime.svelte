<script lang="ts">
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';
	import { efficiencyByMonth, monthLabel } from '$lib/aggregations';
	import type { ChartConfiguration } from 'chart.js';

	const months = efficiencyByMonth();

	const data: ChartConfiguration['data'] = {
		labels: months.map((m) => monthLabel(m.month)),
		datasets: [
			{
				type: 'line',
				label: 'Avg efficiency',
				data: months.map((m) => m.avgMiPerKwh),
				borderColor: '#0d9488',
				backgroundColor: '#0d9488',
				borderWidth: 2,
				pointRadius: 2,
				spanGaps: true,
				tension: 0.3
			}
		]
	};

	const options: ChartConfiguration['options'] = {
		responsive: true,
		maintainAspectRatio: false,
		scales: {
			x: { ticks: { maxRotation: 90, autoSkip: true } },
			y: { title: { display: true, text: 'mi/kWh' } }
		},
		plugins: {
			legend: { display: false },
			tooltip: {
				callbacks: {
					label: (ctx) => (ctx.parsed.y == null ? 'no trips' : `${ctx.parsed.y.toFixed(2)} mi/kWh`)
				}
			}
		}
	};
</script>

<Card
	title="Efficiency Over Time"
	subtitle="Monthly average trip efficiency — note the seasonal dip"
	height={320}
>
	<Chart type="line" {data} {options} />
</Card>
