import { browser } from '$app/environment';

export type Theme = 'light' | 'dark';

// The pre-paint script in app.html has already set data-theme on <html> from
// localStorage (or the OS preference); mirror it into reactive state here so
// there's no flash and no mismatch on hydration.
function initial(): Theme {
	if (!browser) return 'light';
	return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export const theme = $state<{ current: Theme }>({ current: initial() });

export function setTheme(next: Theme): void {
	theme.current = next;
	if (!browser) return;
	document.documentElement.dataset.theme = next;
	try {
		localStorage.setItem('theme', next);
	} catch {
		/* localStorage can throw in private mode — the in-memory state still works */
	}
}

export function toggleTheme(): void {
	setTheme(theme.current === 'dark' ? 'light' : 'dark');
}
