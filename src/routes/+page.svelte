<script lang="ts">
	import { meta, vehicles } from '$lib/data';
	import EfficiencyVsTemp from '$lib/components/EfficiencyVsTemp.svelte';
	import MonthlyEnergyByNetwork from '$lib/components/MonthlyEnergyByNetwork.svelte';
	import MonthlySpend from '$lib/components/MonthlySpend.svelte';
	import EfficiencyOverTime from '$lib/components/EfficiencyOverTime.svelte';
	import NetworkBreakdown from '$lib/components/NetworkBreakdown.svelte';

	const vehicle = vehicles[0];
	const fmt = new Intl.NumberFormat('en-US');

	const stats = [
		{ label: 'Sessions', value: fmt.format(meta.counts.sessions) },
		{ label: 'Trips', value: fmt.format(meta.counts.trips) },
		{ label: 'Energy', value: `${fmt.format(Math.round(meta.totals.energyKwh))} kWh` },
		{ label: 'Miles', value: fmt.format(Math.round(meta.totals.miles)) },
		{ label: 'Total cost', value: `$${fmt.format(Math.round(meta.totals.costUsd))}` },
		{ label: 'Avg efficiency', value: `${meta.avgMiPerKwh?.toFixed(2)} mi/kWh` }
	];
</script>

<svelte:head>
	<title>{vehicle?.name} · Charging Dashboard</title>
</svelte:head>

<main>
	<header class="page-head">
		<h1>{vehicle?.year} {vehicle?.name}</h1>
		<p>Charging data · {meta.dateRange.first} → {meta.dateRange.last}</p>
	</header>

	<section class="stats">
		{#each stats as s (s.label)}
			<div class="stat">
				<span class="value">{s.value}</span>
				<span class="label">{s.label}</span>
			</div>
		{/each}
	</section>

	<section class="charts">
		<div class="span-2"><EfficiencyVsTemp /></div>
		<div class="span-2"><MonthlyEnergyByNetwork /></div>
		<div class="span-2"><MonthlySpend /></div>
		<div><EfficiencyOverTime /></div>
		<div><NetworkBreakdown /></div>
	</section>
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f8fafc;
		color: #111827;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
	}
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}
	.page-head h1 {
		margin: 0;
		font-size: 1.6rem;
	}
	.page-head p {
		margin: 0.25rem 0 0;
		color: #6b7280;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
		margin: 1.5rem 0;
	}
	.stat {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.stat .value {
		font-size: 1.35rem;
		font-weight: 600;
	}
	.stat .label {
		font-size: 0.8rem;
		color: #6b7280;
	}
	.charts {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}
	@media (min-width: 760px) {
		.charts {
			grid-template-columns: 1fr 1fr;
		}
		.charts .span-2 {
			grid-column: span 2;
		}
	}
</style>
