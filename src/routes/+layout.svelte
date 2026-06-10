<script lang="ts">
	let { children } = $props();
</script>

{@render children()}

<style>
	:global(:root) {
		--bg: #f8fafc;
		--surface: #ffffff;
		--text: #111827;
		--muted: #6b7280;
		--border: #e5e7eb;
		--accent: #0d9488;
		color-scheme: light;
	}
	:global(:root[data-theme='dark']) {
		--bg: #0f172a;
		--surface: #1e293b;
		--text: #f1f5f9;
		--muted: #94a3b8;
		--border: #334155;
		--accent: #2dd4bf;
		color-scheme: dark;
	}
	:global(body) {
		margin: 0;
		background: var(--bg);
		color: var(--text);
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		transition:
			background 0.2s ease,
			color 0.2s ease;
	}
</style>
