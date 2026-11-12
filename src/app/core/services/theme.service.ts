import { Injectable, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

@Injectable({
  providedIn: 'root'
})
export class ThemeService {
  private readonly THEME_KEY = 'ebuyzy_theme';

  readonly isDarkMode = signal<boolean>(this.getInitialTheme());

  constructor() {
    this.applyTheme(this.isDarkMode());
  }

  private getInitialTheme(): boolean {
    try {
      const stored = localStorage.getItem(this.THEME_KEY);
      if (stored === 'dark') return true;
      if (stored === 'light') return false;

      // Fallback to system preference
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch {
      // ignore
    }
    return false;
  }

  toggleTheme(): void {
    const next = !this.isDarkMode();
    this.setTheme(next ? 'dark' : 'light');
  }

  setTheme(mode: ThemeMode): void {
    const isDark = mode === 'dark';
    this.isDarkMode.set(isDark);
    try {
      localStorage.setItem(this.THEME_KEY, mode);
    } catch {
      // ignore
    }
    this.applyTheme(isDark);
  }

  private applyTheme(isDark: boolean): void {
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }
}

