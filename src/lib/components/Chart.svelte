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
		Tooltip,
		Legend,
		Title
	} from 'chart.js';
	import type { ChartConfiguration, ChartType } from 'chart.js';

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
	$effect(() => {
		const chart = new Chart(canvas, { type, data, options });
		return () => chart.destroy();
	});
</script>

<canvas bind:this={canvas}></canvas>
