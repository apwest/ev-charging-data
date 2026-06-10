<script lang="ts">
	import { meta, vehicles } from '$lib/data';
	import { overallCentsPerMile } from '$lib/aggregations';
	import EfficiencyVsTemp from '$lib/components/EfficiencyVsTemp.svelte';
	import MonthlyEnergyByNetwork from '$lib/components/MonthlyEnergyByNetwork.svelte';
	import MonthlySpend from '$lib/components/MonthlySpend.svelte';
	import CostPerMile from '$lib/components/CostPerMile.svelte';
	import EfficiencyOverTime from '$lib/components/EfficiencyOverTime.svelte';
	import NetworkBreakdown from '$lib/components/NetworkBreakdown.svelte';
	import { theme, toggleTheme } from '$lib/theme.svelte';

	const vehicle = vehicles[0];
	const fmt = new Intl.NumberFormat('en-US');

	type Stat = { label: string; value: string; unit?: string };

	const cpm = overallCentsPerMile();
	const stats: Stat[] = [
		{ label: 'Sessions', value: fmt.format(meta.counts.sessions) },
		{ label: 'Trips', value: fmt.format(meta.counts.trips) },
		{ label: 'Energy', value: fmt.format(Math.round(meta.totals.energyKwh)), unit: 'kWh' },
		{ label: 'Miles', value: fmt.format(Math.round(meta.totals.miles)), unit: 'mi' },
		{ label: 'Total cost', value: fmt.format(Math.round(meta.totals.costUsd)), unit: 'US$' },
		{ label: 'Avg efficiency', value: meta.avgMiPerKwh?.toFixed(2) ?? '—', unit: 'mi/kWh' },
		{ label: 'Avg cost/mile', value: cpm != null ? cpm.toFixed(2) : '—', unit: '¢/mi' }
	];
</script>

<svelte:head>
	<title>{vehicle?.name} · Charging Dashboard</title>
</svelte:head>

<main>
	<header class="page-head">
		<div class="titles">
			<h1>{vehicle?.year} {vehicle?.name}</h1>
			<p>Charging data · {meta.dateRange.first} → {meta.dateRange.last}</p>
		</div>
		<button
			class="theme-toggle"
			onclick={toggleTheme}
			aria-label="Switch to {theme.current === 'dark' ? 'light' : 'dark'} mode"
			title="Switch to {theme.current === 'dark' ? 'light' : 'dark'} mode"
		>
			{theme.current === 'dark' ? '☀️' : '🌙'}
		</button>
	</header>

	<section class="stats">
		{#each stats as s (s.label)}
			<div class="stat">
				<span class="stat-label">{s.label}</span>
				<span class="stat-value">{s.value}</span>
				{#if s.unit}<span class="stat-unit">{s.unit}</span>{/if}
			</div>
		{/each}
	</section>

	<section class="charts">
		<div class="span-2"><EfficiencyVsTemp /></div>
		<div class="span-2"><EfficiencyOverTime /></div>
		<div class="span-2"><MonthlyEnergyByNetwork /></div>
		<div class="span-2"><MonthlySpend /></div>
		<div><CostPerMile /></div>
		<div><NetworkBreakdown /></div>
	</section>
</main>

<style>
	main {
		max-width: 960px;
		margin: 0 auto;
		padding: 2rem 1.25rem 4rem;
	}
	.page-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}
	.page-head h1 {
		margin: 0;
		font-size: 1.6rem;
	}
	.page-head p {
		margin: 0.25rem 0 0;
		color: var(--muted);
	}
	.theme-toggle {
		flex: none;
		width: 2.4rem;
		height: 2.4rem;
		padding: 0;
		border: 1px solid var(--border);
		background: var(--surface);
		color: var(--text);
		border-radius: 10px;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		transition: border-color 0.2s ease;
	}
	.theme-toggle:hover {
		border-color: var(--accent);
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: 0.75rem;
		margin: 1.5rem 0;
	}
	.stat {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 12px;
		padding: 0.85rem 1rem;
		display: flex;
		flex-direction: column;
	}
	.stat-label {
		font-size: 0.72rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--muted);
	}
	/* value on its own line, centered */
	.stat-value {
		text-align: center;
		font-size: 1.9rem;
		font-weight: 700;
		color: var(--text);
		line-height: 1.1;
		margin: 0.2rem 0 0.05rem;
	}
	/* unit just below the value, right-aligned */
	.stat-unit {
		align-self: flex-end;
		font-size: 0.8rem;
		font-weight: 500;
		color: var(--muted);
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
