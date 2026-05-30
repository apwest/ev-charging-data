<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		height = 320,
		children
	}: {
		title: string;
		subtitle?: string;
		height?: number;
		children: Snippet;
	} = $props();
</script>

<section class="card">
	<header>
		<h2>{title}</h2>
		{#if subtitle}<p>{subtitle}</p>{/if}
	</header>
	<div class="chart" style:height="{height}px">
		{@render children()}
	</div>
</section>

<style>
	.card {
		background: #fff;
		border: 1px solid #e5e7eb;
		border-radius: 12px;
		padding: 1.25rem;
	}
	header h2 {
		margin: 0;
		font-size: 1.05rem;
	}
	header p {
		margin: 0.25rem 0 0;
		color: #6b7280;
		font-size: 0.85rem;
	}
	.chart {
		position: relative;
		margin-top: 1rem;
	}
</style>
