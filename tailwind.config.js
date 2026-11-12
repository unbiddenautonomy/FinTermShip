/** @type {import('tailwindcss').Config} */
const token = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Manrope', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      // Colours come from CSS variables in index.css, so light and dark mode share one set of class names.
      colors: {
        bg: token('bg'),
        surface: token('surface'),
        sunken: token('sunken'),
        line: token('line'),
        ink: { DEFAULT: token('ink'), 2: token('ink-2'), 3: token('ink-3') },
        brand: { DEFAULT: token('brand'), strong: token('brand-strong'), soft: token('brand-soft'), ink: token('brand-ink') },
        good: { DEFAULT: token('good'), strong: token('good-strong'), soft: token('good-soft'), ink: token('good-ink') },
        bad: { DEFAULT: token('bad'), strong: token('bad-strong'), soft: token('bad-soft'), ink: token('bad-ink') },
        sky: { DEFAULT: token('sky'), soft: token('sky-soft'), ink: token('sky-ink') },
        amber: { DEFAULT: token('amber'), soft: token('amber-soft'), ink: token('amber-ink') },
        violet: { DEFAULT: token('violet'), soft: token('violet-soft'), ink: token('violet-ink') },
      },
      boxShadow: {
        press: '0 3px 0 0 rgb(var(--brand-strong))',
        'press-bad': '0 3px 0 0 rgb(var(--bad-ink))',
        'press-line': '0 2px 0 0 rgb(var(--line))',
        card: '0 1px 2px 0 rgb(46 30 90 / 0.04), 0 1px 3px 0 rgb(46 30 90 / 0.06)',
        sheet: '0 -8px 24px -12px rgb(16 24 40 / 0.18)',
      },
      keyframes: {
        sheet: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        pop: { '0%': { transform: 'scale(0.96)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        shake: { '0%,100%': { transform: 'translateX(0)' }, '25%': { transform: 'translateX(-4px)' }, '75%': { transform: 'translateX(4px)' } },
      },
      animation: {
        sheet: 'sheet 200ms cubic-bezier(0.2, 0.8, 0.2, 1)',
        pop: 'pop 180ms ease-out',
        shake: 'shake 250ms ease-in-out',
      },
    },
  },
  plugins: [],
};
