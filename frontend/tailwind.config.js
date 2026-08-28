/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        canvas: 'rgb(var(--nx-canvas) / <alpha-value>)',
        surface: 'rgb(var(--nx-surface) / <alpha-value>)',
        elevated: 'rgb(var(--nx-elevated) / <alpha-value>)',
        ink: 'rgb(var(--nx-ink) / <alpha-value>)',
        muted: 'rgb(var(--nx-muted) / <alpha-value>)',
        faint: 'rgb(var(--nx-faint) / <alpha-value>)',
        line: 'rgb(var(--nx-line) / <alpha-value>)',
        accent: 'rgb(var(--nx-accent) / <alpha-value>)',
        'accent-fg': 'rgb(var(--nx-accent-fg) / <alpha-value>)',
        'accent-soft': 'rgb(var(--nx-accent-soft) / <alpha-value>)',
        ok: 'rgb(var(--nx-ok) / <alpha-value>)',
        warn: 'rgb(var(--nx-warn) / <alpha-value>)',
        danger: 'rgb(var(--nx-danger) / <alpha-value>)',
      },
      boxShadow: {
        card: '0 1px 2px rgb(15 23 42 / 0.06), 0 8px 24px rgb(15 23 42 / 0.06)',
      },
    },
  },
  plugins: [],
}
