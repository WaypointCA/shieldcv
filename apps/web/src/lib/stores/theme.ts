import { browser } from '$app/environment';
import { writable } from 'svelte/store';

export type ThemeMode = 'dark' | 'light';

const STORAGE_KEY = 'shieldcv-theme';

function getInitialTheme(): ThemeMode {
  if (!browser) {
    return 'dark';
  }

  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' ? 'light' : 'dark';
}

function applyTheme(theme: ThemeMode) {
  if (!browser) {
    return;
  }

  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

function createThemeStore() {
  const { subscribe, set, update } = writable<ThemeMode>(getInitialTheme());

  return {
    subscribe,
    init() {
      const theme = getInitialTheme();
      applyTheme(theme);
      set(theme);
    },
    toggle() {
      update((current) => {
        const next = current === 'dark' ? 'light' : 'dark';
        localStorage.setItem(STORAGE_KEY, next);
        applyTheme(next);
        return next;
      });
    },
  };
}

export const theme = createThemeStore();
