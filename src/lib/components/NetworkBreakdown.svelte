<script lang="ts">
	import Chart from './Chart.svelte';
	import Card from './Card.svelte';
	import { byNetwork, networkColor } from '$lib/aggregations';
	import type { ChartConfiguration } from 'chart.js';

	const totals = byNetwork();
	const totalKwh = totals.reduce((a, t) => a + t.energyKwh, 0);

	const data: ChartConfiguration<'doughnut'>['data'] = {
		labels: totals.map((t) => t.network),
		datasets: [
			{
				data: totals.map((t) => t.energyKwh),
				backgroundColor: totals.map((t) => networkColor(t.network)),
				borderWidth: 0
			}
		]
	};

	const options: ChartConfiguration<'doughnut'>['options'] = {
		responsive: true,
		maintainAspectRatio: false,
		cutout: '58%',
		plugins: {
			legend: { position: 'bottom' },
			tooltip: {
				callbacks: {
					label: (ctx) => {
						const kwh = ctx.parsed as number;
						const pct = totalKwh ? ((kwh / totalKwh) * 100).toFixed(0) : '0';
						return `${ctx.label}: ${kwh.toLocaleString()} kWh (${pct}%)`;
					}
				}
			}
		}
	};
</script>

<Card title="Energy by Network" subtitle="{totalKwh.toLocaleString()} kWh total" height={300}>
	<Chart type="doughnut" {data} {options} />
</Card>
