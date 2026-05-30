import adapter from '@sveltejs/adapter-static';

// On GitHub Pages a project site is served from /<repo>, so the build needs a base
// path. Set BASE_PATH in the deploy workflow (e.g. "/ev-charging-data"); locally it
// stays "" so dev/preview serve from the root.
const base = process.env.BASE_PATH ?? '';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		// Fully prerendered static site for GitHub Pages (no Node server at runtime).
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: '404.html',
			precompress: false,
			strict: true
		}),
		paths: { base }
	}
};

export default config;
