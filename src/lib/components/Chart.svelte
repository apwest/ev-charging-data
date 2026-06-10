<script lang="ts">
	import {
		Chart,
		ScatterController,
		LineController,
		BarController,
		DoughnutController,
		PointElement,
		LineElement,
		BarElement,
		ArcElement,
		LinearScale,
		CategoryScale,
		TimeScale,
		Filler,
		Tooltip,
		Legend,
		Title
	} from 'chart.js';
	import type { ChartConfiguration, ChartType } from 'chart.js';
	import { theme } from '$lib/theme.svelte';

	// Register once for the chart types used across the dashboard.
	Chart.register(
		ScatterController,
		LineController,
		BarController,
		DoughnutController,
		PointElement,
		LineElement,
		BarElement,
		ArcElement,
		LinearScale,
		CategoryScale,
		TimeScale,
		Filler,
		Tooltip,
		Legend,
		Title
	);

	let {
		type,
		data,
		options
	}: {
		type: ChartType;
		data: ChartConfiguration['data'];
		options?: ChartConfiguration['options'];
	} = $props();

	let canvas: HTMLCanvasElement;

	// Chart.js is browser-only; $effect runs client-side after the canvas mounts.
	// Reading theme.current makes this effect re-run on toggle, recreating the
	// chart with theme-appropriate colors (Chart.js bakes colors at construction).
	$effect(() => {
		const dark = theme.current === 'dark';
		Chart.defaults.color = dark ? '#cbd5e1' : '#374151';
		Chart.defaults.borderColor = dark ? 'rgba(148, 163, 184, 0.18)' : 'rgba(17, 24, 39, 0.1)';
		const chart = new Chart(canvas, { type, data, options });
		return () => chart.destroy();
	});
</script>

<canvas bind:this={canvas}></canvas>
