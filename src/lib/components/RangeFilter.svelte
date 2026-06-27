<script lang="ts">
	import { RANGE_KEYS, RANGE_LABELS, rangeState, setRange } from '$lib/range.svelte';
</script>

<div class="range" role="group" aria-label="Time range">
	{#each RANGE_KEYS as key (key)}
		<button
			class="seg"
			class:active={rangeState.current === key}
			aria-pressed={rangeState.current === key}
			onclick={() => setRange(key)}
		>
			{RANGE_LABELS[key]}
		</button>
	{/each}
</div>

<style>
	.range {
		display: inline-flex;
		flex-wrap: wrap;
		gap: 2px;
		padding: 3px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: 10px;
	}
	.seg {
		border: 0;
		background: transparent;
		color: var(--muted);
		font-size: 0.8rem;
		font-weight: 600;
		padding: 0.35rem 0.7rem;
		border-radius: 7px;
		cursor: pointer;
		line-height: 1;
		transition:
			background 0.15s ease,
			color 0.15s ease;
	}
	.seg:hover {
		color: var(--text);
	}
	.seg.active {
		background: var(--accent);
		color: #fff;
	}
</style>
